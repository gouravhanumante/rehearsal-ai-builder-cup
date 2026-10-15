# Rehearsal — Project Docs (start here)

Working name: **Rehearsal**. Entry for the **Google Cloud AI Builder Cup 2026** (Hack2skill).

> If you are an AI assistant picking this up: read this file, then the docs in order.
> Treat these docs as the current agreement. Anything marked **OPEN** is not decided yet —
> ask the user before deciding it. Current status is updated 2026-10-15.

## One-line pitch
When something goes wrong in a small business (a late shipment, a stock-out, a warehouse or
machine out of action), Rehearsal shows what it affects, tests the possible responses against
real constraints, and carries the approved response into action.

## Status
| Item | State |
|---|---|
| Idea | Agreed |
| Product behaviour | Agreed in discussion, written in docs |
| Tech stack | React + Vite on Firebase Hosting, Node API on Cloud Run, Gemini via AI Studio key; Firestore not used |
| Hackathon theme (one only) | **OPEN** (working direction: Retail & Commerce) |
| Code | Sample and own-business workspaces, shared planner, import, Gemini reading and Ask AI, approvals that record the plan |
| Deployment | Live at rehearsal-ai-builder-cup-2026.web.app; 2026-10-15 work not redeployed |
| Deck / video | Not started |

## Key dates
- 2026-10-14 — team formation closes
- **2026-10-18 — submission deadline**
- 2026-11-07 — finalists announced
- 2026-12-04 — Grand Finale, Singapore

## Docs in this folder
0. [00-plan.md](00-plan.md) — project plan, current sample scenario, and execution phases
1. [01-hackathon.md](01-hackathon.md) — rules, required deliverables, judging, known conflicts
2. [02-product.md](02-product.md) — the idea, who it is for, what it does, examples
3. [03-behaviour.md](03-behaviour.md) — how it behaves: data intake, questions, multiple
   incidents, undo, actions, roles
4. [04-architecture.md](04-architecture.md) — proposed tech, what Gemini does vs what code does
5. [05-scope-and-decisions.md](05-scope-and-decisions.md) — MVP scope, decisions made, open
   questions, risks, ideas we rejected and why
6. [Progress.md](Progress.md) — implementation progress and current assumptions
7. [TODO.md](TODO.md) — prioritized V1 and future-release backlog
8. [06-ux-guidelines.md](06-ux-guidelines.md) — research-backed content, visual, accessibility, and AI interaction rules
9. [07-bug-map.md](07-bug-map.md) — per-feature diagrams coloured by what protects each step (proven test, test, manual check, known gap)

## Folder layout
```
AIBuilder2026/
  docs/          product agreement, UX rules, progress, and backlog
  shared/        planner (used by browser and API) and import field lists
  frontend/      React app
  backend/       TypeScript API for Gemini and the plan re-check (Cloud Run)
  test-data/     four ready-made scenarios
```

## Working rules agreed with the user
- Docs first, then code.
- **Every code change updates the docs it affects in the same commit.** Which doc owns what is
  listed in `.github/copilot-instructions.md`.
- Gemini proposes; code checks. Numbers (quantities, dates, money) are never trusted from
  the model without being recomputed by code.
- Nothing changes business data without the user confirming it.
- Demo and Real are separate workspaces. Real records stay in this browser in V1; no sign-in or cross-device sync until V2.
- Receipt extraction and applying its calculated effect are separate confirmations.
- Do not claim the idea is novel; prior-art check has not been done.
- Use no employer-owned code, data, or internal tools.
