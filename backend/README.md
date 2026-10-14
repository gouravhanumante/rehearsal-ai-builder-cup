# Rehearsal API

TypeScript API for the Rehearsal prototype. Gemini credentials stay on this server. Requests and responses are not stored by Rehearsal; Gemini calls use stateless Interactions requests (`store: false`). Ask AI defaults to stable Gemini 3.5 Flash-Lite with low thinking, a short output limit, and a 15-second request timeout. One local sample request completed in about 2.1 seconds; actual latency varies with the network and provider.

## Local development

1. Copy `.env.example` to `.env`.
2. Add your own `GEMINI_API_KEY` to `.env` locally. Never commit or paste the key into chat.
3. In one terminal, run `npm run dev` from `backend/`.
4. In another terminal, run `npm run dev` from `frontend/`.

The frontend's Vite server proxies `/api` to `http://localhost:8080`.

## Routes

- `GET /api/health` reports whether a key is configured; it never returns the key.
- `POST /api/assistant/ask` sends the user's question plus the current workspace facts and planner-checked options to Gemini. The response can reference only option IDs supplied by the client; the server filters recommendations to options already marked ready by the deterministic planner.

No endpoint changes business records. Gemini answers must not invent quantities, dates, or costs; exact values remain in the code-checked UI. New free-form ideas are not actionable until represented and checked by the planner.

## Deploy

The Dockerfile builds a Cloud Run container. Build it from the repository root so the shared planner in `shared/` is included: `docker build -f backend/Dockerfile .`. Configure `GEMINI_API_KEY` as a Cloud Run secret and set `GEMINI_MODEL` / `PORT` as environment variables. Do not bake secrets into the image.
