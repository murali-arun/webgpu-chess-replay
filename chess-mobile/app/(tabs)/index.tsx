import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { Chess } from 'chess.js';
import ChessBoard from '../../src/components/ChessBoard';
import { apiFetch } from '../../src/api/client';
import { colors, spacing, radius, font } from '../../src/constants/theme';

type Difficulty = 'easy' | 'medium' | 'hard';
type Color      = 'white' | 'black';
type Phase      = 'setup' | 'playing' | 'over';

const DIFF = {
  easy:   { skill: 3,  movetime: 50 },
  medium: { skill: 10, movetime: 350 },
  hard:   { skill: 18, movetime: 900 },
} as const;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export default function PlayScreen() {
  const [phase,      setPhase]      = useState<Phase>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [playerColor, setPlayerColor] = useState<Color>('white');
  const [fen,        setFen]        = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [moveDots,   setMoveDots]   = useState<string[]>([]);
  const [selected,   setSelected]   = useState<string | null>(null);
  const [statusMsg,  setStatusMsg]  = useState('');
  const [flash,      setFlash]      = useState<{ square: string; type: 'correct' | 'wrong' } | null>(null);
  const [botBusy,    setBotBusy]    = useState(false);

  const chessRef = useRef(new Chess());
  const busyRef  = useRef(false);

  function isPlayerTurn() {
    const c = chessRef.current.turn();
    return (playerColor === 'white' && c === 'w') || (playerColor === 'black' && c === 'b');
  }

  const triggerBotMove = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBotBusy(true);
    try {
      const { skill, movetime } = DIFF[difficulty];
      const res = await apiFetch<{ move: string | null }>('/api/stockfish', {
        method: 'POST',
        body: JSON.stringify({ fen: chessRef.current.fen(), skill, movetime }),
      });
      if (!res.move) return;
      const from = res.move.slice(0, 2);
      const to   = res.move.slice(2, 4);
      const promo = res.move[4] ?? undefined;
      chessRef.current.move({ from, to, promotion: promo });
      setFen(chessRef.current.fen());
      setHighlights([from, to]);
      await sleep(200);
      checkGameOver();
    } catch {}
    finally {
      busyRef.current = false;
      setBotBusy(false);
    }
  }, [difficulty]);

  useEffect(() => {
    if (phase === 'playing' && !isPlayerTurn()) {
      triggerBotMove();
    }
  }, [fen, phase]);

  function startGame() {
    const chess = new Chess();
    chessRef.current = chess;
    setFen(chess.fen());
    setHighlights([]);
    setMoveDots([]);
    setSelected(null);
    setStatusMsg('');
    setFlash(null);
    setPhase('playing');
    if (playerColor === 'black') {
      setTimeout(() => triggerBotMove(), 300);
    }
  }

  function checkGameOver() {
    const chess = chessRef.current;
    if (chess.isCheckmate()) {
      const winner = chess.turn() === 'w' ? 'black' : 'white';
      const result: 'win'|'loss' = winner === playerColor ? 'win' : 'loss';
      setStatusMsg(result === 'win' ? '★ You win!' : 'Checkmate — you lose');
      setPhase('over');
      saveResult(result);
    } else if (chess.isDraw()) {
      setStatusMsg('Draw');
      setPhase('over');
      saveResult('draw');
    }
  }

  async function saveResult(result: 'win' | 'loss' | 'draw') {
    try {
      await apiFetch('/api/game/result', {
        method: 'POST',
        body: JSON.stringify({ result, difficulty, color: playerColor }),
      });
    } catch {}
  }

  function handleSquarePress(sq: string) {
    if (phase !== 'playing' || !isPlayerTurn() || busyRef.current) return;
    const chess = chessRef.current;

    if (!selected) {
      const piece = chess.get(sq as any);
      if (!piece) return;
      const isOwn = (playerColor === 'white' && piece.color === 'w') ||
                    (playerColor === 'black' && piece.color === 'b');
      if (!isOwn) return;
      const moves = chess.moves({ square: sq as any, verbose: true });
      setSelected(sq);
      setMoveDots(moves.map((m: any) => m.to));
      setHighlights([sq]);
      return;
    }

    if (sq === selected) {
      setSelected(null); setMoveDots([]); setHighlights([]); return;
    }

    const legal = chess.moves({ square: selected as any, verbose: true });
    const move  = legal.find((m: any) => m.to === sq);

    if (!move) {
      // Maybe selecting a different own piece
      const piece = chess.get(sq as any);
      if (piece && ((playerColor === 'white' && piece.color === 'w') || (playerColor === 'black' && piece.color === 'b'))) {
        const moves = chess.moves({ square: sq as any, verbose: true });
        setSelected(sq); setMoveDots(moves.map((m: any) => m.to)); setHighlights([sq]);
        return;
      }
      setSelected(null); setMoveDots([]); setHighlights([]); return;
    }

    chess.move({ from: selected, to: sq, promotion: 'q' });
    setFen(chess.fen());
    setHighlights([selected, sq]);
    setMoveDots([]);
    setSelected(null);
    checkGameOver();
  }

  function handleResign() {
    Alert.alert('Resign', 'Are you sure you want to resign?', [
      { text: 'Cancel' },
      { text: 'Resign', style: 'destructive', onPress: () => {
        setStatusMsg('You resigned');
        setPhase('over');
        saveResult('loss');
      }},
    ]);
  }

  if (phase === 'setup') {
    return (
      <ScrollView style={s.bg} contentContainerStyle={s.setupContainer}>
        <Text style={s.title}>Play vs Computer</Text>

        <Text style={s.label}>Difficulty</Text>
        <View style={s.row}>
          {(['easy','medium','hard'] as Difficulty[]).map(d => (
            <TouchableOpacity key={d} style={[s.chip, difficulty === d && s.chipActive]} onPress={() => setDifficulty(d)}>
              <Text style={[s.chipText, difficulty === d && s.chipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Play as</Text>
        <View style={s.row}>
          {(['white','black'] as Color[]).map(c => (
            <TouchableOpacity key={c} style={[s.chip, playerColor === c && s.chipActive]} onPress={() => setPlayerColor(c)}>
              <Text style={[s.chipText, playerColor === c && s.chipTextActive]}>{c === 'white' ? '♔ White' : '♚ Black'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={s.startBtn} onPress={startGame}>
          <Text style={s.startBtnText}>Start Game</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const flipped = playerColor === 'black';

  return (
    <View style={s.bg}>
      <View style={s.topBar}>
        <Text style={s.topLabel}>{difficulty.toUpperCase()}</Text>
        {botBusy && <ActivityIndicator color={colors.accent} size="small" style={{ marginLeft: 8 }} />}
        <Text style={[s.topLabel, { marginLeft: 'auto' }]}>{chessRef.current.turn() === 'w' ? '♔ White' : '♚ Black'} to move</Text>
      </View>

      <View style={s.boardWrapper}>
        <ChessBoard
          fen={fen}
          highlights={highlights}
          moveDots={moveDots}
          flipped={flipped}
          flash={flash}
          onSquarePress={handleSquarePress}
        />
      </View>

      {phase === 'over' && (
        <View style={s.banner}>
          <Text style={s.bannerText}>{statusMsg}</Text>
          <TouchableOpacity style={s.restartBtn} onPress={() => setPhase('setup')}>
            <Text style={s.restartBtnText}>New Game</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === 'playing' && (
        <View style={s.controls}>
          <TouchableOpacity style={s.resignBtn} onPress={handleResign}>
            <Text style={s.resignText}>Resign</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bg:              { flex: 1, backgroundColor: colors.bg },
  setupContainer:  { flexGrow: 1, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  title:           { fontSize: font.xl, fontWeight: '700', color: colors.accent, marginBottom: spacing.xl, letterSpacing: 2 },
  label:           { fontSize: font.sm, color: colors.textMuted, marginBottom: spacing.sm, alignSelf: 'flex-start' },
  row:             { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  chip:            { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive:      { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText:        { color: colors.textMuted, fontSize: font.base },
  chipTextActive:  { color: colors.bg, fontWeight: '700' },
  startBtn:        { marginTop: spacing.md, backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  startBtnText:    { color: colors.bg, fontWeight: '700', fontSize: font.lg },
  topBar:          { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  topLabel:        { color: colors.textMuted, fontSize: font.sm },
  boardWrapper:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner:          { backgroundColor: colors.surface, padding: spacing.lg, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.accent },
  bannerText:      { color: colors.accent, fontSize: font.xl, fontWeight: '700', marginBottom: spacing.md },
  restartBtn:      { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  restartBtnText:  { color: colors.bg, fontWeight: '700', fontSize: font.base },
  controls:        { padding: spacing.md, flexDirection: 'row', justifyContent: 'center', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  resignBtn:       { borderWidth: 1, borderColor: colors.danger, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  resignText:      { color: colors.danger, fontSize: font.sm },
});
