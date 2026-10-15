# Browser Test Matrix

Manual test ledger for Rehearsal. Run against the local app and API; this is a scenario catalogue, not a claim that every possible data combination has been exercised. Mark each case **Tested** only after observing the result in the internal browser. Keep sample/demo data isolated from the user's guest workspace.

## Run Setup

- Frontend: `http://127.0.0.1:5173/` (`cd frontend && npm run dev -- --host 127.0.0.1`)
- API: `http://localhost:8080` (`cd backend && npm run dev`); approval checks require it.
- Start from **Reset** → **Open the sample**. Confirm workspace label says **Sample data**.
- For a fresh run, reset before each top-level scenario. For sequential stock cases, record the starting count and do not reset between linked steps.
- Evidence is limited to the local sample and the runs logged below. Google account, two-device, emulator, and production scenarios are not browser-proven here.

## Status Legend

| Status | Meaning |
|---|---|
| Tested | Actually performed in the local browser and observed. |
| Pending | Specific scenario still needs a browser run. |
| Blocked | Needs a second real account/device, external service, or implementation not yet present. |

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
| T08b | Depart within the booking but above the current source count. Reject with no stock or history change. | Pending | Needs a booking followed by a lower physical recount. |
| T09 | Retry the same departure action. No duplicate source deduction, inbound batch, or history entry. | Pending | Shared tests cover action IDs; browser double-submit/network retry not exercised. |
| T10 | Two departures from one booking at different times. Each creates a separate inbound batch and ETA; booked remainder is correct. | Pending | One partial 3-case departure was tested; a second departure from the same booking was not. |
| T11 | Book two transfers from one source to different destinations/products. Each booking is held once and planner cannot spend held stock again. | Pending | Cross-product and cross-destination browser case pending. |
| T12 | Receiving capacity counts booked quantities, departed batches, and already received transfer quantities by business-local day, across products. | Pending | Existing automated rules cover parts; interactive cross-product browser case pending. |
| T13 | Partial receipt of a departed batch; remainder Yes with date / No. Actual received count is added once; remaining arrival is correct. | Pending | Supplier partial receipt UI needs manual check with transfer child batch. |
| T14 | Cancel a fully departed transfer. It must refuse to restore source stock; arrival/return/loss must be resolved explicitly. | Pending | Current dialog exposes cancel only for a remaining booking; edge behavior needs browser confirmation. |
| T15 | Say a departed transfer remainder will not arrive. Keep it visible but out of forecasts; resolve as lost or returned. Loss must not restore source stock; return must add only the returned quantity. | Tested | 6 of 8 received, 2 unresolved; lost kept South at 6; separate reset/run resolving returned raised South to 8. |

## Customer Orders And Stock Ledger

