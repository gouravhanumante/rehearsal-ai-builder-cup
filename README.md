# Rehearsal

Rehearsal helps small businesses rehearse a response to operational disruptions by showing what is affected and checking recovery options against stated constraints.

The current prototype is a distributor sample workflow. Its data and estimated costs are illustrative; it is not connected to a live business, Firebase, Firestore, or Gemini yet.

## Run the frontend

```sh
cd frontend
npm install
npm run dev
```

Run `npm test`, `npm run lint`, and `npm run build` from `frontend/` to verify changes.

## Project docs

- [Project plan](docs/00-plan.md)
- [Progress tracker](docs/Progress.md)
- [Prioritized backlog](docs/TODO.md)
- [Product definition](docs/02-product.md)
- [Behaviour rules](docs/03-behaviour.md)
- [Architecture proposal](docs/04-architecture.md)
- [UX and visual guidelines](docs/06-ux-guidelines.md)

## Frontend structure

- `frontend/src/components/` — layout, operations, and planning components
- `frontend/src/design-system/` — shared design tokens, buttons, and status badges
- `frontend/src/data/` — illustrative distributor business data
- `frontend/src/domain/` — deterministic impact and feasibility calculations
