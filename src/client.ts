import type {
  BalanceChange,
  BalanceChangeParams,
  BalanceTransaction,
  CheckoutSession,
  CheckoutSessionSummary,
  CreateCheckoutSessionParams,
  CreatedCheckoutSession,
  CreateWithdrawalParams,
  Customer,
  ListCheckoutSessionsParams,
  ListCustomersParams,
  ListTransactionsParams,
  ListWithdrawalsParams,
  Page,
  Wallet,
  Withdrawal,
} from './types.js'

export interface OpenStockOptions {
  /** Defaults to `https://openstock.dev`. */
  baseUrl?: string
  /** Request timeout in milliseconds. Defaults to 30 000. */
  timeout?: number
  /** Custom fetch implementation, for runtimes or tests that need one. */
  fetch?: typeof fetch
}

/** Thrown for any non-2xx response. `code` is the API's `error` field, e.g. `rate_limit_exceeded`. */
export class OpenStockError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfter?: number

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message)
    this.name = 'OpenStockError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

type Query = Record<string, string | number | boolean | undefined>

export class OpenStock {
  readonly checkout: CheckoutSessions
  readonly withdrawals: Withdrawals
  readonly customers: Customers

  readonly #apiKey: string
  readonly #baseUrl: string
  readonly #timeout: number
  readonly #fetch: typeof fetch

  constructor(apiKey: string, options: OpenStockOptions = {}) {
    if (!apiKey?.startsWith('sk_')) {
      throw new Error('OpenStock: pass a secret API key (sk_…). Keep it on your server.')
    }
    this.#apiKey = apiKey
    this.#baseUrl = (options.baseUrl ?? 'https://openstock.dev').replace(/\/+$/, '')
    this.#timeout = options.timeout ?? 30_000
    this.#fetch = options.fetch ?? globalThis.fetch
    this.checkout = new CheckoutSessions(this)
    this.withdrawals = new Withdrawals(this)
    this.customers = new Customers(this)
  }

  /** @internal */
  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown, query?: Query): Promise<T> {
    const url = new URL(this.#baseUrl + path)
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }
    const response = await this.#fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.#apiKey}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.#timeout),
    })
    const text = await response.text()
    const json = text ? safeJson(text) : null
    if (!response.ok) {
      const error = (json ?? {}) as { error?: string; message?: string; retry_after?: number }
      throw new OpenStockError(
        response.status,
        error.error ?? 'http_error',
        error.message ?? `OpenStock API returned HTTP ${response.status}`,
        error.retry_after,
      )
    }
    return json as T
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

const id = (value: string) => encodeURIComponent(value)

class CheckoutSessions {
  constructor(private readonly client: OpenStock) {}

  /** Create a hosted checkout session and redirect the customer to `url`. */
  create(params: CreateCheckoutSessionParams) {
    return this.client.request<CreatedCheckoutSession>('POST', '/api/checkout-api/sessions', params)
  }

  list(params: ListCheckoutSessionsParams = {}) {
    return this.client.request<Page<CheckoutSessionSummary>>(
      'GET',
      '/api/checkout-api/sessions',
      undefined,
      { ...params },
    )
  }

  retrieve(sessionId: string) {
    return this.client.request<CheckoutSession>('GET', `/api/checkout-api/sessions/${id(sessionId)}`)
  }

  cancel(sessionId: string) {
    return this.client.request<{ id: string; status: 'cancelled' }>(
      'POST',
      `/api/checkout-api/sessions/${id(sessionId)}/cancel`,
    )
  }
}

class Withdrawals {
  constructor(private readonly client: OpenStock) {}

  /** Store crypto wallets with balances and minimum withdrawal amounts. */
  async wallets() {
    const { wallets } = await this.client.request<{ wallets: Wallet[] }>(
      'GET',
      '/api/withdrawal-api/wallets',
    )
    return wallets
  }

  create(params: CreateWithdrawalParams) {
    return this.client.request<Withdrawal>('POST', '/api/withdrawal-api/withdrawals', params)
  }

  list(params: ListWithdrawalsParams = {}) {
    return this.client.request<Page<Withdrawal>>(
      'GET',
      '/api/withdrawal-api/withdrawals',
      undefined,
      { ...params },
    )
  }

  retrieve(withdrawalId: string) {
    return this.client.request<Withdrawal>(
      'GET',
      `/api/withdrawal-api/withdrawals/${id(withdrawalId)}`,
    )
  }
}

class Customers {
  constructor(private readonly client: OpenStock) {}

  list(params: ListCustomersParams = {}) {
    return this.client.request<Page<Customer>>(
      'GET',
      '/api/customer-balance-api/customers',
      undefined,
      { ...params },
    )
  }

  /** Emails always go in the request body, never the URL. */
  retrieve(email: string) {
    return this.client.request<Customer>('POST', '/api/customer-balance-api/customers/info', {
      email,
    })
  }

  addBalance(params: BalanceChangeParams) {
    return this.client.request<BalanceChange>(
      'POST',
      '/api/customer-balance-api/customers/add-balance',
      params,
    )
  }

  deductBalance(params: BalanceChangeParams) {
    return this.client.request<BalanceChange>(
      'POST',
      '/api/customer-balance-api/customers/deduct-balance',
      params,
    )
  }

  transactions(params: ListTransactionsParams) {
    return this.client.request<Page<BalanceTransaction>>(
      'POST',
      '/api/customer-balance-api/customers/transactions',
      params,
    )
  }
}
