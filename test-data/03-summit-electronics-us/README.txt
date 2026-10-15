03 - Summit Electronics Wholesale (United States, USD, dates month/day)
CSV files (comma separated) with month/day/year dates and different column names
(Branch, Item, On Hand, PO Number, Account, Qty Ordered, Need By, VIP, ASN, Vendor, Quantity Shipped, Ship To, ETA).

HOW TO USE (start with "Set up my business" on the start screen)
 1. Name your business and pick the country shown above.
 2. Setup tab > "Import file" on Stock counts (choose 1-...), then on Open orders (2-...), then on Incoming shipments (3-...).
    On each, check the column matching, then "Check", then confirm. Locations and products are created for you.
 3. Setup > Incoming shipments > Report a delay (or Overview > Report a delay). Pick the shipment named below and type the new arrival.
 4. Open the Overview: the orders that depended on that shipment show as at risk, with the exposed quantity.
 5. Receipts: upload with "Attach proof" in the matching editor; Gemini reads the file and you check each value before saving.
    Where to open each editor:
      - supplier-quote-chargepoint.pdf      Suppliers > Add supplier > Attach proof (65W GaN Charger, deliver to Dallas Warehouse)
      - delay-text-voltedge.png             Report a delay > Attach proof (shipment ASN-4410; new arrival 10/23/2026 1:00 PM)
      - count-sheet-houston-store.jpg       Inventory > pick 65W GaN Charger > Houston Store > Attach count sheet ( reads 28, file says 40)
      - purchase-order-technest.pdf         Orders > Edit PO-88101 > Attach proof (Charger 75, was 60)
      - transfer-booking-austin-to-dallas.pdf  first Setup > Add transfer route (Austin Store to Dallas Warehouse), then Edit transfer > Attach proof

Delay to try: ASN-4410 (65W GaN Charger) to 10/23/2026 13:00.
Expected: Dallas Warehouse has 35 chargers, and 110 are due before the new date (TechNest 60 priority, Lone Star 50),
so about 75 are exposed and two orders are at risk.

Dispatch check (frontend/src/import/scenarios.test.ts, shared/planner/ledger.ts:sendOrder):
TechNest needs 60 chargers, so Send must be refused with only 35 counted;
neither chargers nor mice leave. After checking the physical stock and recording
a charger count of 60, sending consumes 60 chargers and 40 mice. Dallas then has
0 chargers and 20 mice; Lone Star remains 50 chargers short.
