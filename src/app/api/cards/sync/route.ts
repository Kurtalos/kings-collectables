import { db } from "@/db";
import { sql } from "drizzle-orm";
import { requireOwner, apiError } from "@/lib/admin-auth";
import { spawn } from "child_process";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

let isSyncRunning = false;
let lastSyncResult: {
  status: "idle" | "running" | "completed" | "error";
  startedAt?: string;
  finishedAt?: string;
  totalCards?: number;
  inStock?: number;
  outOfStock?: number;
  message?: string;
} = { status: "idle" };

export async function GET(request: Request) {
  try {
    await requireOwner(request);

    // Get current DB card stats
    const statsRes = await db.execute(sql`
      SELECT 
        count(*)::int as total,
        count(*) FILTER (WHERE quantity > 0)::int as in_stock,
        count(*) FILTER (WHERE quantity = 0)::int as out_of_stock,
        pg_size_pretty(pg_total_relation_size('products')) as table_size
      FROM products;
    `);

    const stats = (statsRes.rows?.[0] as any) || {};

    return Response.json({
      isRunning: isSyncRunning,
      lastSync: lastSyncResult,
      stats: {
        totalCards: Number(stats.total || 0),
        inStock: Number(stats.in_stock || 0),
        outOfStock: Number(stats.out_of_stock || 0),
        tableSize: stats.table_size || "0 MB",
      }
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    await requireOwner(request);

    if (isSyncRunning) {
      return Response.json({ message: "A card database sync is already in progress.", status: "running" });
    }

    isSyncRunning = true;
    lastSyncResult = { status: "running", startedAt: new Date().toISOString() };

    // Run the sync script in background process
    const child = spawn("node", ["scripts/sync-all-cards.mjs"], {
      env: process.env,
      stdio: "pipe"
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => stdout += chunk.toString());
    child.stderr.on("data", chunk => stderr += chunk.toString());

    child.on("close", async (code) => {
      isSyncRunning = false;
      const finishedAt = new Date().toISOString();

      if (code === 0) {
        try {
          const statsRes = await db.execute(sql`
            SELECT 
              count(*)::int as total,
              count(*) FILTER (WHERE quantity > 0)::int as in_stock,
              count(*) FILTER (WHERE quantity = 0)::int as out_of_stock
            FROM products;
          `);
          const s = (statsRes.rows?.[0] as any) || {};
          lastSyncResult = {
            status: "completed",
            startedAt: lastSyncResult.startedAt,
            finishedAt,
            totalCards: Number(s.total || 0),
            inStock: Number(s.in_stock || 0),
            outOfStock: Number(s.out_of_stock || 0),
            message: "Sync completed successfully!"
          };
        } catch {
          lastSyncResult = { status: "completed", finishedAt, message: "Sync completed!" };
        }
      } else {
        lastSyncResult = {
          status: "error",
          startedAt: lastSyncResult.startedAt,
          finishedAt,
          message: `Sync failed with exit code ${code}: ${stderr.slice(-300)}`
        };
      }
    });

    return Response.json({ 
      message: "Sync started in background.", 
      status: "running",
      startedAt: lastSyncResult.startedAt 
    });
  } catch (err) {
    isSyncRunning = false;
    return apiError(err);
  }
}
