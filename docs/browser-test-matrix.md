# Browser Test Matrix

Manual test ledger for Rehearsal. Run against the local app and API; this is a scenario catalogue, not a claim that every possible data combination has been exercised. Mark each case **Tested** only after observing the result in the internal browser. Keep sample/demo data isolated from the user's guest workspace.

## Run Setup

- Frontend: `http://127.0.0.1:5173/` (`cd frontend && npm run dev -- --host 127.0.0.1`)
- API: `http://localhost:8080` (`cd backend && npm run dev`); approval checks require it.
- Start from **Reset** → **Open the sample**. Confirm workspace label says **Sample data**.
- For a fresh run, reset before each top-level scenario. For sequential stock cases, record the starting count and do not reset between linked steps.
- Evidence is limited to the local sample and the runs logged below. Google account, two-device, emulator, and production scenarios are not browser-proven here.
- Seeding a scenario: in the browser console, import `shared/planner/sample.ts` through Vite (`/@fs/<repo>/shared/planner/sample.ts`), change a copy with the shared ledger/plan functions (`countStock`, `sendOrder`, `applyPlan`), write it to `localStorage['rehearsal.demo.v3']`, and reload. Stock is recomputed from movements on load (`parseWorkspace`), so a seeded state is the same as one reached by clicking. The step under test is then done in the UI. Guest-business cases use `saveReal` from `frontend/src/data/realStore.ts`; check first that no guest business exists, and delete the test one afterwards.

## Status Legend

| Status | Meaning |
|---|---|
| Tested | Actually performed in the local browser and observed. |
| Pending | Specific scenario still needs a browser run. |
| Blocked | Needs a second real account/device, external service, or implementation not yet present. |
| Failed | Run in the browser; the expected result did not happen. Not fixed yet. |
| Needs decision | Run in the browser; it works as coded, but contradicts another part of the app. Needs the user's ruling. |

## Transfer Booking And Departure

| ID | Scenario and expected result | Status | Run notes |
|---|---|---|---|
| T01 | Approve a ready transfer. Source physical stock stays the same; Inventory shows on-hand, booked, and free separately; Suppliers says booked/not departed; receiving is unavailable. | Tested | Northstar: South Hub 14 on hand, 8 booked, 6 free. Booking did not deduct stock. No Mark received button before departure. |
| T02 | Cancel booking before any departure. Source remains unchanged, booked becomes 0, destination no longer forecasts those goods. | Tested | Cancelled TR-1; South stayed at 14, booked 0; North no longer included TR-1. |
| T03 | Depart the full booking. Source decreases exactly once; reservation becomes 0; destination shows an inbound batch; receipt becomes available. | Tested | Book 8: South 14→6, booked 8→0, free 6. |
| T04 | Depart part (3 of 8). Source decreases 3; remaining 5 stays booked; free stock reflects both the physical reduction and remaining reservation; separate batch gets departure-based ETA. | Tested | South 14→11, booked 8→5, free 6; 3-case child batch ETA updated from departure time. |
| T05 | Cancel the remaining 5 after 3 departed. Source stays 11; reservation clears; the 3-case departed batch remains expected. | Tested | South 11, booked 0, free 11; child batch remained in Suppliers and Inventory. |
| T06 | Receive the already-departed 3 after cancelling remainder. Destination increases by 3; source does not change; only that batch is removed from inbound. | Tested | North 14→17; South stayed 11; transfer batch disappeared from arriving stock. |
| T07 | Attempt to receive a booked-but-not-departed transfer. It must not add destination stock. | Tested | Mark received was withheld and a “Record departure” instruction shown before departure. |
| T08 | Depart zero, negative, fractional, or more than booked. No stock or history change; clear error. | Tested | On TR-1 (8 booked, 14 counted), `-1`, `0`, `1.5`, and `9` were rejected with an inline error and disabled action; no departure was recorded. |
| T08b | Depart within the booking but above the current source count. Reject with no stock or history change. | Tested | Seeded: booked 8, then recount South 14→5. Departing 8 was refused on submit ("Not enough counted Harbor Blend Coffee at South Hub"); no movement recorded. Finding: the button stays enabled until submit, and Inventory shows "5 on hand · 8 booked · 0 free" with no warning that the booking can no longer be filled. |
| T09 | Retry the same departure action. No duplicate source deduction, inbound batch, or history entry. | Tested | Double-clicked Record departure for 3: one transfer-out of 3, one batch, one History entry; booking 8→5. |
| T10 | Two departures from one booking at different times. Each creates a separate inbound batch and ETA; booked remainder is correct. | Tested | Departed 3 then 2: two batches, each ETA = its departure + 3 h; South 14→9, 3 booked, 6 free. Minor: the 3 still booked keep the original 12:00 pm ETA, already in the past. |
| T11 | Book two transfers from one source to different destinations/products. Each booking is held once and planner cannot spend held stock again. | Tested | Seeded East Hub (order of 10, route from South). Before booking, offers were North 8 + East 10 = 18 against South's 14, with no warning that they compete. After approving North, East's offer dropped to 6; after approving East, South showed 14 on hand · 14 booked · 0 free and no further transfer was offered. |
| T12 | Receiving capacity counts booked quantities, departed batches, and already received transfer quantities by business-local day, across products. | Tested | Seeded Oat Milk short at North. Before the coffee booking the oat transfer was ready (5); after booking 8 coffee for the same day it was ruled out: "8 cases are already received or booked for that day… No room for more." |
| T13 | Partial receipt of a departed batch; remainder Yes with date / No. Actual received count is added once; remaining arrival is correct. | Tested | Batch of 3: received 2, rest not coming → 1 unresolved, out of forecast, Resolve fate offered. Batch of 2: received 1, rest Fri 10:00 → 1 expected then. One receipt movement each. Wording: "Are the other 1 case…", "from Transfer from South Hub". |
| T14 | Cancel a fully departed transfer. It must refuse to restore source stock; arrival/return/loss must be resolved explicitly. | Tested | After all 8 departed, the booking had no Cancel button and South stock was not restored. Bug found and fixed: the unresolved batch was listed under Transfer bookings as "Booked · departed nothing" (`TransfersView` now lists only `transferStatus === 'booked'`). |
| T15 | Say a departed transfer remainder will not arrive. Keep it visible but out of forecasts; resolve as lost or returned. Loss must not restore source stock; return must add only the returned quantity. | Tested | 6 of 8 received, 2 unresolved; lost kept South at 6; separate reset/run resolving returned raised South to 8. |

