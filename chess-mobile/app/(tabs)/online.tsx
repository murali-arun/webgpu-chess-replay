import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { Chess } from 'chess.js';
import { useFocusEffect } from 'expo-router';
import ChessBoard from '../../src/components/ChessBoard';
import { getToken } from '../../src/api/client';
import { colors, spacing, radius, font } from '../../src/constants/theme';

type Phase = 'idle' | 'connecting' | 'queued' | 'playing' | 'over';

const WS_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://chess.anmious.cloud')
  .replace('https://', 'wss://')
  .replace('http://', 'ws://') + '/ws';

export default function OnlineScreen() {
  const [phase,      setPhase]      = useState<Phase>('idle');
  const [fen,        setFen]        = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [opponent,   setOpponent]   = useState('');
  const [statusMsg,  setStatusMsg]  = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [moveDots,   setMoveDots]   = useState<string[]>([]);
  const [selected,   setSelected]   = useState<string | null>(null);

  const wsRef     = useRef<WebSocket | null>(null);
  const gameIdRef = useRef<string>('');
  const chessRef  = useRef(new Chess());

  // Disconnect WS when navigating away
  useFocusEffect(useCallback(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      setPhase('idle');
    };
  }, []));

  function send(obj: object) {
    wsRef.current?.send(JSON.stringify(obj));
  }

  async function connect() {
    setPhase('connecting');
    setStatusMsg('Connecting…');
    const token = await getToken();
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      send({ type: 'auth', token });
    };

    ws.onmessage = (e) => {
      let msg: any;
      try { msg = JSON.parse(e.data); } catch { return; }

      switch (msg.type) {
        case 'auth_ok':
          send({ type: 'join_queue' });
          setPhase('queued');
          setStatusMsg('In queue — waiting for opponent…');
          break;
        case 'queue_joined':
          setPhase('queued');
          setStatusMsg('In queue — waiting for opponent…');
          break;
        case 'game_start': {
          const chess = new Chess();
          chessRef.current = chess;
          gameIdRef.current = msg.gameId;
          setPlayerColor(msg.color === 'white' ? 'white' : 'black');
          setOpponent(msg.opponentName ?? 'Opponent');
          setFen(msg.fen ?? chess.fen());
          setHighlights([]); setMoveDots([]); setSelected(null);
          setPhase('playing');
          setStatusMsg('');
          break;
        }
        case 'move': {
          chessRef.current.load(msg.fen, { skipValidation: true });
          setFen(msg.fen);
          setHighlights([msg.from, msg.to]);
          setMoveDots([]); setSelected(null);
          break;
        }
        case 'game_over':
          setStatusMsg(
            msg.result === 'draw' ? 'Draw!'
            : msg.result === 'win' ? '★ You win!'
            : 'You lose'
          );
          setPhase('over');
          break;
        case 'opponent_disconnected':
          setStatusMsg('Opponent disconnected — you win!');
          setPhase('over');
          break;
        case 'auth_error':
          setStatusMsg('Auth error — try logging out and back in.');
          setPhase('idle');
          ws.close();
          break;
      }
    };

    ws.onclose = () => {
      if (phase === 'playing') setStatusMsg('Disconnected from server');
      if (phase !== 'over') setPhase('idle');
    };

    ws.onerror = () => {
      setStatusMsg('Connection error');
      setPhase('idle');
    };
  }

  function handleSquarePress(sq: string) {
    if (phase !== 'playing') return;
    const chess = chessRef.current;
    const myTurn = (playerColor === 'white' && chess.turn() === 'w') ||
                   (playerColor === 'black' && chess.turn() === 'b');
    if (!myTurn) return;

    if (!selected) {
      const piece = chess.get(sq as any);
      if (!piece) return;
      const isOwn = (playerColor === 'white' && piece.color === 'w') ||
                    (playerColor === 'black' && piece.color === 'b');
      if (!isOwn) return;
      const moves = chess.moves({ square: sq as any, verbose: true });
      setSelected(sq); setMoveDots(moves.map((m: any) => m.to)); setHighlights([sq]);
      return;
    }

    if (sq === selected) { setSelected(null); setMoveDots([]); setHighlights([]); return; }

    const legal = chess.moves({ square: selected as any, verbose: true });
    const move  = legal.find((m: any) => m.to === sq);
    if (!move) {
      const piece = chess.get(sq as any);
      if (piece && ((playerColor === 'white' && piece.color === 'w') || (playerColor === 'black' && piece.color === 'b'))) {
        const moves = chess.moves({ square: sq as any, verbose: true });
        setSelected(sq); setMoveDots(moves.map((m: any) => m.to)); setHighlights([sq]);
        return;
      }
      setSelected(null); setMoveDots([]); setHighlights([]); return;
    }

    send({ type: 'move', gameId: gameIdRef.current, from: selected, to: sq, promotion: 'q' });
    setHighlights([selected, sq]); setMoveDots([]); setSelected(null);
  }

  function handleResign() {
    Alert.alert('Resign', 'Resign this game?', [
      { text: 'Cancel' },
      { text: 'Resign', style: 'destructive', onPress: () => {
        send({ type: 'resign', gameId: gameIdRef.current });
        setPhase('over'); setStatusMsg('You resigned');
      }},
    ]);
  }

  function handleLeaveQueue() {
    send({ type: 'dequeue' });
    wsRef.current?.close(); wsRef.current = null;
    setPhase('idle'); setStatusMsg('');
  }

  const flipped = playerColor === 'black';

  if (phase === 'idle') {
    return (
      <View style={[s.bg, s.center]}>
        <Text style={s.title}>Online Play</Text>
        <Text style={s.subtitle}>Play against real opponents</Text>
        <TouchableOpacity style={s.bigBtn} onPress={connect}>
          <Text style={s.bigBtnText}>Find Match</Text>
        </TouchableOpacity>
        {statusMsg ? <Text style={s.status}>{statusMsg}</Text> : null}
      </View>
    );
  }

  if (phase === 'connecting' || phase === 'queued') {
    return (
      <View style={[s.bg, s.center]}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[s.status, { marginTop: spacing.lg }]}>{statusMsg}</Text>
        {phase === 'queued' && (
          <TouchableOpacity style={s.cancelBtn} onPress={handleLeaveQueue}>
            <Text style={s.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={s.bg}>
      <View style={s.topBar}>
        <Text style={s.topLabel}>vs {opponent}</Text>
        <Text style={[s.topLabel, { marginLeft: 'auto' }]}>
          {playerColor === 'white' ? '♔' : '♚'} {playerColor}
        </Text>
      </View>

      <View style={s.boardWrapper}>
        <ChessBoard
          fen={fen}
          highlights={highlights}
          moveDots={moveDots}
          flipped={flipped}
          onSquarePress={handleSquarePress}
        />
      </View>

      {phase === 'over' ? (
        <View style={s.banner}>
          <Text style={s.bannerText}>{statusMsg}</Text>
          <TouchableOpacity style={s.bigBtn} onPress={() => { wsRef.current?.close(); wsRef.current = null; setPhase('idle'); setStatusMsg(''); }}>
            <Text style={s.bigBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
  bg:          { flex: 1, backgroundColor: colors.bg },
  center:      { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  title:       { fontSize: font.xl, fontWeight: '700', color: colors.accent, letterSpacing: 2 },
  subtitle:    { color: colors.textMuted, fontSize: font.base },
  bigBtn:      { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.md },
  bigBtnText:  { color: colors.bg, fontWeight: '700', fontSize: font.lg },
  cancelBtn:   { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  cancelText:  { color: colors.textMuted, fontSize: font.base },
  status:      { color: colors.textMuted, fontSize: font.sm, textAlign: 'center', paddingHorizontal: spacing.lg },
  topBar:      { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  topLabel:    { color: colors.textMuted, fontSize: font.sm },
  boardWrapper:{ flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner:      { backgroundColor: colors.surface, padding: spacing.lg, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.accent, gap: spacing.md },
  bannerText:  { color: colors.accent, fontSize: font.xl, fontWeight: '700' },
  controls:    { padding: spacing.md, flexDirection: 'row', justifyContent: 'center', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  resignBtn:   { borderWidth: 1, borderColor: colors.danger, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  resignText:  { color: colors.danger, fontSize: font.sm },
});
