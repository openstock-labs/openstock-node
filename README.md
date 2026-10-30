# openstock-node

Node.js client for the [OpenStock](https://openstock.dev) API. It covers checkout sessions, crypto withdrawals, customer balances and webhook verification. No dependencies, works on Node 18.17+.

```bash
npm install github:openstock-labs/openstock-node
```

## Usage

Create a secret key in the dashboard under Integrations > API keys. It starts with `sk_` and should only live on your server.

```ts
import { OpenStock } from '@openstock/node'

const openstock = new OpenStock(process.env.OPENSTOCK_SECRET_KEY!)

const session = await openstock.checkout.create({
  product_ids: [{ id: 'prod_123', quantity: 1 }],
  customer_email: 'jane@example.com',
  success_url: 'https://example.com/thanks',
  cancel_url: 'https://example.com/cart',
})

// send the buyer to session.url
```

Use `product_ids` to sell products from your store (stock and delivery are handled for you) or `line_items` for custom items with your own prices.

Other calls:

```ts
await openstock.checkout.list({ status: 'completed' })
await openstock.checkout.retrieve('cs_123')
await openstock.checkout.cancel('cs_123')

// needs a key with the withdrawal_api permission
await openstock.withdrawals.wallets()
await openstock.withdrawals.create({ currency: 'LTC', amount: 0.5, to_address: 'ltc1q...' })

// needs a key with the customer_balance_api permission
await openstock.customers.retrieve('jane@example.com')
await openstock.customers.addBalance({ email: 'jane@example.com', amount: 10, reason: 'Referral' })
```

Failed requests throw an `OpenStockError` with `status`, `code` and, when rate limited, `retryAfter`. Write endpoints allow 100 requests per hour per key.

## Webhooks

OpenStock signs webhooks with the secret shown on the API keys page. Verify them against the raw request body:

```ts
import express from 'express'
import { verifyWebhook } from '@openstock/node'

const app = express()

app.post('/webhooks/openstock', express.raw({ type: 'application/json' }), (req, res) => {
  let event
  try {
    event = verifyWebhook(req.body, req.header('x-webhook-signature'), process.env.OPENSTOCK_WEBHOOK_SECRET!)
  } catch {
    return res.sendStatus(400)
  }

  if (event.event === 'checkout.session.completed') {
    // fulfil the order
  }
  res.sendStatus(200)
})
```

Events: `checkout.session.completed`, `checkout.session.cancelled`, `checkout.session.expired`, `withdrawal.completed` and `withdrawal.failed`.

Signatures older than 5 minutes are rejected; pass `{ tolerance }` to change that. While you rotate the secret, both the old and new signatures are accepted for 24 hours.

## Development

```bash
npm install
npm test
npm run build
```

Full API reference: [docs.openstock.dev](https://docs.openstock.dev). MIT license.
