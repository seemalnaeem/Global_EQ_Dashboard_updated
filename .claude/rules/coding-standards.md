# Coding Standards

## Writing style
- No em-dashes anywhere. Use commas, parentheses, or two sentences.
- Comments explain why, not what. Delete dead code, do not comment it out.

## Naming and shape
- camelCase in JS/TS, snake_case in SQL and Python.
- Files do one thing. Split when a file grows past a clear single purpose.
- Controllers thin, services do the work, db layer does the queries.

## Errors
- Fail loud at boundaries, degrade gracefully in the UI.
- No empty catch blocks. Handle, wrap, or rethrow with context.

## Types and contracts
- Type API request and response shapes. Share types where the stack allows.
- A change to a shared shape updates every consumer in the same change.

## Tests
- Test logic and edge cases, not framework internals or pixels.
- Every bug fix adds the test that would have caught it.
- Cover the null-magnitude, null-depth, and antimeridian cases for quake data.

## Formatting
- Lint and format before handing back (`npm run lint`, `ruff`/`black` for Python).
