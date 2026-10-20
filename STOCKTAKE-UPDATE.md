# Inventory stocktake update

Incremental update **after the POS trade-in and Header & footer updates**, plus the earlier inventory/FIFO, Pages, branding and delivery work. Apply those updates first if needed. This ZIP is not a complete repository replacement.

## Where and how to count

Open **Admin → Inventory → Stocktake**.

1. By default, the list shows only variants with stock available. Each row identifies the exact card, set/collector number, condition and finish. Search by card/set/collector number; optionally filter set code, condition and finish. Sort by name or set/collector (collector numbers use text ordering).
2. Count **available, unreserved copies only**. Exclude cards already allocated to online/POS orders, including unshipped reservations. This is not a count of every physical card including reserved orders. Set reserved copies aside before counting. Where practical, pause receiving/sales for the section being checked.
3. Enter the physical count directly, use +/−, or select **Same / checked**. Blank means not counted; **0 explicitly removes all available copies**. Enter confirms a blank matching row and advances to the next input; from the last row it opens the next page when available. Mobile rows put the printing, available quantity and count controls together without horizontal scrolling.
4. Use **Mark untouched page rows as matching** only after physically checking those rows. It fills currently blank draft counts, not an automatic inventory verification.
5. Move between pages or change filters without losing pending counts. Pages contain up to 100 exact variants; a batch can contain up to 500 counts. Save a batch before continuing past that limit. Enable **Include zero stock** to find an existing catalogue variant and record found copies. Normal receiving remains the right workflow for real purchases/trades with known costs.
6. Select **Review counts**, inspect expected/count/difference and enter a useful batch reason. **Apply batch & record checks** confirms and saves the whole batch. Matching counts are recorded too, even though they do not change stock.
7. After saving, the current page keeps its positions, including newly zero-stock rows, so counting onward does not skip shifted rows. Totals deliberately say **last load**; **Refresh live stock**, filtering or paging reads current quantities/totals again. Saved session checks are marked locally.

Whole counts must be between 0 and 1,000,000. Review does not change stock; only applying a batch does.

## Drafts, conflicts and recovery

- Pending counts, expected quantities, batch reason and saved-session check marks are stored in the current browser on the current site origin. Reload restores them; search filters and page selection start fresh. This is not a shared server-side stocktake session. Use one tab/device for a draft; do not rely on private browsing or clearing browser data.
- **Export pending counts** creates a spreadsheet-safe CSV backup. This update does not add CSV re-import of stocktake drafts. **New counting session** clears browser progress after confirmation, but never deletes server audits.
- If stock changed after a row was first counted, **the entire batch is rejected**, not partially applied. Discard the affected count, refresh/recount against current stock, then review again. A FIFO balance mismatch also rejects the whole batch: investigate inventory history rather than forcing the count or resetting data.
- The editor stores an immutable request before sending it. If a connection fails, a session expires, or the server result is uncertain, editing is locked. Use **Retry / confirm same batch**; it uses the same request ID and cannot apply the corrections twice. Reload restores this recovery request. If signed out, sign back in on the same site/browser and return to Stocktake. Do not clear a pending recovery request or create a replacement just because a response was lost.
- If browser storage cannot save the recovery request, applying is blocked. Export a backup and resolve storage access/space first. Unreadable drafts offer a raw JSON backup before clearing. If a recovery request is involved, verify its server audit/result before clearing it.
- Leaving with pending counts prompts for confirmation. A failed browser-storage write means local recovery cannot be guaranteed; always keep a backup when warned.

## FIFO, cost and audit behaviour

- Corrections are absolute available counts, validated against expected quantities under sorted product locks in one transaction. A conflict, ledger mismatch or audit limit failure rolls back the complete batch. Concurrent matching request IDs replay the saved result; reusing one with different data is rejected.
- Missing copies reduce the remaining quantities of the oldest available acquisition lots (FIFO). The audit records the exact lot IDs, quantities and original per-copy cost, including the distinction between known zero and unknown cost. Original receipt quantities/costs, existing order allocations and historical order cost bases are not rewritten.
- Extra copies create an **Other** inventory receipt, with a stocktake reference and **unknown cost**. No purchase value is invented, no customer credit is issued, and no selling price/manual price override is changed. If newly found stock needs a real acquisition cost, investigate/record the actual acquisition through the established receiving process instead of treating stocktake as purchasing.
- Existing sale, reservation, refund and cancellation workflows remain authoritative; reserved copies cannot be removed by stocktake. A saved correction does not change previous order costs. Subsequent sales consume whatever acquisition lots actually remain.
- Positive adjustments use the existing restock-event mechanism; notification/email configuration is unchanged.
- **Recent saved batches** lists the latest 20 server audits. Open one for its reason, before/count/change CSV export and expandable FIFO provenance. Each audit has a permanent batch UUID. A known older UUID can also be retrieved through the owner-protected `/api/inventory/stocktake?batchId=<uuid>` endpoint; there is no all-history paging UI in this version.
- Audits are stored in existing `store_meta` keys `inventory.stocktake.<uuid>`. Back up the database, including these keys and the existing receipt/lot/allocation tables. Rollback of application source does **not** undo saved stock corrections. There is no automatic undo: investigate the audit and perform a new reconciled count/real receiving transaction as appropriate.
- Requests are owner/origin protected. Listings are bounded, local and read-only, do not import/register cards or call Scryfall, and do not expose acquisition costs to public customers.

