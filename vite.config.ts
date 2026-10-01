import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { createApiMiddleware, validateExposure } from './proxy.mjs'

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), 'SNM_')
  const env = (name: string) => process.env[name] || fileEnv[name] || ''
  const options = {
    apiUrl: env('SNM_API_URL'),
    apiToken: env('SNM_API_TOKEN'),
    accessToken: env('SNM_FRONTEND_TOKEN'),
    trustAuthProxy: env('SNM_TRUST_AUTH_PROXY') === 'true',
  }
  const plugin: Plugin = {
    name: 'snm-api',
    configureServer(server) {
      validateExposure(String(server.config.server.host), options)
      const proxy = createApiMiddleware(options)
      server.middlewares.use((req, res, next) => {
        void proxy(req, res, next)
      })
    },
  }
  return {
    plugins: [react(), plugin],
    server: { port: 4444, host: '127.0.0.1' },
    test: { environment: 'jsdom' },
  }
})
