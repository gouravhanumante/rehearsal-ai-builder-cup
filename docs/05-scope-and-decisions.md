# 05 — Scope, Decisions, Open Questions, Risks

## MVP scope for the 18 October submission (PROPOSED)
In:
- Three business templates (Seller, Distributor, Manufacturer) with sample businesses.
- No-signup "Try a sample business" entry for judges.
- Disruption input by text, voice and document/photo upload → proposed update → confirm/edit.
- Disruption types: supplier/shipment delay, stock shortage, capacity loss (warehouse,
  machine, staff, vehicle).
- Incident sets with more than one disruption.
- Impact view: affected orders and resources.
- Guided questions for missing facts.
- Two or three checked plan options with tradeoffs; rejected options show why.
- Objective selection (protect deliveries / minimise cost / balance).
- Approve → apply internally → prepared drafts (messages, purchase requests, tasks).
- Undo last update, start new rehearsal, discard draft.

Out (later):
- Real integrations (inventory systems, email sending, supplier APIs, purchasing).
- Automatic execution of external actions.
- Full role/permission management (MVP may have Owner only).
- Spreadsheet upload for arbitrary formats (MVP may support one template format).
- Learning from history, forecasting.

## Decisions made
| Decision | Date |
|---|---|
| Build "Rehearsal": disruption recovery for small businesses | 2026-10-13 |
| Generic core with Seller, Distributor, Manufacturer templates | 2026-10-13 |
| Web app (mobile-friendly), not a native mobile app — judges need a link | 2026-10-13 |
| Gemini proposes, code checks; no numbers trusted from the model | 2026-10-13 |
| Every data change needs user confirmation | 2026-10-13 |
| First version prepares external actions, does not send them | 2026-10-13 |
| No AI training/fine-tuning; prompting + structured output + function calling | 2026-10-13 |
| TypeScript/Node backend; AI Studio API key held server-side | 2026-10-14 |
| Demo and Real are separate workspaces; Real is browser-local in V1, sign-in/sync in V2 | 2026-10-14 |
| Real-mode stock counts require attached evidence; extraction and applying changes are separately confirmed | 2026-10-14 |
| Real-mode questions/selected evidence may be sent to Gemini for processing; Rehearsal does not persist those requests/files | 2026-10-14 |
| Docs first, then code. Folder: /Users/gourav.hanumante/AIBuilder2026 | 2026-10-13 |

## OPEN questions (ask the user)
1. **Theme:** Retail & Commerce or Manufacturing? Must pick one.
   - Retail & Commerce explicitly lists inventory, demand planning, operational efficiency;
     sellers and distributors are the larger user group.
   - Manufacturing lists supply and demand, operational data → actions.
2. **Demo hero business:** which template leads the video? (Others shown briefly.)
3. **Stack:** React + TypeScript/Node selected; Cloud Run/Firebase project setup remains.
4. **Name:** keep "Rehearsal"? Not checked for conflicts.
5. **Languages:** English only, or also voice in Hindi/other languages for the demo?
6. **Team:** who is on the team (2–4 required, formation closes 14 Oct)? User does all work.
7. **Video length:** confirm with organisers (3 vs 3–4 minutes).
8. **Deck template:** read the provided .pptx and plan slides.
9. **Employer policy:** confirm outside-work approval if required.
10. **Prior art:** quick search for similar products before final pitch wording.

## Risks
| Risk | Mitigation |
|---|---|
| 5 days, one builder | Strict MVP; sample data first; cut integrations |
| Engine scope explodes (real scheduling is hard) | Small models: few items, orders, resources; simple rules |
| Gemini misreads a document | Proposed update + confirmation; highlight low confidence |
| Plans look clever but are wrong | Engine re-checks every plan; golden scenarios |
| Public demo abused / cost spike | Rate limits, spend cap, isolated demo workspaces |
| Prototype down during evaluation | Keep deployment simple; monitor; no expiring credentials |
| Looks like "just another chatbot" | Demo must show the checker rejecting a tempting plan |

## Ideas considered and rejected (for context)
- Document analysers (food label compliance, supplier certificate checker, claim checker):
  useful but generic "AI reads files and flags issues".
- Insurance fraud detection: crowded market.
- Policyholder claim-cut fighter / hospital room-rent calculator: interesting, but narrower
  and depends on regulation text we would need to verify.
- Rental deposit dispute, flat handover defects: weaker theme fit.
- Disaster coordination: powerful, but hard to make dependable and demo honestly.
- Personal bureaucracy agent: brittle portal automation.
Chosen instead: a system that **rehearses responses to disruption** and carries one into action.
