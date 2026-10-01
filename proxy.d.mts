import type { IncomingMessage, ServerResponse } from 'node:http'
export interface ProxyOptions {
  apiUrl?: string
  apiToken?: string
  accessToken?: string
  trustAuthProxy?: boolean
  timeoutMs?: number
  maxResponseBytes?: number
  maxConcurrent?: number
}
export function createApiMiddleware(
  options?: ProxyOptions,
): (
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) => Promise<void>
export function validateExposure(host: string, options?: ProxyOptions): void
