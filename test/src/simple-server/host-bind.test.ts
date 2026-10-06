/**
 * Bind-host tests (v1.6.7) — the regression class is "config option present
 * but never reaching the socket": SimpleServer accepted `connection.host`
 * in config yet every express listen() called `app.listen(port)` bare,
 * binding all interfaces. These tests assert the REAL socket bind via
 * `server.address()` from the http.Server instance that start() now
 * returns (the discarded handle was exactly why this bug was invisible).
 *
 * Backward-compat pins: no host configured → Node's default (all
 * interfaces), identical to pre-1.6.7 behavior.
 */
import { describe, it, afterEach } from 'mocha'
import { expect } from 'chai'
import * as net from 'net'
import * as os from 'os'
import { AddressInfo } from 'net'
import { create as createSimpleServer } from '../../../src/simple-server/entries'
import {
  SimpleServerHttpConfig,
  ServerTool,
} from '../../../src/simple-server/types'

const noopTool: ServerTool = {
  name: 'noop',
  description: 'test tool',
  inputSchema: { type: 'object', properties: {} },
  execute: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
}

const httpConfig = (extra: Record<string, unknown>): SimpleServerHttpConfig =>
  ({
    name: 'bind-test-server',
    version: '0.0.0-test',
    tools: [noopTool],
    server: {
      connection: { type: 'http', url: 'http://127.0.0.1:0', ...extra },
    },
  }) as unknown as SimpleServerHttpConfig

/** Wait until the server is accepting connections on its bound address. */
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

describe('SimpleServer connection.host binding (v1.6.7)', () => {
  it('binds to the configured host when connection.host is set', async () => {
    // THE regression test: before 1.6.7 this config field was silently
    // dropped and the socket bound all interfaces.
    const server = createSimpleServer(
      httpConfig({ host: '127.0.0.1', port: 0 })
    )
    const handle = (await server.start()) as net.Server
    expect(handle, 'start() must return the underlying http.Server').to.not.be
      .undefined
    servers.push(handle)
    await waitListening(handle)
    const addr = handle.address() as AddressInfo
    expect(addr.address).to.equal('127.0.0.1')
  })

  it('binds all interfaces when connection.host is omitted (backward compat)', async () => {
    const server = createSimpleServer(httpConfig({ port: 0 }))
    const handle = (await server.start()) as net.Server
    servers.push(handle)
    await waitListening(handle)
    const addr = handle.address() as AddressInfo
    // Node's unspecified-address bind reports '::' (or '0.0.0.0' on some stacks)
    expect(['::', '0.0.0.0']).to.include(addr.address)
  })

  it('refuses connections addressed to a non-bound interface (e2e)', async function () {
    // Real-socket refusal check: a server bound to loopback must not accept
    // connections addressed to the machine's LAN address. Skipped when no
    // non-loopback interface exists (containers/CI may be loopback-only).
    const ifaces = os.networkInterfaces()
    const external = Object.values(ifaces)
      .flat()
      .find(i => i && !i.internal && i.family === 'IPv4')
    if (!external) return this.skip()

    const server = createSimpleServer(
      httpConfig({ host: '127.0.0.1', port: 0 })
    )
    const handle = (await server.start()) as net.Server
    servers.push(handle)
    await waitListening(handle)
    const port = (handle.address() as AddressInfo).port

    // Connecting to the LAN IP must ECONNREFUSED (bound interface mismatch)
    const refused = await new Promise<boolean>(resolve => {
      const sock = net.connect({ host: external.address, port })
      sock.once('connect', () => {
        sock.destroy()
        resolve(false) // connected = BAD: host binding ignored
      })
      sock.once('error', (err: NodeJS.ErrnoException) => {
        resolve(err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH')
      })
    })
    expect(
      refused,
      'server bound to 127.0.0.1 must refuse LAN-addressed connections'
    ).to.be.true

    // Control: loopback connect succeeds (the server IS reachable)
    const reachable = await new Promise<boolean>(resolve => {
      const sock = net.connect({ host: '127.0.0.1', port })
      sock.once('connect', () => {
        sock.destroy()
        resolve(true)
      })
      sock.once('error', () => resolve(false))
    })
    expect(reachable, 'loopback connect must succeed').to.be.true
  })
})