## Customer Orders And Stock Ledger

| ID | Scenario and expected result | Status | Run notes |
|---|---|---|---|
| O01 | Full send from sufficient counted stock. Deduct each product once and close as sent. | Tested | Sent Harbor Market's 12 from North Hub: count fell 14→2, success notice named ORD-1086 and it moved to Sent and cancelled. |
| O02 | Partial send with split answer unknown. Require Yes/No before saving; nothing changes until a choice. | Tested | No answer kept Send disabled; No blocked partial; Yes enabled it. |
| O03 | Partial send accepted. Show original quantity, sent, and outstanding under original due date; planner uses outstanding only. | Tested | Sent 6 of 18; Orders showed 6 sent / 12 left, due unchanged, 8 covered; stock fell 14→8. |
| O04 | Customer says no to split. Part send is blocked; sending full remainder is allowed. | Tested | For Harbor Market, No blocked a 6-case partial with a clear message; the 12-case full remainder then sent and the order moved to Sent and cancelled. |
| O05 | Multi-product order: one product fully sent and another partial. Only outstanding product quantities remain planned. | Tested | Seeded order 6 coffee + 4 oat milk (2 oat counted). Sent 6 + 2: only 2 oat milk still planned. Bug found and fixed: note read "Sent so far: 6 cases, 2 cases of 6 cases, 4 cases"; now "6 of 6 cases Harbor Blend Coffee, 2 of 4 cases Oat Milk" (`CommitmentsPanel` `sentNote`). Minor: a two-product order shows one row per product, each with its own Send/Edit/Cancel. |
| O06 | Over-send, zero new send, invalid whole-number entry, or insufficient stock. Refuse without movement/history. | Tested | `0`, `-1`, and `1.5` showed validation errors; 19 exceeded the 18-case order, and 15 exceeded the 14 counted. Each disabled Send; no movement was recorded. |
| O07 | Correct one dispatch down/up/to zero. Only that dispatch changes; other orders on the same truck remain unchanged. | Tested | Corrected first send 5→4 while second 4-case send remained untouched; stock stayed 5 because a later count had been recorded. |
| O08 | Correct a send after a later physical count. Keep the count unchanged; do not add the discrepancy twice. | Tested | Added explicit **Record this count again** control; repeated count 5→5 saved as a count movement; correction after it left stock at 5. |
| O09 | Cancel remainder after a partial send; sent stock remains deducted. Reopen restores only unsent demand, never stock. | Tested | After 8 sent, cancelled 10; reopened 10 outstanding; North stock remained 5 throughout. |
| O10 | Edit/import order quantity below sent amount or move its warehouse after dispatch. Reject or route to explicit reconciliation; no historical movement rewrite. | Tested | Editing oat milk 4→1 after 2 sent: "cannot be for less than that", stayed on step 1. Moving the order North→South after sending was allowed; past sends stayed recorded at North (coffee 14→8, oat 0), only the unsent 2 moved. CSV path: see I02. |
| O11 | Past-due outstanding quantity remains demand and may be sent late without rewriting the promise. | Needs decision | Seeded order due 14 Oct, 4 of 10 sent. The 6 stayed owed and sent late; due date stayed 14 Oct. But a day-overdue order showed as "Watch" under "No order short", with nothing saying the promised date has passed. |
| O12 | Run sample's full Orders, Inventory, Overview, History and Rehearsals views after movements. No inconsistent status or duplicate deduction. | Pending | |