## Files and deployment — your normal GitHub → VPS workflow

The ZIP contains `updated-files/` with the 11 changed/new source/test/package files plus this guide. It also contains a SHA-256 file manifest. Shared dashboard/CSS/navigation/package files retain the preceding updates.

1. Take the normal database/source backup. Preserve `.env`, `.git`, runtime uploads/artwork and all existing data.
2. Copy the **contents** of `updated-files/` into matching repository paths. Include the new API directory, helper files, component and tests. Do not upload the outer folder as an application directory.
3. Upload/commit the changes to GitHub using your usual workflow. Nothing has been pushed or deployed for you.
4. On the VPS, from the existing application directory with your normal secured environment configuration:

   ```bash
   git pull
   npm run inventory:audit
   npx next typegen
   npm run typecheck
   npm run test:stocktake
   npm run test:admin-workspaces
   npm run build
   pm2 list
   ```

5. Only after a successful build, reload the **existing** process using its actual name/ID: `pm2 reload <existing-app-name> --update-env`. Do not start a duplicate PM2 process. Review logs locally and hard-refresh Admin → Inventory → Stocktake.
6. Start with a small physically verified batch, review the differences and confirm the saved audit. Check the available/reserved distinction before a full count.

**No new SQL migration, dependency or version upgrade is required.** No reinstall is necessary if the preceding update/dependencies are installed. The existing FIFO inventory migration must already be present. The audit reports actual columns/indexes, including `products.total_cost` and `order_items.cost_basis`/`legacy_cost_basis`; inspect any unexpected drift before proceeding. If older inventory migration work is incomplete, stop and follow `INVENTORY-INTAKE.md` rather than running `db:push`, resets, destructive SQL, or inventing costs. Do not paste real connection strings/passwords into chat/logs. No production data was accessed or reset during development.

## Verification

All mutating tests ran against disposable local **inventory_test**, never production.

- Full TypeScript check and production Next build passed. Targeted ESLint: zero errors, two warnings (raw thumbnail image optimisation and a non-DOM storage epoch ref cleanup); this is not a whole-repository lint cleanup.
- **33 unit tests** passed across stocktake, admin workspaces, inventory, trade values/settings, delivery, branding, header/footer, Pages, carousel and picklist.
- New API tests passed: owner/origin protection and input bounds, read-only in-stock/zero-stock filters, literal wildcard handling, atomic stale-stock/ledger rejection, exact FIFO loss provenance, unchanged lot receipt quantities/costs and legacy total-cost field, unknown versus zero costs, preserved historical order costs, subsequent POS costs and exact refunds, same-request concurrent replay, competing counts, audit/history and 205-row keyset paging without skipped rows after a zero correction.
- New real Chromium tests passed: keyboard counts and matching blank rows, explicit zero, counts across pages and reload, CSV backup, review/reason, stale count rejection and recount, atomic multi-row save, mobile input visibility/no document overflow, stable zero-row positions, and **server-committed/lost-response → reload → safe idempotent recovery**. No browser page errors.
- Receiving/FIFO database and browser regressions passed: repeated purchases, pack allocations, zero/unknown costs, CSV/duplicates, trade stock/credit/idempotency, linked receipts, POS/web FIFO, refunds/cancellation, rollback/concurrent oversell, restock transitions and migration rerun.
- Admin workspaces/demand/newsletter, POS trade-in, store settings, delivery/tracking, branding, header/footer, Pages and carousel API/browser regressions all passed.
- Existing catalogue search returned 30 results from **110,000 synthetic printings in 30 ms**; the stocktake suite also passed against this large populated test database. The real catalogue was not replaced or reimported.
- Desktop/mobile screenshots were inspected; mobile was additionally checked in a fresh 390-pixel Chromium viewport.

Development-only reproduction: `npm run test:stocktake:browser` needs the isolated running app/database and test owner password. It creates synthetic fixtures and refuses database names other than `inventory_test`; never point it or any mutating integration/browser suite at production.
