import { createReadStream } from 'node:fs'
import { stat, realpath } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pipeline } from 'node:stream/promises'
import {
  createApiMiddleware,
  jsonResponse,
  securityHeaders,
  validateExposure,
} from './proxy.mjs'

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const defaultDistDirectory = path.join(moduleDirectory, 'dist')

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

const sendFile = async (request, response, filePath) => {
  const file = await stat(filePath)
  if (!file.isFile()) throw new Error('Not a file')

  response.writeHead(200, {
    ...securityHeaders,
    'Cache-Control':
      path.basename(filePath) === 'index.html'
        ? 'no-cache'
        : 'public, max-age=3600',
    'Content-Length': file.size,
    'Content-Type':
      mimeTypes.get(path.extname(filePath)) || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  })

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  await pipeline(createReadStream(filePath), response)
}

export const createFrontendServer = ({
  apiUrl = process.env.SNM_API_URL,
  apiToken = process.env.SNM_API_TOKEN,
  distDirectory = defaultDistDirectory,
  accessToken = process.env.SNM_FRONTEND_TOKEN,
  trustAuthProxy = process.env.SNM_TRUST_AUTH_PROXY === 'true',
  ...proxyOptions
} = {}) => {
  const proxy = createApiMiddleware({
    apiUrl,
    apiToken,
    accessToken,
    trustAuthProxy,
    ...proxyOptions,
  })
  const resolvedDistDirectory = path.resolve(distDirectory)

  return http.createServer(async (request, response) => {
    try {
      if (
        !(request.url ?? '/').startsWith('/') ||
        (request.url ?? '').startsWith('//')
      ) {
        jsonResponse(response, 400, { error: 'Invalid request path' })
        return
      }
      const requestUrl = new URL(request.url ?? '/', 'http://frontend.local')

      if ((request.url ?? '').startsWith('/snm-api')) {
        await proxy(request, response)
        return
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        jsonResponse(response, 405, { error: 'Method not allowed' })
        return
      }

      let pathname
      try {
        pathname = decodeURIComponent(requestUrl.pathname)
      } catch {
        jsonResponse(response, 400, { error: 'Invalid URL encoding' })
        return
      }

      const relativePath =
        pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
      const requestedPath = path.resolve(resolvedDistDirectory, relativePath)
      const insideDist =
        requestedPath === resolvedDistDirectory ||
        requestedPath.startsWith(`${resolvedDistDirectory}${path.sep}`)

      if (!insideDist) {
        jsonResponse(response, 403, { error: 'Forbidden' })
        return
      }

      try {
        const actualPath = await realpath(requestedPath)
        if (
          !actualPath.startsWith(
            `${await realpath(resolvedDistDirectory)}${path.sep}`,
          )
        ) {
          jsonResponse(response, 403, { error: 'Forbidden' })
          return
        }
        await sendFile(request, response, actualPath)
      } catch {
        if (response.headersSent || response.destroyed) {
          response.destroy()
          return
        }
        if (!request.headers.accept?.includes('text/html')) {
          jsonResponse(response, 404, {
            error: 'Asset not found',
          })
          return
        }

        try {
          const indexPath = await realpath(
            path.join(resolvedDistDirectory, 'index.html'),
          )
          if (
            !indexPath.startsWith(
              `${await realpath(resolvedDistDirectory)}${path.sep}`,
            )
          ) {
            jsonResponse(response, 403, { error: 'Forbidden' })
            return
          }
          await sendFile(request, response, indexPath)
        } catch {
          jsonResponse(response, 404, {
            error: 'Frontend build not found. Run npm run build first.',
          })
        }
      }
    } catch {
      jsonResponse(response, 400, { error: 'Invalid request' })
    }
  })
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMainModule) {
  const host = process.env.HOST || '127.0.0.1'
  const port = Number.parseInt(process.env.PORT || '4444', 10)
  validateExposure(host, {
    accessToken: process.env.SNM_FRONTEND_TOKEN,
    trustAuthProxy: process.env.SNM_TRUST_AUTH_PROXY === 'true',
  })
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be between 1 and 65535')
  const server = createFrontendServer()

  server.listen(port, host, () => {
    console.log(`Signal frontend listening on http://${host}:${port}`)
    console.log(
      process.env.SNM_API_URL
        ? 'Monitor API available through /snm-api'
        : 'SNM_API_URL is not set; the live monitor connection is disabled',
    )
  })
}