## Customer Arrival Timing

| ID | Scenario and expected result | Status | Run notes |
|---|---|---|---|
| ETA01 | With no customer travel time, plan says arrival is unconfirmed, uses due-time wording rather than claiming a dispatch cutoff, and leaves the sample fact unknown. | Tested | Reset sample: North Hub showed `Ready · customer ETA unknown`; plan said warehouse before affected orders' due times and customer arrival unconfirmed. |
| ETA02 | Record customer travel time through the location editor. Review shows the old unknown value and new typed value; saving updates readiness and the warehouse dispatch cutoff, with typed facts still marked unverified. | Tested | Set North Hub to 1 hour: review changed `Ready · customer ETA unknown` to `Ready · unverified`; Book by moved from 11:00 am to 10:00 am, the copy included the 1-hour cutoff, and the approval warning listed the duration. |
| ETA03 | Reset the sample after editing. Travel returns to unknown and customer arrival is unconfirmed again. | Tested | Reset restored the empty travel field and unknown-ETA copy; sample data only. |
| ETA04 | Reject negative, fractional, and unsupported numeric-notation customer travel values without saving; confirm a valid zero-duration value can be reviewed. | Tested | `-1`, `1.5`, and `1e2` stayed on step 1 with “Enter a whole number”; `0` opened review. No value was saved. |

## Receiving, Suppliers, Imports, Backup

| ID | Scenario and expected result | Status | Run notes |
|---|---|---|---|
| R01 | Supplier arrival in full; stock increases once and inbound entry disappears. | Tested | Received all 24 from SH-204: North Hub rose 14→38, SH-204 disappeared from Incoming deliveries, and the success notice matched. |
| R02 | Supplier arrival partial; remainder Yes with date / No. Expected remainder and actual stock stay distinct. | Tested | Received 6 of 24: North Hub became 20 and the remaining 18 stayed incoming for Sat 17 Oct, 3 pm. Reset and repeated with No: stock increased by 6 and no inbound remained. |
| R03 | Zero arrived and nothing will arrive. Must distinguish cancelled shipment from Report late. | Tested | Checkbox required explicit confirmation; closing SH-204 removed expected arrival and left both warehouse counts at 14. First browser attempt found missing-answer gate; fixed then reran. |
| R04 | Overdelivery. Record physical amount and flag any source/quote discrepancy; no negative or invented stock. | Tested | First run: 30 received against 24 expected was recorded with no remark. Fixed: entering 30 shows "That is 6 cases more Harbor Blend Coffee than expected. Is that right?"; Add to stock stays disabled until confirmed; 30 recorded; notice and History say "(+6 over)" (`overExpected`). |
| R05 | Repeating delivery arrives late across one or more occurrences. Each occurrence is unique; no duplicate receipt or silent skipped week. | Tested | Weekly delivery due 8 Oct, seen on 15 Oct: card shows "Overdue since Thu, 8 Oct, 9:00 am"; dialog says the receipt is for that date. Received twice: receipts record 8 Oct and 15 Oct (`occurrenceAt`), notices name each week, schedule moves to 22 Oct. First run (before the fix) showed "Next Thu, 8 Oct" a week late and receipts without a week. |
| I01 | Stock import writes count events; repeated import of same count is unchanged; changed count becomes new count event. | Needs decision | Guest business, North derived stock 10 (count 14 − 4 sent). Importing 12 recorded a new count; importing the same file again changed nothing. But importing a count of 10 was "already the same" and not saved, while the editor's "Record this count again" deliberately saves an identical count so later send corrections are not added twice. Import and editor disagree. |
| I02 | Orders CSV re-import after a partial send cannot reduce ordered quantity below sent quantity. | Tested | Guest business, ORD-1086 4 of 12 sent. Imported quantity 2: row left out, "ORD-1086 already has 4 Harbor Blend Coffee sent; the imported order was left unchanged." Nothing saved. |
| B01 | Export then restore a ledger workspace. Counts and movements round-trip exactly; tampered/old backup reports clearly. | Tested | Backup made with `serializeBackup` (the internal browser does not report downloads), then restored through Restore from backup. Exact round-trip; hand-edited stock ignored (recomputed from movements); old version and non-JSON rejected with clear messages. A backup with an extra 500-case send on a 12-case order (hidden by a later count) was first accepted; fixed: now refused with "The backup says 504 cases of Harbor Blend Coffee were sent for ORD-1086, but that order is for 12. It was not restored." and no business created (`impossibleSend`). |
| B02 | Guest reload/reset preserves or clears only the sample/guest workspace as intended. | Tested | Sample edits survived reload; Reset cleared only `rehearsal.demo.v3` and showed the original sample; the guest business was byte-for-byte unchanged. Test guest business deleted afterwards. |

