# Guardrails

Hard limits for every agent. When a request conflicts with these, stop and ask.

## Data integrity
- Never fabricate or interpolate seismic values. Missing feed field stays null.
- Never delete or overwrite historical quake rows. Ingest is upsert-only.
- Keep the raw feed payload. Reprocessing depends on it.

## Safety
- No destructive DB commands without an explicit, confirmed request
  (DROP, TRUNCATE, DELETE without WHERE). Migrations reverse cleanly.
- Never commit secrets. `.env`, keys, and tokens stay out of git and logs.
- No force pushes. No history rewrites on shared branches.

## Scope discipline
- Each agent edits only its layer. Cross-layer changes go through the owning agent.
- Do not change an API contract without updating both caller and callee.

## Correctness bars
- Every external input is validated at the boundary.
- Every list endpoint is paginated and rate limited.
- Every migration is reversible. Every ingest write is idempotent.

## When unsure
Ask rather than guess on: schema changes, auth, feed source changes, and anything
that moves or deletes data. Surface the tradeoff, do not silently pick.
