import { timingSafeEqual } from 'node:crypto'

export const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
}

export function jsonResponse(response, statusCode, payload) {
  if (response.destroyed || response.writableEnded) return
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.writeHead(statusCode, {
    ...securityHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

export function apiOrigin(value) {
  if (!value?.trim()) return null
  let url
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('SNM_API_URL must be an HTTP(S) origin')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'SNM_API_URL must be an HTTP(S) origin without credentials, path, query, or fragment',
    )
  }
  return url
}

function validToken(token) {
  return typeof token === 'string' && /^[\x21-\x7e]{1,4096}$/.test(token)
}

function matchesToken(presented, expected) {
  if (typeof presented !== 'string') return false
  const actual = Buffer.from(presented)
  const wanted = Buffer.from(`Bearer ${expected}`)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

export function validateExposure(
  host,
  { accessToken, trustAuthProxy = false } = {},
) {
  const loopback =
    host === 'localhost' ||
    host === '::1' ||
    /^127\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)
  if (!loopback && !accessToken && !trustAuthProxy) {
    throw new Error(
      'Non-loopback frontend access requires SNM_FRONTEND_TOKEN or SNM_TRUST_AUTH_PROXY=true',
    )
  }
}

export function createApiMiddleware({
  apiUrl,
  apiToken,
  accessToken,
  trustAuthProxy = false,
  timeoutMs = 15_000,
  maxResponseBytes = 16 * 1024 * 1024,
  maxConcurrent = 16,
} = {}) {
  const backend = apiOrigin(apiUrl)
  for (const token of [apiToken, accessToken]) {
    if (token !== undefined && token !== '' && !validToken(token))
      throw new Error('Tokens must contain 1..4096 visible ASCII characters')
  }
  if (apiToken && !accessToken && !trustAuthProxy) {
    throw new Error(
      'SNM_API_TOKEN requires SNM_FRONTEND_TOKEN or SNM_TRUST_AUTH_PROXY=true',
    )
  }
  for (const limit of [timeoutMs, maxResponseBytes, maxConcurrent]) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error('Proxy limits must be positive integers')
  }
  let active = 0
  return async (
    request,
    response,
    next = () => jsonResponse(response, 404, { error: 'Not found' }),
  ) => {
    let controller, timer, disconnect
    let admitted = false
    try {
      // Validate the raw path before WHATWG normalization can hide dot segments or backslashes.
      const raw = request.url ?? '/'
      if (
        !raw.startsWith('/') ||
        raw.startsWith('//') ||
        [...raw].some(
          (character) => character === '\\' || character.charCodeAt(0) <= 32,
        )
      ) {
        jsonResponse(response, 400, { error: 'Invalid request path' })
        return
      }
      if (!raw.split('?')[0].startsWith('/snm-api')) {
        next()
        return
      }
      if (!['GET', 'HEAD'].includes(request.method)) {
        jsonResponse(response, 405, { error: 'Method not allowed' })
        return
      }
      const [rawPath] = raw.split('?')
      let decoded
      try {
        decoded = decodeURIComponent(rawPath)
      } catch {
        jsonResponse(response, 400, { error: 'Invalid request path' })
        return
      }
      if (
        decoded !== rawPath ||
        decoded.includes('//') ||
        decoded.split('/').some((p) => p === '.' || p === '..')
      ) {
        jsonResponse(response, 400, { error: 'Invalid request path' })
        return
      }
      const url = new URL(raw, 'http://frontend.example')
      if (url.pathname === '/snm-api/config') {
        jsonResponse(response, 200, {
          apiConfigured: Boolean(backend),
          authenticationRequired: Boolean(accessToken),
        })
        return
      }
      if (
        !/^\/snm-api\/(?:healthz|readyz|v1\/(?:inventory\/hosts|hosts(?:\/[A-Za-z0-9_.-]+(?:\/history|\/usage\/(?:history|samples))?)?|usage|modules|namespaces))$/.test(
          url.pathname,
        )
      ) {
        jsonResponse(response, 404, { error: 'API route not found' })
        return
      }
      if (
        accessToken &&
        !matchesToken(request.headers.authorization, accessToken)
      ) {
        jsonResponse(response, 401, {
          error: 'Frontend authentication required',
        })
        return
      }
      if (!backend) {
        jsonResponse(response, 503, {
          error: 'SNM_API_URL is not configured on the frontend server',
        })
        return
      }
      if (active >= maxConcurrent) {
        jsonResponse(response, 503, {
          error: 'Frontend proxy is busy; retry shortly',
        })
        return
      }
      active++
      admitted = true
      const upstream = new URL(backend)
      upstream.pathname = url.pathname.slice('/snm-api'.length)
      upstream.search = url.search
      if (upstream.origin !== backend.origin)
        throw new Error('Unexpected upstream origin')
      const headers = { Accept: 'application/json' }
      // An ingress token is never forwarded to an unauthenticated backend.
      if (apiToken) headers.Authorization = `Bearer ${apiToken}`
      else if (
        !accessToken &&
        typeof request.headers.authorization === 'string'
      )
        headers.Authorization = request.headers.authorization
      if (typeof request.headers['if-none-match'] === 'string')
        headers['If-None-Match'] = request.headers['if-none-match']
      controller = new AbortController()
      timer = setTimeout(() => controller.abort(), timeoutMs)
      disconnect = () => {
        if (!response.writableEnded) controller.abort()
      }
      response.on('close', disconnect)
      const result = await fetch(upstream, {
        method: request.method,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      })
      if (
        result.status >= 300 &&
        result.status < 400 &&
        result.status !== 304
      ) {
        await result.body?.cancel()
        jsonResponse(response, 502, {
          error: 'Monitor redirects are not permitted',
        })
        return
      }
      const chunks = []
      let size = 0
      if (result.body)
        for await (const chunk of result.body) {
          size += chunk.byteLength
          if (size > maxResponseBytes) {
            controller.abort()
            jsonResponse(response, 502, {
              error: 'Monitor response exceeds the proxy limit',
            })
            return
          }
          chunks.push(chunk)
        }
      if (response.destroyed) return
      response.writeHead(result.status, {
        ...securityHeaders,
        'Content-Type':
          result.headers.get('content-type') ?? 'application/json',
        ...(result.headers.has('etag')
          ? { ETag: result.headers.get('etag') }
          : {}),
        ...(result.status === 304 ? {} : { 'Content-Length': size }),
      })
      response.end(
        request.method === 'HEAD' ? undefined : Buffer.concat(chunks, size),
      )
    } catch {
      jsonResponse(response, controller?.signal.aborted ? 504 : 502, {
        error: controller?.signal.aborted
          ? 'Monitor request timed out'
          : 'Frontend proxy could not reach the monitor',
      })
    } finally {
      clearTimeout(timer)
      if (disconnect) response.off('close', disconnect)
      if (admitted) active--
    }
  }
}
