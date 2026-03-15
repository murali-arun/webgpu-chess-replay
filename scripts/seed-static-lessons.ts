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
      sort_order INTEGER DEFAULT 9999,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE chess_lessons ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 9999`);

  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < ALL_LESSONS.length; i++) {
    const lesson = ALL_LESSONS[i];
    const res = await pool.query(
      `INSERT INTO chess_lessons (id, data, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, sort_order = EXCLUDED.sort_order
       RETURNING id`,
      [lesson.id, lesson, i]
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
