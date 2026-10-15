# 04 — Architecture (V1 direction confirmed 2026-10-14; checked against code 2026-10-15)

Built today: Firebase Hosting serving the frontend and rewriting `/api` to Cloud Run (`firebase.json`); the API image built by `cloudbuild.yaml`; Real workspaces stored in the browser (`frontend/src/data/realStore.ts`). Not built: Firestore (no dependency or call anywhere), Firebase Authentication, voice input, Gemini function calling, an audit log or undo.

## Guiding principle
**Gemini proposes; code checks.** The model interprets messy input and explains results.
A deterministic planning engine decides what is feasible and computes all numbers.

## Responsibilities
| Gemini | Planning engine (code) |
|---|---|
| Read receipts, PDFs, screenshots, voice → proposed structured updates | Validate and apply confirmed updates |
| Match document names to records (with user confirmation) | Compute impact: affected orders, shortages, idle capacity |
| Suggest candidate responses, including creative ones | Check every candidate against stock, capacity, dates, budget, rules |
| Phrase questions for missing facts; parse answers | Detect which missing facts block a decision |
| Explain tradeoffs in plain language | Compute cost, lateness and score for each plan |
| Draft customer/supplier messages, tasks | Reject infeasible plans, with the reason |

Gemini never produces a final quantity, date or amount that is not recomputed by the engine.

Not built yet from the Gemini column: voice, matching document names to records, suggesting candidate responses, phrasing questions, drafting messages. The planner column has no idle-capacity or budget rules yet.

The Ask AI endpoint sends the user's question plus current workspace facts/options to Gemini with `store: false`. It returns plain-language explanation and references to known options; the server filters unknown option IDs and allows recommendations only for planner-ready options. The model does not write records or define plan status. Answers with unsupported numeric claims are replaced by a safe message directing users to verified UI figures; the model may repeat numbers that appear in the facts, never calculate new ones. A reply that is cut off or unreadable is asked for once more; an over-long answer is cut at a sentence instead of being rejected (`backend/src/gemini.ts`). Facts are sent only as known (`confirmed`) or `unknown`; whether a value was typed in or backed by a document is shown in the app, not discussed in chat (user decision 2026-10-15, `frontend/src/domain/assistantContext.ts`). A follow-up carries up to 6 earlier question/answer pairs (`history` in `backend/src/contracts.ts`), so questions like "which of those is most urgent?" work; the conversation lives in the browser tab only (`chatTurns` in `WorkspaceScreen.tsx`) and is cleared by **New conversation** or a reload. The browser sends at most 40 facts: stock, shipment and supplier facts first, then affected orders; orders after the delayed shipment are summed into one fact. If anything still does not fit, a "not shown" fact states how many were left out and the panel tells the user (`frontend/src/domain/assistantContext.ts`).

The document endpoint `POST /api/documents/extract` (`backend/src/documents.ts`) takes one PNG/JPG/WEBP/PDF (max 4 MB, base64 JSON, 6/min rate limit) plus the list of fields the current form needs. The server checks the file's first bytes match its claimed type before any model call, sends it to Gemini with `store: false`, and keeps a value only if it was requested, has the right shape (whole number, plain amount, ISO date-time with offset, short text), and comes with the document text it was read from. Nothing is written; the browser shows the proposal for the user to check and confirm.

## How Gemini is used (no training)
- Prompting with clear instructions.
- **Structured output** (JSON matching a schema) for Ask AI answers, document extraction and column matching (`backend/src/gemini.ts`, `documents.ts`, `importMapping.ts`).
- Multimodal input: images and PDFs. Audio/voice is planned, not built.
- Not used: function calling (the browser runs the planner and sends its results as facts), message drafting (supplier messages are templated in `frontend/src/presentation/supplierAsk.ts`).
- No fine-tuning.
- Model: `gemini-3.5-flash-lite` by default, configurable through `GEMINI_MODEL`.

## Required Google tech and its role
| Tech | Role in Rehearsal |
|---|---|
| **Gemini** | Reading documents, column matching, Ask AI answers |
| **Cloud Run** | API; holds the Gemini key server-side; re-checks a plan before approval |
| **Firestore** | Not used yet (open risk in `TODO.md`) |
| **Firebase** | Hosting (frontend, `/api` rewrite to Cloud Run); Authentication and synced workspaces deferred to V2 |

## V1 stack
- **Frontend:** React web app, mobile-friendly, on Firebase Hosting. Browser camera and
  microphone for receipt photos and voice.