## Approval, Planning, Accessibility, Responsive

| ID | Scenario and expected result | Status | Run notes |
|---|---|---|---|
| P01 | With API running, approve plan after server recheck. With API stopped, approval fails visibly and changes nothing. | Tested | 502 surfaced as “couldn't double-check”; with API running transfer approval succeeded. |
| P02 | Approval reservation makes source orders reflect only free stock, and doesn't present booked stock as already inbound/covered. | Tested | See T11: after a booking, the next plan used only South's free 6; Inventory showed on hand / booked / free. |
| P03 | Two bookings compete for same source free quantity; second cannot over-reserve, including across products/destinations. | Blocked | In one browser, sequential bookings cannot over-reserve (T11). Two people booking at the same moment is not guarded; atomic reservation is not built. |
| P04 | A late-but-useful transfer is offered with an explicit warning, not silently discarded. | Tested | First run: a 30-hour transfer was only "Ruled out". Fixed: with Common Ground (priority, Thu 2 pm) 4 short and Lakeview (Sat) 10 short, the transfer is Ready: "…before the later orders' due times. Arrives after Common Ground Cafe's priority order is due, so it stays short.", outcome "6 cases still short, including a priority order". Approval passed the server recheck and booked 8. |
| P05 | Customer message after booking/departure uses true facts and does not claim goods sent before departure. | Needs decision | No message claims goods were sent. But right after approving the 8-case transfer, the plan said "Priority orders covered" while the messages told Common Ground it is 4 short and Harbor Market that all 12 come only after Friday's delivery. Messages ignore the booked transfer because bookings count only once they depart (`approvalMessages` reruns the plan on the booked workspace). |
| U01 | Keyboard navigation, Escape close, focus return, disabled/error announcement, labels and numeric input. | Tested | First run failed: focus stayed on the page, Tab walked the page behind, focus was not returned. Fixed with one shared hook (`useDialogFocus`) on all 11 dialogs. Rerun on Send, Receive, Edit count and Ask AI: focus moves in on open, 12 Tabs plus Shift+Tab stay inside, Escape returns focus to the opening button. |
| U02 | Narrow mobile viewport: dialogs fit, actions do not overlap, tables can be scanned/operated. | Tested | 390 px wide: Overview, Orders, Inventory, Between locations, Suppliers, Rehearsals, History and the Send dialog have no sideways scroll; dialog fits (343 px). |
| A01 | Google sign-in, guest-to-account migration, real Firestore save, two devices, stale revision and offline retry. | Blocked | Requires authenticated real account and/or two clients; use a dedicated test account only. |

## Bugs Found During This Pass

- Inventory initially counted both a transfer booking and its departed batch as “arriving.” Fixed by excluding `transferStatus === 'booked'` from arriving totals; browser then showed 27 arriving (supplier 24 + departed batch 3), not 35, and after receiving the batch showed 24.
- Approval initially depended on Vite's API proxy; with only the frontend server running it returned 502 and made no change. Starting the local backend allowed the normal approval recheck. Keep this in setup instructions; do not bypass the recheck.
- Between locations listed an unresolved departed batch as a booking ("Booked · departed nothing"). Fixed: `TransfersView` lists only `transferStatus === 'booked'` (T14).
- A two-product order's sent note read "6 cases, 2 cases of 6 cases, 4 cases". Fixed: per-product "6 of 6 cases Harbor Blend Coffee, 2 of 4 cases Oat Milk" (O05).

## Current Session State

The browser workspace is the sample **Northstar Supply**, not a real/guest business. Current state after Reset: SH-204 is expected at North Hub; North and South both show 14; customer travel time is unknown at both locations. No guest business is stored (the test one was deleted). Servers: Vite `127.0.0.1:5173`; API `localhost:8080`.