| ID | Scenario and expected result | Status | Run notes |
|---|---|---|---|
| O01 | Full send from sufficient counted stock. Deduct each product once and close as sent. | Tested | Sent Harbor Market's 12 from North Hub: count fell 14→2, success notice named ORD-1086 and it moved to Sent and cancelled. |
| O02 | Partial send with split answer unknown. Require Yes/No before saving; nothing changes until a choice. | Tested | No answer kept Send disabled; No blocked partial; Yes enabled it. |
| O03 | Partial send accepted. Show original quantity, sent, and outstanding under original due date; planner uses outstanding only. | Tested | Sent 6 of 18; Orders showed 6 sent / 12 left, due unchanged, 8 covered; stock fell 14→8. |
| O04 | Customer says no to split. Part send is blocked; sending full remainder is allowed. | Tested | For Harbor Market, No blocked a 6-case partial with a clear message; the 12-case full remainder then sent and the order moved to Sent and cancelled. |
| O05 | Multi-product order: one product fully sent and another partial. Only outstanding product quantities remain planned. | Pending | Shared test passes; browser run pending. |
| O06 | Over-send, zero new send, invalid whole-number entry, or insufficient stock. Refuse without movement/history. | Tested | `0`, `-1`, and `1.5` showed validation errors; 19 exceeded the 18-case order, and 15 exceeded the 14 counted. Each disabled Send; no movement was recorded. |
| O07 | Correct one dispatch down/up/to zero. Only that dispatch changes; other orders on the same truck remain unchanged. | Tested | Corrected first send 5→4 while second 4-case send remained untouched; stock stayed 5 because a later count had been recorded. |
| O08 | Correct a send after a later physical count. Keep the count unchanged; do not add the discrepancy twice. | Tested | Added explicit **Record this count again** control; repeated count 5→5 saved as a count movement; correction after it left stock at 5. |
| O09 | Cancel remainder after a partial send; sent stock remains deducted. Reopen restores only unsent demand, never stock. | Tested | After 8 sent, cancelled 10; reopened 10 outstanding; North stock remained 5 throughout. |
| O10 | Edit/import order quantity below sent amount or move its warehouse after dispatch. Reject or route to explicit reconciliation; no historical movement rewrite. | Pending | Order quantity guards exist in editor and CSV import; browser re-import/move-after-dispatch checks remain. |
| O11 | Past-due outstanding quantity remains demand and may be sent late without rewriting the promise. | Pending | Planner/browser case pending. |
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
| R04 | Overdelivery. Record physical amount and flag any source/quote discrepancy; no negative or invented stock. | Pending | Current receive behavior permits overdelivery; discrepancy UX still open. |
| R05 | Repeating delivery arrives late across one or more occurrences. Each occurrence is unique; no duplicate receipt or silent skipped week. | Pending | Recurrence occurrence identity remains open. |
| I01 | Stock import writes count events; repeated import of same count is unchanged; changed count becomes new count event. | Pending | |
| I02 | Orders CSV re-import after a partial send cannot reduce ordered quantity below sent quantity. | Pending | Known TODO: import path guard not yet implemented. |
| B01 | Export then restore a ledger workspace. Counts and movements round-trip exactly; tampered/old backup reports clearly. | Pending | Format v3 intentionally rejects old saves. |
| B02 | Guest reload/reset preserves or clears only the sample/guest workspace as intended. | Pending | Do not use the user's existing business. |

## Approval, Planning, Accessibility, Responsive

| ID | Scenario and expected result | Status | Run notes |
|---|---|---|---|
| P01 | With API running, approve plan after server recheck. With API stopped, approval fails visibly and changes nothing. | Tested | 502 surfaced as “couldn't double-check”; with API running transfer approval succeeded. |
| P02 | Approval reservation makes source orders reflect only free stock, and doesn't present booked stock as already inbound/covered. | Pending | Planner code updated; full interactive cross-view test pending. |
| P03 | Two bookings compete for same source free quantity; second cannot over-reserve, including across products/destinations. | Pending | Two-device atomic reservation remains unbuilt. |
| P04 | A late-but-useful transfer is offered with an explicit warning, not silently discarded. | Pending | Planner behavior exists; browser path and warning wording still need a manual run. |
| P05 | Customer message after booking/departure uses true facts and does not claim goods sent before departure. | Pending | Copy/History wording needs review. |
| U01 | Keyboard navigation, Escape close, focus return, disabled/error announcement, labels and numeric input. | Pending | |
| U02 | Narrow mobile viewport: dialogs fit, actions do not overlap, tables can be scanned/operated. | Pending | |
| A01 | Google sign-in, guest-to-account migration, real Firestore save, two devices, stale revision and offline retry. | Blocked | Requires authenticated real account and/or two clients; use a dedicated test account only. |

## Bugs Found During This Pass

- Inventory initially counted both a transfer booking and its departed batch as “arriving.” Fixed by excluding `transferStatus === 'booked'` from arriving totals; browser then showed 27 arriving (supplier 24 + departed batch 3), not 35, and after receiving the batch showed 24.
- Approval initially depended on Vite's API proxy; with only the frontend server running it returned 502 and made no change. Starting the local backend allowed the normal approval recheck. Keep this in setup instructions; do not bypass the recheck.

## Current Session State

The browser workspace is the sample **Northstar Supply**, not a real/guest business. Current state after Reset: SH-204 is expected at North Hub; North and South both show 14; customer travel time is unknown at both locations. Servers: Vite `127.0.0.1:5173`; API `localhost:8080`.
