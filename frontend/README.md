# Rehearsal frontend

React and TypeScript client for the distributor workflow. It calls the local TypeScript API at `/api`; the Gemini key belongs only in the backend environment.

## Run locally

Use two terminals.

```sh
cd backend
cp .env.example .env
```

Add your Gemini API key directly to `backend/.env`, then start the API:

```sh
npm install
npm run dev
```

In the second terminal:

```sh
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8080`.

## Checks

- `npx tsc -b` — type check
- `npm run lint` — ESLint
- `npm test` — Vitest, including the shared planner tests in `../shared/**` (`vite.config.ts`)
- `npm run build` — TypeScript and production build

## Code layout

- `src/WorkspaceScreen.tsx` — the workspace: sections, saving changes, approving plans
- `src/components/` — start screen, Setup, navigation, data views, recovery options, editors, import dialog, Ask AI panel
- `src/presentation/` — wording and formatting (option labels, supplier messages, Setup steps, paging)
- `src/import/` — reads csv/xlsx in the browser, matches columns, builds the import preview
- `src/data/` — storage: sample in localStorage (`demoStore.ts`), own workspace in IndexedDB (`realStore.ts`), backup/restore, server plan check
- `src/domain/` — facts sent to Ask AI (`assistantContext.ts`)
- `src/design-system/` — shared tokens and UI primitives
- The planner itself is in `../shared/planner/`, shared with the backend.
