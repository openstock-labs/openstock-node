import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookEvent } from './types.js'

export const SIGNATURE_HEADER = 'x-webhook-signature'

export interface VerifyWebhookOptions {
  /** Maximum age of the signature in seconds. Defaults to 300. */
  tolerance?: number
  /** Current time in unix seconds, for tests. */
  now?: number
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookVerificationError'
  }
}

function parseHeader(header: string) {
  let timestamp: number | undefined
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=', 2)
    if (key === 't') timestamp = Number(value)
    else if (key === 'v1' && value) signatures.push(value)
  }
  return { timestamp, signatures }
}

function matches(expected: string, candidate: string) {
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(candidate, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Verifies an OpenStock webhook and returns the parsed event.
 *
 * Pass the raw request body exactly as received; re-serialized JSON will not match.
 * During a secret rotation the header carries two `v1` signatures and either is accepted.
 */
export function verifyWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
  options: VerifyWebhookOptions = {},
): WebhookEvent {
  if (!signatureHeader) throw new WebhookVerificationError(`Missing ${SIGNATURE_HEADER} header`)
  const { timestamp, signatures } = parseHeader(signatureHeader)
  if (!timestamp || !Number.isFinite(timestamp) || !signatures.length) {
    throw new WebhookVerificationError('Malformed signature header')
  }
  const now = options.now ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestamp) > (options.tolerance ?? 300)) {
    throw new WebhookVerificationError('Signature timestamp is outside the tolerance window')
  }
  const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')
  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
  if (!signatures.some((signature) => matches(expected, signature))) {
    throw new WebhookVerificationError('No signature matches the webhook secret')
  }
  return JSON.parse(body) as WebhookEvent
}
