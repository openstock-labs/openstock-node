<p align="center">
  <a href="https://openstock.dev"><img src="https://openstock.dev/brand/mark.png" alt="OpenStock" width="64" height="64"></a>
</p>

<h1 align="center">OpenStock Node.js SDK</h1>

<p align="center">
  Typed client for the <a href="https://docs.openstock.dev">OpenStock API</a>: hosted checkout sessions, crypto withdrawals, customer balances and webhook verification.
</p>

<p align="center">
  <a href="https://github.com/openstock-labs/openstock-node/actions/workflows/ci.yml"><img src="https://github.com/openstock-labs/openstock-node/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
</p>

[OpenStock](https://openstock.dev) is a hosted platform for selling digital products: software license keys, downloadable files, accounts and Discord roles, with automated delivery and payments through your own Stripe and PayPal accounts or crypto. This SDK wraps its public REST API.

- Zero runtime dependencies, uses the built-in `fetch`
- Full TypeScript types for every request, response and webhook event
- Webhook signature verification with secret-rotation support
- Node.js 18.17 or newer

## Install

```bash
npm install github:openstock-labs/openstock-node
```

## Quick start

Create a secret API key in your OpenStock dashboard under **Integrations → API keys**. Keep it on your server; never ship an `sk_` key to a browser.

```ts
import { OpenStock } from '@openstock/node'

const openstock = new OpenStock(process.env.OPENSTOCK_SECRET_KEY!)

const session = await openstock.checkout.create({
  product_ids: [{ id: 'prod_123', quantity: 1 }],
  customer_email: 'jane@example.com',
  success_url: 'https://example.com/thanks',
  cancel_url: 'https://example.com/cart',
  webhook_url: 'https://example.com/webhooks/openstock',
  metadata: { orderNumber: 'ORD-4821' },
})

// Send the customer to OpenStock's hosted checkout.
redirect(session.url)
```

Pass `product_ids` to sell products from your store (stock is checked and delivery is automatic), or `line_items` for custom priced items. Not both.

## Webhooks

OpenStock signs every webhook with your store's signing secret:

```
x-webhook-signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
```

Verify against the **raw** body, before any JSON parsing:

```ts
import express from 'express'
import { verifyWebhook, WebhookVerificationError } from '@openstock/node'

const app = express()

app.post('/webhooks/openstock', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = verifyWebhook(
      req.body,
      req.header('x-webhook-signature'),
      process.env.OPENSTOCK_WEBHOOK_SECRET!,
    )
    if (event.event === 'checkout.session.completed') {
      // Fulfil event.data.client_reference_id / event.data.metadata here.
    }
    res.sendStatus(200)
  } catch (error) {
    if (error instanceof WebhookVerificationError) return res.sendStatus(400)
    throw error
  }
})
```

Signatures older than five minutes are rejected (change with `{ tolerance }`). While you rotate the secret, OpenStock sends two `v1` signatures for 24 hours and either one passes.

| Event | Sent when |
| --- | --- |
| `checkout.session.completed` | The customer paid |
| `checkout.session.cancelled` | The session was cancelled |
| `checkout.session.expired` | The session expired unpaid |
| `withdrawal.completed` | A crypto withdrawal was broadcast |
| `withdrawal.failed` | A crypto withdrawal failed |

## API

### Checkout sessions

```ts
await openstock.checkout.create(params)
await openstock.checkout.list({ status: 'completed', limit: 50 })
await openstock.checkout.retrieve('cs_…')
await openstock.checkout.cancel('cs_…')
```

### Crypto withdrawals

Requires a key with the `withdrawal_api` permission (Premium plan).

```ts
const wallets = await openstock.withdrawals.wallets()
await openstock.withdrawals.create({ currency: 'LTC', amount: 0.5, to_address: 'ltc1q…' })
await openstock.withdrawals.list({ status: 'pending' })
await openstock.withdrawals.retrieve('wd_…')
```

### Customer balances

Requires a key with the `customer_balance_api` permission (Premium plan). Emails are always sent in the request body, never the URL.

```ts
await openstock.customers.list({ min_balance: 1 })
await openstock.customers.retrieve('jane@example.com')
await openstock.customers.addBalance({ email: 'jane@example.com', amount: 10, reason: 'Referral reward' })
await openstock.customers.deductBalance({ email: 'jane@example.com', amount: 5 })
await openstock.customers.transactions({ email: 'jane@example.com', type: 'credit' })
```

## Errors

Every non-2xx response throws an `OpenStockError` with the HTTP `status`, the API's error `code` and, for rate limits, `retryAfter` in seconds.

```ts
import { OpenStockError } from '@openstock/node'

try {
  await openstock.checkout.create(params)
} catch (error) {
  if (error instanceof OpenStockError && error.code === 'rate_limit_exceeded') {
    console.log(`Retry in ${error.retryAfter}s`)
  }
}
```

Write endpoints are limited to 100 requests per hour per key.

## Links

- [API reference](https://docs.openstock.dev) and [OpenAPI spec](https://openstock.dev/openapi.json)
- [Examples](https://github.com/openstock-labs/examples)
- [OpenStock](https://openstock.dev) · [Pricing](https://openstock.dev/pricing) · [Discord](https://discord.gg/openstock)

## License

MIT
