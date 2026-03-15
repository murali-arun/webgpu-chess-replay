/**
 * Seed static lessons into Postgres.
 *
 * Uses DB_URL from .env (must point to VPS Postgres — port 5432 is publicly exposed).
 *
 * Usage:
 *   npm run seed
 *   -- or --
 *   DB_URL=postgresql://llmproxy:pass@89.116.157.50:5432/chess npx tsx scripts/seed-static-lessons.ts
 */

import "dotenv/config";
import { Pool } from "pg";
import { ALL_LESSONS } from "../src/tutorialData";

const DB_URL = process.env.DB_URL;
if (!DB_URL) {
  console.error("DB_URL is not set. Add it to your .env file.");
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chess_lessons (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  let inserted = 0;
  let skipped = 0;

  for (const lesson of ALL_LESSONS) {
    const res = await pool.query(
      `INSERT INTO chess_lessons (id, data)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
       RETURNING id`,
      [lesson.id, lesson]
    );
    if (res.rowCount) {
      console.log(`  ✓ ${lesson.id}`);
      inserted++;
    } else {
      skipped++;
    }
  }

  console.log(`\nDone — ${inserted} upserted, ${skipped} skipped.`);
  await pool.end();
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
