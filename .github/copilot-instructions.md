# Rehearsal: rules for anyone changing the code

## Docs change with the code, in the same commit
Every code change updates the docs it affects **in the same commit**. A commit that changes
behaviour, a route, a label, a number in the sample, or what a test protects, and leaves the
docs saying the old thing, is not finished.

Which doc owns what:

| If the change touches... | Update |
|---|---|
| What the user sees or what a rule does | `docs/03-behaviour.md` (cite the file/symbol) |
| API routes, Gemini use, storage, deployment | `docs/04-architecture.md` and `backend/README.md` |
| Frontend folders or npm scripts | `frontend/README.md` |
| A test for a risky step (added, removed, proven red) | `docs/07-bug-map.md` (change the box colour) |
| A decision made with the user | `docs/05-scope-and-decisions.md` |
| A feature finished, a gap found or closed | `docs/Progress.md` and `docs/TODO.md` |
| Sample numbers, screen names, what is built | `README.md` (tour, "What is and isn't built") |

Before committing:
1. Search the docs for every name you changed (function, label, route, file path) and fix stale mentions.
2. Each factual claim in a doc should point to the file or symbol that proves it.
3. If the code and a doc disagree and it isn't obvious which is right, ask the user. Don't
   silently change either one.

## Checks before committing
```sh
cd frontend && npx tsc -b && npx eslint . && npx vitest run && npm run build
cd backend  && npx tsc --noEmit && npx vitest run && npm run build
```