- **Backend:** TypeScript/Node on Cloud Run. The deterministic planner lives in `shared/planner/` (plain TypeScript, no libraries) and is used by both the browser and the API. Before an approval is recorded, `POST /api/plans/check` re-runs it on the submitted workspace (validated by `shared/planner/validate.ts`, with size caps) so the server never takes the browser's word for a plan's status. The Docker image is built from the repository root (`docker build -f backend/Dockerfile .`) so `shared/` is included.
- **Scale shape:** products, locations, stock records, orders (with line items), shipments, transfer routes and supplier offers are all lists. The planner only calculates (location, product) groups touched by a disruption, so work grows with the disruption, not with the size of the business. Money, times and number formats come from the workspace country.
- **Gemini provider:** Google AI Studio API key, held only by the backend as `GEMINI_API_KEY`; never exposed in browser code.
- **Ask AI model:** Gemini 3.5 Flash-Lite with low thinking, a bounded output size, and a 15-second request timeout for interactive latency. Model selection stays configurable through `GEMINI_MODEL`.
- **Demo data:** the sample workspace (`shared/planner/sample.ts`) is kept in the browser's localStorage under `rehearsal.demo.v2` (`frontend/src/data/demoStore.ts`); **Reset** restores it.
- **Real data:** today a Real workspace is stored in the browser (IndexedDB, `frontend/src/data/realStore.ts`) with a downloadable backup (`data/backup.ts`); Gemini receives only the explicitly submitted question/context or scan for processing. Rehearsal's backend stores nothing. Cloud save and sign-in are deliberately out of V1 (data is per device; use Download backup to move it), see `TODO.md`. Firestore is not used yet; see the open risk in `TODO.md`.
- **Column matching:** `POST /api/imports/map` (`backend/src/importMapping.ts`) sends Gemini column names (and optionally a few sample rows) and returns only fields of the chosen import kind and column numbers that exist, each used once. The file itself is parsed in the browser and never uploaded.
- **Plan re-check at scale:** `POST /api/plans/check` receives only the slice of the workspace one plan reads (`shared/planner/slice.ts`), so a large business sends a small request; a test proves the slice gives the same answer as the whole workspace.
- **Development proxy:** Vite forwards `/api` to the local Node API on port 8080. In production Firebase Hosting rewrites `/api/**` to the Cloud Run service (`firebase.json`).
- **Rate limits** (in memory, per instance, `backend/src/app.ts`): Ask AI 10/min, documents 6/min, column matching 10/min, plan check 30/min.

## Main data concepts (for Firestore; not a schema yet)
Workspace · Business template(s) · Users and roles · Items · Locations · Inventory ·
Suppliers · Incoming shipments · Orders (commitments) · Capacity · Rules/constraints ·
Facts (value + source + confirmed time) · Name mappings · Incident sets · Incidents ·
Questions/answers · Plans (actions + checked outcome + status) · Actions (prepared / applied /
sent / confirmed) · Audit log (for undo and history).

## Main flows (as built)
1. **Intake:** type it in, import a file, or upload a document → Gemini proposes values with quotes → user checks → review shows the effect → user saves. No audit entry is kept.
2. **Rehearse:** the planner in the browser (`rehearse` in `shared/planner/plan.ts`) computes impact and checks every option on each change. Gemini does not propose candidates.
3. **Approve:** server re-runs the planner on the plan's slice (`POST /api/plans/check`) → warning if details are typed in or conflicts are open → `applyPlan` (`shared/planner/apply.ts`) records the transfer/purchase/ship-from in the workspace. Nothing is sent.
4. **Change:** any saved change clears the approval and the options are recalculated.

## Security and cost (public demo link)
- Gemini API credentials only on the backend, never in the browser.
- V1 Real workspace facts and uploaded evidence remain browser-local; Rehearsal does not persist them on the backend.
- Demo uses synthetic data only and can be reset. Nothing is stored in Firestore today.
- Firebase Authentication and Firestore rules for private synced workspaces are required before Real data is ever persisted to Firestore; this is V2, not a V1 shortcut.
- Rate limits and a spending cap so a public link cannot burn the Gemini budget.
- Validate uploaded file types and sizes.
- Do not persist Real workspace prompts or receipt images on the API. Use stateless Gemini interactions (`store: false`) and disclose that submitted content is sent to Google for processing.
- Local in-memory rate limits are a development guard only; configure Cloud Run scale limits and production request/budget controls before a public AI endpoint is deployed.

## Correctness
- The sample's outcome (24 exposed, transfer of 8 leaves 16, all-at-once rejected by 6) is pinned by `shared/planner/plan.test.ts`; the four `test-data/` scenarios are checked by hand.
- Engine tests cover receiving limits, timing, costs, storage room, conflicts, unknown supplier facts and applying a plan; see `07-bug-map.md` for what each test protects.
- The planner re-runs on every change in the browser, and once more on the server before an approval.
- No budget rule exists yet.
