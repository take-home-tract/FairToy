// The contract with the Python API (docs/api.md): types and one function per endpoint.

export type Exposure = 'affected' | 'possibly_affected' | 'no_finding'

export interface Me {
  user: { id: number; username: string }
  finisher: { id: number; name: string }
}

export interface LoginResult extends Me {
  token: string
}

export interface SupplierRef {
  id: number
  name: string
}

export interface ToySummary {
  total: number
  affected: number
  possiblyAffected: number
  noFinding: number
}

export interface ToyListItem {
  id: number
  code: string
  name: string
  exposure: Exposure
  partsTouched: number
  partCount: number
  /** The suppliers with a finding that can make one of the toy's parts. */
  flaggedSuppliers: SupplierRef[]
  /** How many of its parts have a recorded supplier (a resolution). */
  partsResolved: number
}

export interface ToysResult {
  summary: ToySummary
  toys: ToyListItem[]
}

export interface TraceSource {
  supplier: { id: number; name: string; country: string }
  factory: { name: string; country: string }
  hasFinding: boolean
}

/** Which supplier actually made a part of a toy, as the Finisher recorded it. */
export interface Resolution {
  supplier: SupplierRef
  recordedAt: string
  recordedBy: string
}

export interface TracePart {
  id: number
  code: string
  name: string
  exposure: Exposure
  /** Every possible source, also when a resolution names the one that was used. */
  sources: TraceSource[]
  resolution: Resolution | null
}

export interface ToyTrace {
  toy: { id: number; code: string; name: string; exposure: Exposure }
  parts: TracePart[]
}

export interface Finding {
  recordedAt: string
  recordedBy: string
}

export interface SupplierListItem {
  id: number
  code: string
  name: string
  country: string
  /** How many of the Finisher's parts this supplier can make. */
  partCount: number
  toysReached: number
  finding: Finding | null
}

/** A part a supplier can make for the Finisher. */
export interface SupplierPart {
  id: number
  code: string
  name: string
  factories: { name: string; country: string }[]
  /** Empty when this supplier is the only source of the part. */
  otherSuppliers: SupplierRef[]
  toyCount: number
}

export interface ReachedToy {
  id: number
  code: string
  name: string
  exposureNow: Exposure
  exposureIfFlagged: Exposure
  /** The parts (ids in `parts`) that connect the toy to the supplier. */
  partIds: number[]
}

export interface SupplierDetail {
  supplier: { id: number; code: string; name: string; country: string; finding: Finding | null }
  parts: SupplierPart[]
  toys: ReachedToy[]
}

/** An error answered by the API, in its one error shape. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// The token lives in session storage: it survives a refresh and is gone when
// the tab closes (docs/decisions.md, D16).
const TOKEN_KEY = 'fairtoy.token'

export const tokenStore = {
  get: (): string | null => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

// Called when the API refuses our token (expired, or the API restarted).
let onSignedOut: () => void = () => {}
export function setSignedOutHandler(handler: () => void) {
  onSignedOut = handler
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server.')
  }

  if (response.ok) return (await response.json()) as T

  let code = 'http_error'
  let message = `The server answered ${response.status}.`
  try {
    const payload = await response.json()
    if (payload?.error?.code) code = payload.error.code
    if (payload?.error?.message) message = payload.error.message
  } catch {
    // Not JSON (for example the API is not running behind the dev server): keep the defaults.
  }
  if (response.status === 401 && code === 'not_authenticated') onSignedOut()
  throw new ApiError(response.status, code, message)
}

export const api = {
  login: (username: string, password: string) =>
    request<LoginResult>('POST', '/api/auth/login', { username, password }),
  me: () => request<Me>('GET', '/api/me'),
  toys: () => request<ToysResult>('GET', '/api/toys'),
  toy: (toyId: string) => request<ToyTrace>('GET', `/api/toys/${encodeURIComponent(toyId)}`),
  suppliers: () => request<{ suppliers: SupplierListItem[] }>('GET', '/api/suppliers'),
  supplier: (supplierId: string | number) =>
    request<SupplierDetail>('GET', `/api/suppliers/${encodeURIComponent(supplierId)}`),
  recordFinding: (supplierId: number) =>
    request<{ finding: Finding | null }>('PUT', `/api/suppliers/${supplierId}/finding`),
  withdrawFinding: (supplierId: number) =>
    request<{ finding: Finding | null }>('DELETE', `/api/suppliers/${supplierId}/finding`),
  recordResolution: (toyId: number, partId: number, supplierId: number) =>
    request<{ resolution: Resolution | null }>('PUT', `/api/toys/${toyId}/parts/${partId}/resolution`, { supplierId }),
  withdrawResolution: (toyId: number, partId: number) =>
    request<{ resolution: Resolution | null }>('DELETE', `/api/toys/${toyId}/parts/${partId}/resolution`),
}

/** An unknown id, another Finisher's id, or something that is not an id at all. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 422)
}
