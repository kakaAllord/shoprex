import { API_BASE_URL, requireApiBaseUrl, resolveApiUrl } from './apiConfig';

/** Error envelope shared by every Shoprex backend response. */
export class ShoprexApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ShoprexApiError';
  }

  /** The device was revoked, or the session expired. Sign out and start over. */
  get isSessionOver(): boolean {
    return this.statusCode === 401;
  }

  /** The backend says this person may not do this. Not a thing to retry. */
  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

}

/** Backend health as reported by GET /health/ready. */
export interface BackendHealth {
  status: string;
  service: string;
  version: string;
  environment: string;
  timezone: string;
  databaseStatus: string;
  databaseLatencyMs: number | null;
  databaseMessage: string | null;
}

export function isHealthy(health: BackendHealth): boolean {
  return health.status === 'ok' && health.databaseStatus === 'ok';
}

function toBackendHealth(json: Record<string, unknown>): BackendHealth {
  const database = (json.database ?? {}) as Record<string, unknown>;

  return {
    status: (json.status as string) ?? 'error',
    service: (json.service as string) ?? 'unknown',
    version: (json.version as string) ?? '0.0.0',
    environment: (json.environment as string) ?? 'unknown',
    timezone: (json.timezone as string) ?? 'unknown',
    databaseStatus: (database.status as string) ?? 'error',
    databaseLatencyMs: (database.latencyMs as number | null) ?? null,
    databaseMessage: (database.message as string | null) ?? null,
  };
}

// --- What the selling flow reads and writes --------------------------------

export type UserPermission = 'SELL' | 'RECEIVE_STOCK' | 'VIEW_STOCK' | 'VIEW_REPORTS';

export interface Profile {
  id: string;
  fullName: string;
  role: 'PLATFORM_ADMIN' | 'OWNER' | 'MANAGER' | 'WORKER';
  businessId: string | null;
  businessName: string | null;
  permissions: UserPermission[];
  deviceId: string | null;
  branchIds: string[];
}

export interface Session {
  accessToken: string;
  user: Profile;
}

/** What the phone learns when it binds itself. No session, no secret. */
export interface EnrolledDevice {
  deviceId: string;
  deviceName: string;
  branchName: string;
  businessName: string;
}

/**
 * One name on the sign-in screen. An id and a name and nothing else — the
 * backend deliberately returns no credential here.
 */
export interface SignInOption {
  userId: string;
  fullName: string;
}

export interface ProductUnit {
  id: string;
  name: string;
  priceTzs: number | null;
  factorToBase: number;
  isBaseUnit: boolean;
}

export interface Product {
  id: string;
  name: string;
  units: ProductUnit[];
  baseUnitId: string;
  barcodes: string[];
}

export interface PaymentMethod {
  id: string;
  name: string;
  kind: 'CASH' | 'MOBILE_MONEY' | 'BANK' | 'DEBT' | 'OTHER';
  sortOrder: number;
}

export interface SaleLine {
  productName: string;
  unitName: string;
  quantity: number;
  unitPriceTzs: number;
  lineTotalTzs: number;
  /** How much of this line the records could not cover, in base units. */
  shortfallNormalized: number;
}

export interface SalePayment {
  methodName: string;
  methodKind: string;
  amountTzs: number;
  cashReceivedTzs: number | null;
  changeTzs: number | null;
  debtorName: string | null;
}

export interface Sale {
  id: string;
  branchId: string;
  soldByName: string;
  totalTzs: number;
  changeTzs: number;
  debtTzs: number;
  lines: SaleLine[];
  payments: SalePayment[];
  /**
   * At least one line took more than the branch had on record. The sale went
   * through — this is the shop being told its count is wrong, not the seller
   * being told off.
   */
  hasStockInconsistency: boolean;
  createdAt: string;
}

export interface NewProductInput {
  name: string;
  units: Array<{ name: string; priceTzs?: number }>;
  barcode?: string;
}

/** One packaging of one product, as the branch physically holds it. */
export interface StockPackage {
  unitId: string;
  unitName: string;
  /** Negative when the shop has sold more than it recorded receiving. */
  quantity: number;
  factorToBase: number;
}

export interface ProductStock {
  productId: string;
  productName: string;
  branchId: string;
  /** Largest packaging first — `5 Cartons + 5 Pieces`. Never rolled up. */
  packages: StockPackage[];
  normalizedQuantity: number;
  baseUnitId: string;
  baseUnitName: string;
}

export interface ReceiveStockInput {
  lines: Array<{
    productId: string;
    productUnitId: string;
    quantity: number;
    unitCostTzs?: number;
  }>;
  note?: string;
}

export interface StockReceiptLine {
  productId: string;
  productName: string;
  unitId: string;
  unitName: string;
  quantity: number;
  /** Snapshotted by the backend, so a later factor change cannot rewrite it. */
  normalizedQuantity: number;
  unitCostTzs: number | null;
}

export interface StockReceipt {
  id: string;
  branchId: string;
  receivedByName: string;
  note: string | null;
  lines: StockReceiptLine[];
  createdAt: string;
}

export interface CompleteSaleInput {
  idempotencyKey: string;
  lines: Array<{ productId: string; productUnitId: string; quantity: number }>;
  payments: Array<{
    paymentMethodId: string;
    amountTzs: number;
    cashReceivedTzs?: number;
    debtorName?: string;
  }>;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  accessToken?: string | null;
}

type Query = Record<string, string | number | undefined>;

/**
 * The single gateway between the Android app and the Shoprex backend.
 *
 * Shoprex V1 is online-only: there is no local queue, outbox, or background
 * synchronisation. Every authoritative action goes through this client, and
 * every authoritative *answer* comes from the backend — the phone computes
 * totals only so the seller can see them while deciding.
 */
