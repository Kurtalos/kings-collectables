import { db } from "@/db";
import {
  inventoryRestockEvents as events,
  watchlists,
  wishlists,
} from "@/db/schema";
import { eq, isNull, asc } from "drizzle-orm";

/** Durable, transactionally claimed delivery outbox. The pre-existing sender was a
 * console stub, not email. Keep that behaviour without logging customer PII.
 * A future email provider should accept event.id as its delivery idempotency key.
 */
export async function dispatchRestockEvents() {
  try {
    await db.transaction(async (tx) => {
      const pending = await tx
        .select()
        .from(events)
        .where(isNull(events.processedAt))
        .orderBy(asc(events.createdAt))
        .limit(100)
        .for("update", { skipLocked: true });
      for (const event of pending) {
        const watched = await tx
          .select({ id: watchlists.customerId })
          .from(watchlists)
          .where(eq(watchlists.productId, event.productId));
        const wished = await tx
          .select({ id: wishlists.customerId })
          .from(wishlists)
          .where(eq(wishlists.productId, event.productId));
        const recipients = new Set([...watched, ...wished].map((w) => w.id));
        console.info(
          `[Restock Notification] event=${event.id} product=${event.productId} quantity=${event.quantity} recipients=${recipients.size}; email delivery is not configured`,
        );
        await tx
          .update(events)
          .set({ processedAt: new Date() })
          .where(eq(events.id, event.id));
      }
    });
  } catch {
    console.error(
      "Restock outbox processing deferred; stock was saved. Pending events are retained for retry.",
    );
  }
}
