import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { OpenStock, OpenStockError, verifyWebhook, WebhookVerificationError } from '../src/index.js'

function mockFetch(status: number, body: unknown, seen: Request[] = []) {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    seen.push(new Request(input, init))
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
}

test('rejects publishable or missing keys', () => {
  assert.throws(() => new OpenStock('pk_live_123'))
})

test('creates a checkout session with bearer auth and a JSON body', async () => {
  const seen: Request[] = []
  const client = new OpenStock('sk_test', {
    fetch: mockFetch(201, { id: 'cs_1', url: 'https://x/checkout?session=cs_1' }, seen),
  })
  const session = await client.checkout.create({
    line_items: [{ name: 'Premium License', price: 29.99 }],
    success_url: 'https://example.com/success',
  })
  assert.equal(session.id, 'cs_1')
  const request = seen[0]
  assert.equal(request.method, 'POST')
  assert.equal(new URL(request.url).pathname, '/api/checkout-api/sessions')
  assert.equal(request.headers.get('authorization'), 'Bearer sk_test')
  assert.deepEqual(await request.json(), {
    line_items: [{ name: 'Premium License', price: 29.99 }],
    success_url: 'https://example.com/success',
  })
})

test('list endpoints send pagination as query parameters', async () => {
  const seen: Request[] = []
  const client = new OpenStock('sk_test', {
    fetch: mockFetch(200, { data: [], total: 0, limit: 5, offset: 0 }, seen),
  })
  await client.checkout.list({ limit: 5, status: 'completed' })
  const url = new URL(seen[0].url)
  assert.equal(url.searchParams.get('limit'), '5')
  assert.equal(url.searchParams.get('status'), 'completed')
  assert.equal(url.searchParams.has('offset'), false)
})

test('customer lookups keep the email out of the URL', async () => {
  const seen: Request[] = []
  const client = new OpenStock('sk_test', { fetch: mockFetch(200, { email: 'a@b.co' }, seen) })
  await client.customers.retrieve('a@b.co')
  assert.equal(seen[0].url.includes('a@b.co'), false)
  assert.deepEqual(await seen[0].json(), { email: 'a@b.co' })
})

test('API errors become OpenStockError with code and retry_after', async () => {
  const client = new OpenStock('sk_test', {
    fetch: mockFetch(429, {
      error: 'rate_limit_exceeded',
      message: 'Rate limit exceeded.',
      retry_after: 120,
    }),
  })
  await assert.rejects(client.withdrawals.list(), (error: unknown) => {
    assert.ok(error instanceof OpenStockError)
    assert.equal(error.status, 429)
    assert.equal(error.code, 'rate_limit_exceeded')
    assert.equal(error.retryAfter, 120)
    return true
  })
})

const secret = 'whsec_test'
const body = JSON.stringify({ event: 'checkout.session.completed', data: { id: 'cs_1' } })
const sign = (key: string, t: number) =>
  createHmac('sha256', key).update(`${t}.${body}`).digest('hex')

test('verifies a valid webhook signature', () => {
  const t = 1_800_000_000
  const event = verifyWebhook(body, `t=${t},v1=${sign(secret, t)}`, secret, { now: t + 10 })
  assert.equal(event.event, 'checkout.session.completed')
})

test('accepts either signature during secret rotation', () => {
  const t = 1_800_000_000
  const header = `t=${t},v1=${sign('whsec_new', t)},v1=${sign(secret, t)}`
  assert.doesNotThrow(() => verifyWebhook(body, header, secret, { now: t }))
})

test('rejects tampered bodies, wrong secrets and stale timestamps', () => {
  const t = 1_800_000_000
  const header = `t=${t},v1=${sign(secret, t)}`
  assert.throws(() => verifyWebhook(`${body} `, header, secret, { now: t }), WebhookVerificationError)
  assert.throws(() => verifyWebhook(body, header, 'whsec_other', { now: t }), WebhookVerificationError)
  assert.throws(() => verifyWebhook(body, header, secret, { now: t + 301 }), WebhookVerificationError)
  assert.throws(() => verifyWebhook(body, null, secret), WebhookVerificationError)
})
