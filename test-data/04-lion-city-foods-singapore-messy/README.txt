04 - Lion City Foods (Singapore, SGD, dates day/month) - MESSY FILES ON PURPOSE
CSV files separated by semicolons (;), with unusual column names, so the app cannot guess them:
click "Ask Gemini" on the matching step. Several rows are bad on purpose to show how problems are handled.

HOW TO USE (start with "Set up my business" on the start screen)
 1. Name your business and pick the country shown above.
 2. Setup tab > "Import file" on Stock counts (choose 1-...), then on Open orders (2-...), then on Incoming shipments (3-...).
    On each, check the column matching, then "Check", then confirm. Locations and products are created for you.
 3. Setup > Incoming shipments > Report a delay (or Overview > Report a delay). Pick the shipment named below and type the new arrival.
 4. Open the Overview: the orders that depended on that shipment show as at risk, with the exposed quantity.
 5. Receipts: upload with "Attach proof" in the matching editor; Gemini reads the file and you check each value before saving.
    Where to open each editor:
      - supplier-quote-kallang-rice.pdf     Suppliers > Add supplier > Attach proof (Jasmine Rice 5kg, deliver to Lion City DC)
      - delay-telegram-golden-grain.png     Report a delay > Attach proof (shipment D-501; new arrival 21/10/2026 15:00)
      - count-sheet-tampines-outlet.jpg     Inventory > pick Cooking Oil 2L > Tampines Outlet > Attach count sheet (reads 12: the stock file had "twelve")
      - purchase-order-marina-hotel.pdf     Orders > Edit T-9008 > Attach proof (Cooking Oil 120, was 100)
      Note the photos are tilted like a phone picture.

What the import should report (rows left out, nothing guessed):
  stock:   "twelve" (not a number), a blank count, "-5", and a repeated Jurong rice row (first kept: 1,020 is read as 1020)
  orders:  T-9005 (31/11 is not a real date), T-9006 (its two rows disagree on the due date), T-9007 ("lots") are left out whole
  Names like LION CITY DC and "lion city dc " are treated as the same place.

Delay to try: D-501 (Jasmine Rice 5kg) to 21/10/2026 15:00.
Expected: Lion City DC has 420 bags, and 550 are due before the new date (Hawker Centre Co-op 300 priority, Sunrise Catering 250),
so about 130 are exposed and two orders are at risk.
