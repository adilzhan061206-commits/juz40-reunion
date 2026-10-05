export class ApiError extends Error {
  status: number
  code?: string
  data: Record<string, unknown>

  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.data = data
    this.code = typeof data.code === 'string' ? data.code : undefined
  }
}

function messageFrom(body: unknown, fallback: string): { message: string; data: Record<string, unknown> } {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return { message: detail, data: {} }
    if (detail && typeof detail === 'object' && 'message' in detail) {
      const d = detail as Record<string, unknown>
      return { message: String(d.message), data: d }
    }
    if (Array.isArray(detail) && detail[0]?.msg) return { message: String(detail[0].msg), data: {} }
  }
  return { message: fallback, data: {} }
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

export async function api<T = unknown>(path: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = options
  let response: Response
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...rest,
      headers: {
        Accept: 'application/json',
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.')
  }
  if (response.status === 204) return undefined as T
  const text = await response.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.()
    const { message, data } = messageFrom(body, `Request failed (${response.status})`)
    throw new ApiError(response.status, message, data)
  }
  return body as T
}

export const get = <T>(path: string) => api<T>(path)
export const post = <T>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} })
export const patch = <T>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json })
export const put = <T>(path: string, json: unknown) => api<T>(path, { method: 'PUT', json })
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' })

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
