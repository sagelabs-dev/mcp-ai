# Changelog

## [1.6.7-guan.0] — 2026-09-13

### Fixed: `connection.host` now reaches the socket (all express entries)

All five express-based server entries (simple-server http/stateless-http/sse,
aggregator http/sse) called `app.listen(port)` bare — Node bound all
interfaces regardless of any host in config. The `host` field did not even
exist on the connection types, so TypeScript silently dropped it.

- `host?: string` added beside `port` on `HttpServerConfig.connection` and
  `SseServerConfig.connection`. When set (e.g. `'127.0.0.1'`), the server
  binds only that interface; when omitted, Node's default (all interfaces)
  applies — behavior-identical for every existing config.
- `start()` now returns the underlying `http.Server` (previously discarded —
  the reason this class of bug was invisible and untestable). Additive;
  existing callers unaffected.

### Fixed: aggregator SSE entry honors `connection.port`

The aggregator SSE entry took port as a `start()` argument (defaulting to
3000) and ignored `config.server.connection.port`, violating the declared
type contract and diverging from the aggregator http sibling. Port now
resolves config-first with `DEFAULT_PORT` fallback, matching the family
idiom (a configured `0` is treated as absent — documented in tests).

### Tests

Socket-level truth, no mocks: configured host binds (`server.address()`),
omitted host pins backward compat (all interfaces), LAN-addressed
connections REFUSED while loopback connects, aggregator SSE binds the exact
configured port. Suite: 36/36.

### Notes

- The gateway (HTTP transport) is unaffected: its config sets no `host`.
- Consumers using loopback-only binds may now drop deployment-level
  workarounds (e.g. systemd `IPAddressDeny`), though keeping them as
  defense-in-depth is reasonable.
