// @vitest-environment node

import http from 'node:http'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer as createViteServer } from 'vite'

const httpServers = []
const viteServers = []
const originalApiUrl = process.env.SNM_API_URL

const listen = (server) =>
  new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      httpServers.push(server)
      const address = server.address()
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })

afterEach(async () => {
  if (originalApiUrl === undefined) {
    delete process.env.SNM_API_URL
  } else {
    process.env.SNM_API_URL = originalApiUrl
  }

  await Promise.all(viteServers.splice(0).map((server) => server.close()))
  await Promise.all(
    httpServers
      .splice(0)
      .map(
        (server) =>
          new Promise((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  )
})

describe('Vite development proxy', () => {
  it.each([
    '/v1/hosts',
    '/v1/inventory/hosts?limit=500&after=switch-01',
    '/v1/hosts/page',
  ])('relays %s to SNM_API_URL', async (apiPath) => {
    const receivedPaths = []
    const backend = http.createServer((request, response) => {
      receivedPaths.push(request.url)
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(
        JSON.stringify([{ id: 'switch-01', name: 'switch01.example.org' }]),
      )
    })
    process.env.SNM_API_URL = await listen(backend)

    const vite = await createViteServer({
      configFile: path.resolve('vite.config.ts'),
      logLevel: 'silent',
      server: {
        host: '127.0.0.1',
        port: 0,
      },
    })
    await vite.listen()
    viteServers.push(vite)

    const address = vite.httpServer.address()
    const frontendOrigin = `http://127.0.0.1:${address.port}`

    expect(
      await fetch(`${frontendOrigin}/snm-api/config`).then((response) =>
        response.json(),
      ),
    ).toEqual({ apiConfigured: true, authenticationRequired: false })

    const response = await fetch(`${frontendOrigin}/snm-api${apiPath}`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { id: 'switch-01', name: 'switch01.example.org' },
    ])
    expect(receivedPaths).toEqual([apiPath])
  })
})
