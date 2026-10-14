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

- `npm test` — deterministic distributor planner tests
- `npm run lint` — ESLint
- `npm run build` — TypeScript and production build

## Code layout

- `src/components/` — navigation, data views, planner options, and Ask AI panel
- `src/design-system/` — shared tokens and UI primitives
- `src/data/` — sample workspace data
- `src/domain/` — deterministic planning logic