export class ApiClient {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private accessToken: string | null;

  readonly baseUrl: string;

  constructor({ baseUrl, fetchFn, timeoutMs = 10_000, accessToken = null }: ApiClientOptions = {}) {
    // Fails here rather than at the first request, so a misconfigured build is
    // obvious immediately.
    this.baseUrl = requireApiBaseUrl(baseUrl ?? API_BASE_URL);
    this.fetchFn = fetchFn ?? fetch;
    this.timeoutMs = timeoutMs;
    this.accessToken = accessToken;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; query?: Query; tolerate503?: boolean } = {},
  ): Promise<Record<string, unknown> | unknown[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(
        resolveApiUrl(withQuery(path, options.query), this.baseUrl),
        {
          method,
          headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
          },
          ...(options.body ? { body: JSON.stringify(options.body) } : {}),
          signal: controller.signal,
        },
      );

      const text = await response.text();
      const body = (text ? JSON.parse(text) : {}) as Record<string, unknown> | unknown[];

      // 503 from /health/ready still carries a valid health payload.
      if (response.status >= 400 && !(options.tolerate503 && response.status === 503)) {
        const message = (body as Record<string, unknown>).message;

        throw new ShoprexApiError(
          response.status,
          Array.isArray(message) ? message.join(', ') : ((message as string) ?? 'Request failed'),
        );
      }

      return body;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getJson(path: string): Promise<Record<string, unknown>> {
    return (await this.send('GET', path, { tolerate503: true })) as Record<string, unknown>;
  }

  async fetchHealth(): Promise<BackendHealth> {
    return toBackendHealth(await this.getJson('/health/ready'));
  }

  // --- Enrollment and sign-in ---------------------------------------------

  /**
   * Redeems the one-time code the owner handed over. The backend mints the
   * `device_id` and binds this installation to one business and one **branch**
   * — the phone never chooses its own id, and it is not tied to one person.
   */
  async enrollDevice(code: string): Promise<EnrolledDevice> {
    const body = (await this.send('POST', '/devices/enroll', { body: { code } })) as Record<
      string,
      unknown
    >;

    return {
      deviceId: body.deviceId as string,
      deviceName: (body.deviceName as string) ?? '',
      branchName: (body.branchName as string) ?? '',
      businessName: (body.businessName as string) ?? '',
    };
  }

  /**
   * Who may sign in on this phone: everyone assigned to its branch, plus the
   * owner. Called before anybody has signed in, so it carries no token — the
   * `device_id` is what identifies the caller.
   */
  async listSignInOptions(deviceId: string): Promise<SignInOption[]> {
    return (await this.send(
      'GET',
      `/auth/device/${deviceId}/people`,
    )) as unknown as SignInOption[];
  }

  /**
   * The device no longer says who is holding it, so the request does. `userId`
   * is not a secret — it came from the list above. The password still is.
   */
  async deviceLogin(deviceId: string, userId: string, password: string): Promise<Session> {
    const body = (await this.send('POST', '/auth/device/login', {
      body: { deviceId, userId, password },
    })) as Record<string, unknown>;

    return { accessToken: body.accessToken as string, user: body.user as Profile };
  }

  async fetchProfile(): Promise<Profile> {
    return (await this.send('GET', '/auth/me')) as unknown as Profile;
  }

  // --- Selling -------------------------------------------------------------

  async listPaymentMethods(): Promise<PaymentMethod[]> {
    return (await this.send('GET', '/payment-methods')) as unknown as PaymentMethod[];
  }

  /** A mis-scan answers 400 and an unknown code 404 — two different problems. */
  async lookupBarcode(barcode: string): Promise<Product> {
    return (await this.send('GET', '/products/lookup', {
      query: { barcode },
    })) as unknown as Product;
  }

  async searchProducts(query: string, limit = 20): Promise<Product[]> {
    return (await this.send('GET', '/products', {
      query: { query: query.trim() || undefined, limit },
    })) as unknown as Product[];
  }

  /** Unit names this shop already uses, most-used first. Feeds the picker. */
  async listUnitNames(): Promise<string[]> {
    return (await this.send('GET', '/products/unit-names')) as unknown as string[];
  }

  async createProduct(input: NewProductInput): Promise<Product> {
    return (await this.send('POST', '/products', { body: input })) as unknown as Product;
  }

  async completeSale(branchId: string, input: CompleteSaleInput): Promise<Sale> {
    return (await this.send('POST', `/branches/${branchId}/sales`, {
      body: input,
    })) as unknown as Sale;
  }

  async fetchSale(branchId: string, saleId: string): Promise<Sale> {
    return (await this.send(
      'GET',
      `/branches/${branchId}/sales/${saleId}`,
    )) as unknown as Sale;
  }

  // --- Receiving stock, and seeing what is on the shelf ---------------------

  /**
   * Records a delivery into one branch. The whole receipt is one transaction
   * at the backend: a delivery that fails on its third line leaves none of it
   * in stock, so there is no half-received state for the phone to reconcile.
   */
  async receiveStock(branchId: string, input: ReceiveStockInput): Promise<StockReceipt> {
    return (await this.send('POST', `/branches/${branchId}/stock-receipts`, {
      body: input,
    })) as unknown as StockReceipt;
  }

  /** What the branch holds. A negative line is a count to correct, not an error. */
  async listBranchStock(branchId: string): Promise<ProductStock[]> {
    return (await this.send('GET', `/branches/${branchId}/stock`)) as unknown as ProductStock[];
  }
}

function withQuery(path: string, query?: Query): string {
  if (!query) {
    return path;
  }

  const pairs = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  return pairs.length > 0 ? `${path}?${pairs.join('&')}` : path;
}
