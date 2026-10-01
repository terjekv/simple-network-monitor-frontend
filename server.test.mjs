// @vitest-environment node

import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createFrontendServer } from './server.mjs'

const runningServers = []

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      runningServers.push(server)
      const address = server.address()
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })

afterEach(async () => {
  await Promise.all(
    runningServers
      .splice(0)
      .map(
        (server) =>
          new Promise((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  )
})

describe('frontend server', () => {
  it.each([
    '/v1/hosts?icmp.status=down',
    '/v1/inventory/hosts?limit=500&after=router-01',
    '/v1/hosts/page',
  ])('keeps the backend URL server-side and proxies %s', async (apiPath) => {
    const received = []
    const backend = http.createServer((request, response) => {
      received.push({
        authorization: request.headers.authorization,
        url: request.url,
      })
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify([{ id: 'router-01', name: 'router01.example.org' }]),
      )
    })
    const backendOrigin = await listen(backend)

    const frontend = createFrontendServer({
      apiUrl: backendOrigin,
      apiToken: 'server-side-example-token',
      accessToken: 'fake-visitor-token',
    })
    const frontendOrigin = await listen(frontend)

    const runtimeConfig = await fetch(`${frontendOrigin}/snm-api/config`).then(
      (response) => response.json(),
    )
    expect(runtimeConfig).toEqual({
      apiConfigured: true,
      authenticationRequired: true,
    })
    expect(JSON.stringify(runtimeConfig)).not.toContain(backendOrigin)

    const response = await fetch(
      `${frontendOrigin}/snm-api${apiPath}`,
      { headers: { Authorization: 'Bearer fake-visitor-token' } },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { id: 'router-01', name: 'router01.example.org' },
    ])
    expect(received).toEqual([
      {
        authorization: 'Bearer server-side-example-token',
        url: apiPath,
      },
    ])
  })

  it('returns a clear error when SNM_API_URL is missing', async () => {
    const frontend = createFrontendServer({ apiUrl: '' })
    const frontendOrigin = await listen(frontend)

    const response = await fetch(`${frontendOrigin}/snm-api/v1/hosts`)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: 'SNM_API_URL is not configured on the frontend server',
    })
  })
})
