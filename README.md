# Rehearsal

Rehearsal helps small businesses rehearse a response to operational disruptions by showing what is affected and checking recovery options against stated constraints.

The current prototype is a distributor sample workflow. Its data and estimated costs are illustrative. Ask AI calls Gemini through a local TypeScript API; each developer supplies their own key in the ignored `backend/.env`. Firebase Hosting and Firestore are not wired yet; the planned Real workspace will keep records in this browser during V1.

## Run locally

```sh
cd backend
cp .env.example .env
npm install
npm run dev
```

Add your `GEMINI_API_KEY` directly to `backend/.env` in the editor. Keep this file local; it is gitignored and must never be committed or shared. Then, in another terminal:

```sh
cd frontend
npm install
npm run dev
```

Run tests/build/lint inside `frontend/`; run tests/build inside `backend/`.

## Project docs

- [Project plan](docs/00-plan.md)
- [Progress tracker](docs/Progress.md)
- [Prioritized backlog](docs/TODO.md)
- [Product definition](docs/02-product.md)
- [Behaviour rules](docs/03-behaviour.md)
- [Architecture proposal](docs/04-architecture.md)
- [UX and visual guidelines](docs/06-ux-guidelines.md)
- [Distributor workflow diagram](https://www.figma.com/board/PTIzhPNO9wbPmD3M1dO6WZ)

## Frontend structure

- `frontend/src/components/` — layout, operations, and planning components
- `frontend/src/design-system/` — shared design tokens, buttons, and status badges
- `frontend/src/data/` — illustrative distributor business data
- `frontend/src/domain/` — deterministic impact and feasibility calculations
