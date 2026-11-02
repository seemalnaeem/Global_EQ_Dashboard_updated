# Security Rules

## Input and injection
- Parameterized queries only. Never concatenate user input into SQL.
- Validate and clamp bbox, radius, magnitude, and time ranges at the boundary.
- Sanitize any user text before it reaches logs, queries, or the client.

## Auth and access
- Protect write and admin endpoints with auth. Public read endpoints stay
  read-only and rate limited.
- Secrets come from env, never hardcoded. Rotate keys, do not log them.
- CORS uses an env allowlist. No wildcard origins in production.

## Transport and headers
- HTTPS in production. Set standard security headers (helmet).
- Rate limit per IP and per API key. Feeds get polled aggressively.

## Data exposure
- Redact tokens and full request bodies from logs.
- Error responses never leak stack traces or SQL outside development.
- Return only needed columns. No `SELECT *` across a boundary.

## Dependencies
- Pin versions. Run audit on install. Patch known-vuln packages promptly.
