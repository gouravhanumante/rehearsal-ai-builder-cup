# 04 — Architecture (V1 direction confirmed 2026-10-14)

The V1 direction below is confirmed. Cloud deployment, Firebase, Firestore, and local Real workspace storage are not yet implemented.

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

The Ask AI endpoint sends the user's question plus current workspace facts/options to Gemini with `store: false`. It returns plain-language explanation and references to known options; the server filters unknown option IDs and allows recommendations only for planner-ready options. The model does not write records or define plan status. Answers with unsupported numeric claims are replaced by a safe message directing users to verified UI figures.

## How Gemini is used (no training)
- Prompting with clear instructions and a few examples.
- **Structured output** (JSON matching a schema) for extracted updates, questions, answers,
  candidate plans.
- **Function calling** so Gemini can ask the engine to check or evaluate a plan.
- Multimodal input: images, PDFs and audio directly.
- No fine-tuning is planned.
- Model choice: the current Gemini model available on Vertex AI / AI Studio at build time.
  Verify names and quotas then; do not hard-code assumptions here.

## Required Google tech and its role
| Tech | Role in Rehearsal |
|---|---|
| **Gemini** | Document/voice understanding, questions, candidate plans, explanations, drafts |
| **Cloud Run** | Backend API and planning engine; holds the Gemini credentials server-side |
| **Firestore** | Resettable synthetic Demo workspace and its sample facts/plans; no Real-mode records in V1 |
| **Firebase** | Hosting (frontend); Authentication and synced user workspaces deferred to V2 |

## V1 stack
- **Frontend:** React web app, mobile-friendly, on Firebase Hosting. Browser camera and
  microphone for receipt photos and voice.
- **Backend:** TypeScript/Node on Cloud Run. The deterministic planner remains code-owned; current sample rules are implemented in the frontend domain module and will move to a shared/server-owned boundary before real workspace changes are applied.
- **Gemini provider:** Google AI Studio API key, held only by the backend as `GEMINI_API_KEY`; never exposed in browser code.
- **Demo data:** resettable sample workspace; planned Firestore use is only for sample/demo state and audit data.
- **Real data:** V1 design is browser-local with evidence attachments; Gemini receives only the explicitly submitted question/context or scan for processing. No Rehearsal backend persistence or cross-device sync. Firebase Authentication and synced Real workspaces are deferred to V2.
- **Development proxy:** Vite forwards `/api` to the local Node API on port 8080. Production will use Firebase Hosting rewrites to Cloud Run.

## Main data concepts (for Firestore; not a schema yet)
Workspace · Business template(s) · Users and roles · Items · Locations · Inventory ·
Suppliers · Incoming shipments · Orders (commitments) · Capacity · Rules/constraints ·
Facts (value + source + confirmed time) · Name mappings · Incident sets · Incidents ·
Questions/answers · Plans (actions + checked outcome + status) · Actions (prepared / applied /
sent / confirmed) · Audit log (for undo and history).

## Main flows
1. **Intake:** upload/voice/text → Gemini extract → proposed update → user confirms →
   engine applies → audit entry.
2. **Rehearse:** incident set + business state → engine computes impact → Gemini proposes
   candidates → engine checks and scores → missing facts become questions → options shown.
3. **Approve:** user picks plan → engine applies internal changes → Gemini drafts messages →
   actions saved as *prepared*.
4. **Change:** new or corrected fact → dependent plans marked outdated → re-rehearse.

## Security and cost (public demo link)
- Gemini API credentials only on the backend, never in the browser.
- V1 Real workspace facts and uploaded evidence remain browser-local; Rehearsal does not persist them on the backend.
- Demo uses synthetic data only and can be reset. Firestore must contain only Demo/sample data in V1.
- Firebase Authentication and Firestore rules for private synced workspaces are required before Real data is ever persisted to Firestore; this is V2, not a V1 shortcut.
- Rate limits and a spending cap so a public link cannot burn the Gemini budget.
- Validate uploaded file types and sizes.
- Do not persist Real workspace prompts or receipt images on the API. Use stateless Gemini interactions (`store: false`) and disclose that submitted content is sent to Google for processing.
- Local in-memory rate limits are a development guard only; configure Cloud Run scale limits and production request/budget controls before a public AI endpoint is deployed.

## Correctness
- **Golden scenarios:** sample businesses with known correct outcomes, checked automatically.
- Engine tests for the hard rules: no double allocation, no use of unavailable stock, no
  budget breach, dates respect lead times and capacity.
- Every plan shown to the user is re-checked by the engine immediately before display.
