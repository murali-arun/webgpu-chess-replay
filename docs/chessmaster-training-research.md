# Chessmaster training foundation

Research review: 13 September 2026

## Decision

Build the product around one protected hour of deliberate practice, not around passive content consumption. Each session should retrieve old patterns, calculate without assistance, apply the idea in play, and briefly reflect. The app should adapt from demonstrated weaknesses and should always offer a useful fallback when a service, exercise, or attention state fails.

“Chessmaster” is used in the product as a motivating skill target around a 2200 playing level. It is not a promise of a FIDE title. Official titles depend on the current FIDE title rules and eligible over-the-board results; online or internal app ratings are not interchangeable with a FIDE rating.

## What the evidence supports

Chess-specific evidence favors serious individual study. Charness and colleagues studied two large samples of tournament-rated players; serious chess study was the strongest predictor in their model, which explained roughly 40% of rating variance. Grandmasters in the sample reported about 5,000 hours of serious study during their first decade. This supports a deliberate-practice product, but it does **not** justify predicting that every beginner will reach 2200 after a fixed number of hours.

Retrieval practice generally produces better long-term retention than repeated study, especially when followed by corrective feedback. Spacing and interleaving make recall more effortful and can improve later discrimination, although much of this literature is not chess-specific. The responsible product inference is to resurface missed positions over increasing intervals and mix tactical themes after initial instruction—not to claim a guaranteed chess-rating gain.

Gamification is not automatically motivating. A 2023 online survey-interface experiment—not a chess-learning study—found small effects in which gamification and learning loops increased dropout, while satisfaction of autonomy, competence, and relatedness better explained reported experience. The cautious product inference is to use calm progress, choice, and specific competence feedback, while avoiding punishment for broken streaks, noisy rewards, and artificial urgency.

Evidence about interruption costs depends on the task. A 2022 paper reported three experiments that did not find a diagnostic-reasoning accuracy cost, while discussing earlier studies that often found longer completion time. The focus timer therefore makes the conservative measurement choice: pause when the page is hidden and offer a simple return state. This protects the meaning of “focused minutes” without claiming that every interruption damages learning.

## One-hour daily protocol

The current 5–15–20–15–5 structure is a sound foundation:

1. **Arrive — 5 minutes:** select one narrow intention and remove distractions.
2. **Recall — 15 minutes:** solve due positions before seeing a hint. Immediate feedback follows the attempt.
3. **Calculate — 20 minutes:** analyze candidate moves without moving pieces; compare with Stockfish afterward.
4. **Apply — 15 minutes:** play a focused position or game against a level matched to recent accuracy.
5. **Reflect — 5 minutes:** name one error pattern and schedule the relevant position for review.

Difficulty should target effortful success rather than comfort or repeated failure. Until enough personal data exists, serve puzzles near the learner’s estimated level and then adjust slowly: increase when first-attempt accuracy is consistently high; reduce or narrow the theme when it is consistently low. A later release should measure calibration with held-out positions instead of relying on engagement alone.

## Continuity: ten independent backup paths

The learner should never lose the day because one content source or activity is unavailable. These paths are ordered by immediacy, not prestige:

1. Ten verified CC0 tactical positions bundled in the app and usable offline.
2. A cached mixed batch from the free Lichess puzzle API.
3. Positions already missed by the learner, stored in the local spaced-review queue.
4. Opening recall from the app’s seven bundled opening families.
5. Stockfish candidate-move calculation at the learner’s selected level.
6. A self-play position against local Stockfish when live opponents are unavailable.
7. Piece and rule lessons already bundled in the tutorial.
8. Imported personal PGN review, with engine analysis performed only after unaided annotation.
9. A locally sampled subset of the downloadable CC0 Lichess puzzle database.
10. A locally sampled subset of Lichess’s open evaluation and opening datasets for future drills.

The first two are implemented in the Daily Puzzle interface now. The others describe a graceful-degradation ladder and the next implementation sequence. They are deliberately free and local-first. The Lichess database currently publishes millions of rated, tagged puzzles and hundreds of millions of Stockfish-evaluated positions under CC0, so the project can grow without a paid content dependency.

## Safety and fair play

Engine analysis, opening recommendations, and puzzle solutions belong only in tutorial, coach, and post-game review screens. They must never be connected to the online-play move path. Lichess’s terms prohibit external assistance during games. This separation is both an ethical requirement and a better learning design: unaided play provides the diagnostic signal; delayed analysis turns that signal into practice.

## Measurement plan

Track learning outcomes, not just clicks:

- first-attempt puzzle accuracy by theme and rating band;
- hint use and time-to-solution;
- recall accuracy after 1, 3, 7, 14, and 30 days;
- opening deviations that recur in real games;
- average centipawn loss by game phase;
- blunder rate under different time controls;
- focused minutes, interruption count, and session completion;
- periodic unaided benchmark sets held out from training.

The theoretical date should remain a transparent projection based on focused hours and should move when practice is missed. It should never be presented as a guarantee. Once actual performance history is large enough, replace the fixed estimate with a range and confidence level.

## Sources

1. Charness, N. et al. (2005), [The role of deliberate practice in chess expertise](https://onlinelibrary.wiley.com/doi/10.1002/acp.1106), *Applied Cognitive Psychology*.
2. Karpicke, J. D. and Roediger, H. L. (2007), [Repeated retrieval during learning is the key to long-term retention](https://doi.org/10.1016/j.jml.2006.09.004), *Journal of Memory and Language*.
3. Maye, J. A. and Hurley, F. (2026), [The effectiveness of spaced repetition in medical education: a systematic review and meta-analysis](https://pubmed.ncbi.nlm.nih.gov/41601436/).
4. Ishaq, K. et al. (2023), [Gamification, psychological need satisfaction, and dropout](https://pubmed.ncbi.nlm.nih.gov/37831685/).
5. Foroughi, C. K. et al. (2022), [Effects of interruptions on task performance](https://pmc.ncbi.nlm.nih.gov/articles/PMC8925158/).
6. FIDE, [Handbook and current title regulations](https://handbook.fide.com/).
7. Lichess, [API documentation](https://lichess.org/api).
8. Lichess, [Open database and CC0 datasets](https://database.lichess.org/).
9. Lichess, [Terms of Service](https://lichess.org/terms-of-service).
10. Stockfish project, [official repository and GPLv3 license](https://github.com/official-stockfish/Stockfish).
