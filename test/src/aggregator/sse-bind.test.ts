/**
 * Aggregator SSE entry — port/host binding tests (v1.6.7).
 *
 * Regression classes covered:
 * 1. connection.port honored: this entry previously IGNORED
 *    config.server.connection.port and always listened on DEFAULT_PORT
 *    (3000) unless a caller passed an argument to start() — the sole
 *    runtime caller (bin/mcp-aggregator.mts) never did. The declared
 *    type contract (SseServerConfig.connection.port) is now enforced.
 * 2. connection.host honored: express listen() receives the configured
 *    interface (same fix as the simple-server entries).
 * 3. start() returns the underlying http.Server so tests assert the
 *    REAL socket bind via server.address() — the discarded handle was
 *    why this entire defect class was invisible.
 */
import { describe, it, afterEach } from 'mocha'
import { expect } from 'chai'
import * as net from 'net'
import { AddressInfo } from 'net'
import { create as createAggregator } from '../../../src/aggregator/entries'
import { McpAggregatorSseConfig } from '../../../src/common/types'

const sseConfig = (extra: Record<string, unknown>): McpAggregatorSseConfig =>
  ({
    // mcps: [] (required by McpAggregatorConfigBase; connect() filters it)
    mcps: [],
    server: {
      path: '/',
      messagesPath: '/messages',
      connection: { type: 'sse', url: 'http://127.0.0.1:0', ...extra },
    },
  }) as unknown as McpAggregatorSseConfig

const waitListening = (server: net.Server): Promise<void> =>
  new Promise((resolve, reject) => {
    if (server.listening) return resolve()
    server.once('listening', () => resolve())
    server.once('error', reject)
  })

const servers: net.Server[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      s =>
        new Promise<void>(resolve => {
          if (s.listening) s.close(() => resolve())
          else resolve()
        })
    )
  )
})

describe('Aggregator SSE entry — connection.port + connection.host (v1.6.7)', () => {
  it('honors config.server.connection.port (previously ignored, always DEFAULT_PORT)', async () => {
    // NOTE: a concrete port is used deliberately — the family idiom is
    // `port || DEFAULT_PORT` (matching the four sibling entries), so a
    // configured 0 is treated as absent and falls back to 3000. Under the
    // OLD behavior this config port was ignored entirely and the bind was
    // always DEFAULT_PORT; asserting the exact configured port proves the
    // contract is now honored.
    const configuredPort = 39871
    const server = createAggregator(sseConfig({ port: configuredPort }))
    const handle = (await server.start()) as net.Server
    expect(handle, 'start() must return the underlying http.Server').to.not.be
      .undefined
    servers.push(handle)
    await waitListening(handle)
    const addr = handle.address() as AddressInfo
    expect(addr.port).to.equal(configuredPort)
  })

  it('binds to the configured host when connection.host is set', async () => {
    const server = createAggregator(sseConfig({ host: '127.0.0.1', port: 0 }))
    const handle = (await server.start()) as net.Server
    servers.push(handle)
    await waitListening(handle)
    const addr = handle.address() as AddressInfo
    expect(addr.address).to.equal('127.0.0.1')
  })
})
