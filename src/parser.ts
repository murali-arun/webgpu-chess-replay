import { Chess } from "chess.js";
import type { Ply, ReplayData, MoveMeta } from "./types";

/**
 * Accepts:
 *  - PGN text (typical multi-line)
 *  - CSV "moveNumber,white,black" (header optional)
 *  - CSV "ply,san" (header optional)
 */
export function buildReplayData(input: string, startFen?: string): ReplayData {
  const text = input.trim();
  if (!text) throw new Error("Input is empty.");

  const chess = new Chess();
  if (startFen && startFen.trim()) {
    const ok = chess.load(startFen.trim());
    if (!ok) throw new Error("Invalid start FEN.");
  }

  const plies = parseIntoPlies(text);

  // Validate + build FENs + metas
  const fens: string[] = [chess.fen()];
  const metas: MoveMeta[] = [];

  for (let i = 0; i < plies.length; i++) {
    const ply = plies[i];

    // Try SAN first (most common)
    const move = chess.move(ply.san, { sloppy: true });
    if (!move) {
      throw new Error(`Illegal/invalid move at ply ${ply.index}: "${ply.san}"`);
    }

    metas.push({
      from: move.from,
      to: move.to,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ""}`,
      color: move.color,
      piece: move.piece,
      captured: move.captured,
      promotion: move.promotion,
      flags: move.flags
    });

    fens.push(chess.fen());
  }

  return {
    plies,
    fens,
    metas,
    startFen: fens[0]
  };
}

function parseIntoPlies(text: string): Ply[] {
  // Detect PGN-ish (has [Event] or move numbers like "1." and spaces)
  const looksLikePGN =
    /\[Event\s+/i.test(text) ||
    /\d+\.(\.\.)?\s*\S+/.test(text) ||
    /1-0|0-1|1\/2-1\/2|\*/.test(text);

  if (looksLikePGN && !text.includes(",")) {
    return parsePGNToPlies(text);
  }

  // Otherwise treat as CSV-ish
  return parseCSVToPlies(text);
}

function parsePGNToPlies(pgn: string): Ply[] {
  // Minimal PGN tokenization:
  // remove headers, comments, NAGs, results
  const body = pgn
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => !l.trim().startsWith("["))
    .join(" ")
    .replace(/\{[^}]*\}/g, " ")       // {...} comments
    .replace(/;[^\n]*/g, " ")         // ; comments
    .replace(/\$\d+/g, " ")           // NAGs like $1
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = body.split(" ").filter(Boolean);

  const plies: Ply[] = [];
  let plyIndex = 1;

  for (const t of tokens) {
    // skip move numbers like "1." or "1..." or "23."
    if (/^\d+\.(\.\.)?$/.test(t)) continue;
    // sometimes move numbers are stuck like "1.e4"
    const m = t.match(/^(\d+)\.(\.\.)?(.*)$/);
    if (m && m[3]) {
      const moveTok = m[3].trim();
      if (moveTok) {
        plies.push({ index: plyIndex++, san: moveTok });
      }
      continue;
    }

    plies.push({ index: plyIndex++, san: t });
  }

  if (plies.length === 0) throw new Error("Could not parse any moves from PGN.");
  return plies;
}

function parseCSVToPlies(csv: string): Ply[] {
  const lines = csv
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) throw new Error("No CSV rows found.");

  // Split rows by commas (simple CSV; if you need quoted CSV, we can add PapaParse)
  const rows = lines.map((l) => l.split(",").map((x) => x.trim()));

  // Detect headers
  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader =
    header.includes("movenumber") ||
    header.includes("white") ||
    header.includes("black") ||
    header.includes("ply") ||
    header.includes("san");

  const dataRows = hasHeader ? rows.slice(1) : rows;

  // Decide format:
  // A) moveNumber,white,black
  // B) ply,san
  const looksLikeTriple = dataRows[0]?.length >= 3;
  const looksLikeDouble = dataRows[0]?.length === 2;

  const plies: Ply[] = [];
  let plyIndex = 1;

  if (looksLikeTriple) {
    for (const r of dataRows) {
      const white = r[1]?.trim();
      const black = r[2]?.trim();
      if (white) plies.push({ index: plyIndex++, san: white });
      if (black) plies.push({ index: plyIndex++, san: black });
    }
  } else if (looksLikeDouble) {
    for (const r of dataRows) {
      const san = r[1]?.trim();
      if (san) plies.push({ index: plyIndex++, san });
    }
  } else {
    // fallback: treat each line as one SAN
    for (const l of lines) {
      if (l.includes(",")) {
        const parts = l.split(",").map((x) => x.trim());
        const maybe = parts[parts.length - 1];
        if (maybe) plies.push({ index: plyIndex++, san: maybe });
      } else {
        plies.push({ index: plyIndex++, san: l });
      }
    }
  }

  if (plies.length === 0) throw new Error("Could not parse any moves from CSV.");
  return plies;
}
