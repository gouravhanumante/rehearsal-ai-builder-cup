# 04 — Architecture (PROPOSED — not confirmed)

Nothing here is final until the user confirms it. No code exists yet.

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
| **Firestore** | Workspaces, business data, facts with source, incidents, plans, audit history |
| **Firebase** | Hosting (frontend), Authentication (incl. no-signup demo entry), Storage (uploads) |

## Proposed stack (OPEN — confirm before coding)
- **Frontend:** React web app, mobile-friendly, on Firebase Hosting. Browser camera and
  microphone for receipt photos and voice.
- **Backend:** Python on Cloud Run. Reason: Google OR-Tools (open-source optimisation
  library) is strongest in Python for scheduling/allocation checks.
- Alternative: TypeScript backend with a simpler hand-written checker. Smaller, but weaker
  optimisation.

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
- Firebase Auth on every request; Firestore rules restrict each workspace to its users.
- Demo workspaces isolated per visitor; sample data resettable.
- Rate limits and a spending cap so a public link cannot burn the Gemini budget.
- Validate uploaded file types and sizes.

## Correctness
- **Golden scenarios:** sample businesses with known correct outcomes, checked automatically.
- Engine tests for the hard rules: no double allocation, no use of unavailable stock, no
  budget breach, dates respect lead times and capacity.
- Every plan shown to the user is re-checked by the engine immediately before display.
