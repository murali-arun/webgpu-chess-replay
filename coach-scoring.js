"use strict";

function scoreFromCentipawnLoss(loss) {
  const cp = Math.max(0, Number.isFinite(loss) ? loss : 900);
  if (cp <= 12) return 10;
  if (cp <= 30) return 9;
  if (cp <= 65) return 8;
  if (cp <= 110) return 7;
  if (cp <= 175) return 6;
  if (cp <= 260) return 5;
  if (cp <= 380) return 4;
  if (cp <= 540) return 3;
  if (cp <= 750) return 2;
  return 1;
}

function labelForScore(score) {
  if (score === 10) return "Best move";
  if (score === 9) return "Excellent";
  if (score === 8) return "Great";
  if (score === 7) return "Good";
  if (score === 6) return "Inaccuracy";
  if (score >= 4) return "Mistake";
  return "Blunder";
}

module.exports = { scoreFromCentipawnLoss, labelForScore };
