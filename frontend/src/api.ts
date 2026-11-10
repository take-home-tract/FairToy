// The contract with the Python API (docs/api.md): types and one function per endpoint.

export type Exposure = 'affected' | 'possibly_affected' | 'no_finding'

export interface Me {
  user: { id: number; username: string }
  finisher: { id: number; name: string }
}

export interface LoginResult extends Me {
  token: string
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
}

export interface ToysResult {
  summary: ToySummary
  toys: ToyListItem[]
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
}
