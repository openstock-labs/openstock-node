export type Metadata = Record<string, string | number | boolean | null>

export interface Page<T> {
  data: T[]
  total: number
  limit: number
  offset: number
}

export interface PageParams {
  /** Between 1 and 100. Defaults to 20. */
  limit?: number
  offset?: number
}

// Checkout sessions

export type CheckoutSessionStatus = 'pending' | 'completed' | 'cancelled' | 'expired'

export interface LineItem {
  name: string
  /** Unit price in the store currency. */
  price: number
  quantity?: number
  description?: string
  image_url?: string
}

export interface ProductItem {
  id: string
  quantity?: number
  variant_id?: string
  /** Matches a variant by ID or case-insensitive name. */
  variant_name_or_id?: string
}

interface CreateCheckoutSessionBase {
  customer_email?: string
  customer_name?: string
  success_url?: string
  cancel_url?: string
  expired_url?: string
  /** Receives `checkout.session.*` events for this session. */
  webhook_url?: string
  /** Takes precedence over `expires_in_hours`. */
  expires_in_seconds?: number
  /** Defaults to 24. */
  expires_in_hours?: number
  metadata?: Metadata
  client_reference_id?: string
  hide_navbar?: boolean
  hide_footer?: boolean
  disable_coupons?: boolean
  disable_gift_cards?: boolean
}

/** Pass custom `line_items` or store `product_ids`, not both. */
export type CreateCheckoutSessionParams = CreateCheckoutSessionBase &
  (
    | { line_items: LineItem[]; product_ids?: never }
    | { product_ids: ProductItem[]; line_items?: never }
  )

export interface CreatedCheckoutSession {
  id: string
  url: string
  status: CheckoutSessionStatus
  total_amount: number
  currency: string
  expires_at: string
  line_items: number
}

export interface CheckoutSessionSummary {
  id: string
  status: CheckoutSessionStatus
  total_amount: number
  currency: string
  customer_email: string | null
  payment_method: string | null
  created_at: string
  completed_at: string | null
}

export interface CheckoutSession {
  id: string
  url: string
  status: CheckoutSessionStatus
  total_amount: number
  currency: string
  customer_email: string | null
  customer_name: string | null
  payment_method: string | null
  metadata: Metadata
  client_reference_id: string | null
  line_items: Array<{
    name: string
    description?: string
    price: number
    quantity: number
    image?: string | null
    metadata?: Metadata
  }>
  expires_at: string
  created_at: string
}

export interface ListCheckoutSessionsParams extends PageParams {
  status?: CheckoutSessionStatus
}

// Withdrawals

export type WithdrawalCurrency = 'BTC' | 'LTC' | 'ETH'
export type WithdrawalStatus = 'pending' | 'completed' | 'failed'

export interface Wallet {
  currency: WithdrawalCurrency
  address: string
  balance: number
  pending_balance: number
  min_withdrawal: number
}

export interface CreateWithdrawalParams {
  currency: WithdrawalCurrency
  /** Minimums: BTC 0.0001, LTC 0.001, ETH 0.001. */
  amount: number
  to_address: string
  /** Receives `withdrawal.completed` or `withdrawal.failed`. */
  webhook_url?: string
  metadata?: Metadata
}

export interface Withdrawal {
  id: string
  status: WithdrawalStatus
  amount: number
  currency: WithdrawalCurrency
  to_address: string
  fee_amount: number
  net_amount: number
  tx_hash?: string | null
  metadata?: Metadata | null
  created_at: string
  completed_at?: string | null
}

export interface ListWithdrawalsParams extends PageParams {
  status?: WithdrawalStatus
}

// Customer balance

export interface Customer {
  id: string
  email: string
  name: string | null
  balance: number
  total_spent: number
  order_count: number
  created_at: string
  updated_at: string
}

export interface ListCustomersParams extends PageParams {
  min_balance?: number
  search?: string
}

export interface BalanceChangeParams {
  email: string
  /** Positive amount. */
  amount: number
  reason?: string
  metadata?: Metadata
}

export interface BalanceChange {
  success: boolean
  customer: { id: string; email: string; balance: number }
  transaction: { type: 'credit' | 'debit'; amount: number; reason: string }
}

export interface BalanceTransaction {
  id: string
  type: 'credit' | 'debit'
  amount: number
  reason: string
  metadata: Metadata
  created_at: string
}

export interface ListTransactionsParams extends PageParams {
  email: string
  type?: 'credit' | 'debit'
}

// Webhooks

export interface CheckoutSessionEventData {
  id: string
  status: 'completed' | 'cancelled' | 'expired'
  total_amount: number
  currency: string
  customer_email: string | null
  payment_method: string | null
  line_items: Array<{ name: string; price: number; quantity: number; description: string | null }>
  metadata: Metadata
  client_reference_id: string | null
  completed_at?: string
}

export interface WithdrawalEventData {
  id: string
  status: WithdrawalStatus
  amount: number
  currency: WithdrawalCurrency
  to_address: string
  tx_hash: string | null
  fee_amount: number | null
  net_amount: number | null
  metadata: Metadata | null
  created_at: string
  completed_at: string | null
}

export type WebhookEvent =
  | {
      event: 'checkout.session.completed' | 'checkout.session.cancelled' | 'checkout.session.expired'
      data: CheckoutSessionEventData
      created: string
    }
  | {
      event: 'withdrawal.completed' | 'withdrawal.failed'
      data: WithdrawalEventData
      created: string
    }
