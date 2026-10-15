# Rehearsal API

TypeScript API for the Rehearsal prototype. Gemini credentials stay on this server. Requests and responses are not stored by Rehearsal; Gemini calls use stateless Interactions requests (`store: false`). Ask AI defaults to stable Gemini 3.5 Flash-Lite with low thinking, a short output limit, and a 15-second request timeout. One local sample request completed in about 2.1 seconds; actual latency varies with the network and provider.

## Local development

1. Copy `.env.example` to `.env`.
2. Add your own `GEMINI_API_KEY` to `.env` locally. Never commit or paste the key into chat.
3. In one terminal, run `npm run dev` from `backend/`.
4. In another terminal, run `npm run dev` from `frontend/`.

The frontend's Vite server proxies `/api` to `http://localhost:8080`.

## Routes (`backend/src/app.ts`)

| Route | Limit | What it does |
|---|---|---|
| `GET /api/health` | none | Whether a key is configured and which model is used; never returns the key |
| `POST /api/assistant/ask` | 10/min | Question + workspace facts + planner-checked options to Gemini. Can reference only option IDs the client sent; recommendations filtered to ready options |
| `POST /api/documents/extract` | 6/min | One PNG/JPG/WEBP/PDF (max 4 MB, type checked by its first bytes). Returns only requested fields, each with the quote it was read from (`documents.ts`) |
| `POST /api/imports/map` | 10/min | Column names (and optional sample rows) to Gemini; returns only real fields and existing columns (`importMapping.ts`) |
| `POST /api/plans/check` | 30/min | Re-runs the shared planner on the plan's slice of the workspace before an approval (`shared/planner/slice.ts`) |

No endpoint stores or changes business records; the browser applies changes after the user confirms. Gemini answers must not invent quantities, dates, or costs; exact values remain in the code-checked UI.

## Deploy

The Dockerfile builds a Cloud Run container. Build it from the repository root so the shared planner in `shared/` is included: `docker build -f backend/Dockerfile .` (`cloudbuild.yaml` does this). Configure `GEMINI_API_KEY` as a Cloud Run secret and set `GEMINI_MODEL` / `PORT` as environment variables. Do not bake secrets into the image.

Checks: `npx tsc --noEmit && npx vitest run && npm run build`.
