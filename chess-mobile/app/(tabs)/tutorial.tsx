import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { Chess } from 'chess.js';
import ChessBoard from '../../src/components/ChessBoard';
import { apiFetch } from '../../src/api/client';
import { colors, spacing, radius, font } from '../../src/constants/theme';

interface TStep {
  type: 'demo' | 'challenge';
  fen: string;
  title: string;
  explanation: string;
  highlightSquares?: string[];
  hiddenSquares?: string[];
  challengePiece?: string;
  expectedSquare?: string;
  hint?: string;
}
interface TLesson {
  id: string; title: string; subtitle: string; icon: string;
  category: string; level?: string; steps: TStep[];
}

type Phase    = 'list' | 'lesson';
type Feedback = 'none' | 'correct' | 'wrong';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export default function TutorialScreen() {
  const [lessons,   setLessons]   = useState<TLesson[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [phase,     setPhase]     = useState<Phase>('list');
  const [lesson,    setLesson]    = useState<TLesson | null>(null);
  const [stepIdx,   setStepIdx]   = useState(0);
  const [fen,       setFen]       = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [moveDots,  setMoveDots]  = useState<string[]>([]);
  const [hidden,    setHidden]    = useState<string[]>([]);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [feedback,  setFeedback]  = useState<Feedback>('none');
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [flash,     setFlash]     = useState<{ square: string; type: 'correct' | 'wrong' } | null>(null);
  const [busy,      setBusy]      = useState(false);

  useEffect(() => {
    apiFetch<TLesson[]>('/api/lesson/generated')
      .then(data => { if (Array.isArray(data)) setLessons(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const currentStep = lesson?.steps[stepIdx] ?? null;

  function applyStep(step: TStep) {
    setFen(step.fen);
    setHighlights(step.highlightSquares ?? []);
    setMoveDots([]);
    setHidden(step.hiddenSquares ?? []);
    setFlash(null);
  }

  function startLesson(l: TLesson) {
    setLesson(l); setStepIdx(0); setFeedback('none'); setFeedbackMsg('');
    setSelected(null); setPhase('lesson');
    applyStep(l.steps[0]);
  }

  async function advance() {
    if (!lesson) return;
    const next = stepIdx + 1;
    if (next >= lesson.steps.length) {
      setPhase('list'); setLesson(null); setStepIdx(0); setBusy(false); return;
    }
    setFeedback('none'); setFeedbackMsg(''); setSelected(null);
    setStepIdx(next);
    applyStep(lesson.steps[next]);
    setBusy(false);
  }

  async function handleSquarePress(sq: string) {
    if (!currentStep || currentStep.type !== 'challenge' || busy) return;

    if (!selected) {
      if (sq !== currentStep.challengePiece) return;
      setSelected(sq);
      const chess = new Chess();
      chess.load(currentStep.fen, { skipValidation: true });
      const moves = chess.moves({ square: sq as any, verbose: true });
      setMoveDots(moves.map((m: any) => m.to));
      setHighlights([sq]);
      return;
    }

    const chess = new Chess();
    chess.load(currentStep.fen, { skipValidation: true });
    const legal = chess.moves({ square: selected as any, verbose: true });
    if (!legal.some((m: any) => m.to === sq)) {
      setSelected(null); setMoveDots([]); applyStep(currentStep); return;
    }

    const correct =
      currentStep.expectedSquare === '__any__' ||
      currentStep.expectedSquare === '__any_knight_move__' ||
      sq === currentStep.expectedSquare;

    setBusy(true); setMoveDots([]);

    if (correct) {
      chess.move({ from: selected, to: sq, promotion: 'q' });
      setFen(chess.fen()); setHighlights([selected, sq]);
      setFlash({ square: sq, type: 'correct' });
      setFeedback('correct'); setFeedbackMsg('Correct! 🎉');
      setSelected(null);
      await sleep(900);
      await advance();
    } else {
      setFlash({ square: sq, type: 'wrong' });
      setFeedback('wrong'); setFeedbackMsg(currentStep.hint ?? 'Not quite — try again!');
      setSelected(null);
      await sleep(650);
      applyStep(currentStep);
      setBusy(false);
    }
  }

  if (phase === 'list') {
    const levels = ['beginner','intermediate','advanced'] as const;
    const labels: Record<string, string> = { beginner: '★ Beginner', intermediate: '✦ Intermediate', advanced: '⬡ Advanced' };
    return (
      <ScrollView style={s.bg} contentContainerStyle={s.listPad}>
        <Text style={s.pageTitle}>Tutorial</Text>
        {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />}
        {levels.map(lvl => {
          const grp = lessons.filter(l => (l.level ?? l.category === 'pieces' ? 'beginner' : 'beginner') === lvl || l.level === lvl);
          if (!grp.length) return null;
          return (
            <View key={lvl} style={s.group}>
              <Text style={s.groupHeader}>{labels[lvl]}</Text>
              {grp.map(l => (
                <TouchableOpacity key={l.id} style={s.card} onPress={() => startLesson(l)}>
                  <Text style={s.cardIcon}>{l.icon}</Text>
                  <View style={s.cardText}>
                    <Text style={s.cardTitle}>{l.title}</Text>
                    <Text style={s.cardSub}>{l.subtitle}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
      </ScrollView>
    );
  }

  if (!lesson || !currentStep) return null;
  const isLast = stepIdx === lesson.steps.length - 1;

  return (
    <View style={s.bg}>
      <View style={s.boardWrapper}>
        <ChessBoard
          fen={fen}
          highlights={highlights}
          moveDots={moveDots}
          hiddenSquares={hidden}
          flash={flash}
          onSquarePress={handleSquarePress}
        />
      </View>

      <View style={s.panel}>
        <View style={s.panelTop}>
          <TouchableOpacity style={s.backBtn} onPress={() => { setPhase('list'); setLesson(null); setStepIdx(0); }}>
            <Text style={s.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={s.dots}>
            {lesson.steps.map((_, i) => (
              <View key={i} style={[s.dot, i < stepIdx && s.dotDone, i === stepIdx && s.dotCurrent]} />
            ))}
          </View>
          <Text style={s.stepCounter}>{stepIdx + 1}/{lesson.steps.length}</Text>
        </View>

        <ScrollView style={s.panelBody} contentContainerStyle={{ gap: spacing.sm }}>
          <Text style={s.stepTitle}>{currentStep.title}</Text>
          <Text style={s.explanation}>{currentStep.explanation}</Text>
          {currentStep.type === 'challenge' && (
            <View style={s.challengeBox}>
              <Text style={s.challengeText}>
                {!selected
                  ? `Tap the ${currentStep.challengePiece?.toUpperCase()} square`
                  : 'Now tap the destination'}
              </Text>
            </View>
          )}
          {feedback !== 'none' && (
            <Text style={[s.feedbackText, feedback === 'correct' ? s.feedbackOk : s.feedbackBad]}>
              {feedbackMsg}
            </Text>
          )}
        </ScrollView>

        {currentStep.type === 'demo' && (
          <View style={s.panelFooter}>
            <TouchableOpacity style={[s.nextBtn, busy && { opacity: 0.5 }]} onPress={() => { if (!busy) { setBusy(true); advance(); } }} disabled={busy}>
              <Text style={s.nextBtnText}>{isLast ? '★ Finish' : 'Next →'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const PANEL_H = 260;
const s = StyleSheet.create({
  bg:           { flex: 1, backgroundColor: colors.bg },
  listPad:      { padding: spacing.md },
  pageTitle:    { fontSize: font.xl, fontWeight: '700', color: colors.accent, marginBottom: spacing.lg, letterSpacing: 2 },
  group:        { marginBottom: spacing.lg },
  groupHeader:  { fontSize: font.sm, color: colors.accent, letterSpacing: 2, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.xs, marginBottom: spacing.sm },
  card:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, marginBottom: spacing.xs },
  cardIcon:     { fontSize: 28 },
  cardText:     { flex: 1 },
  cardTitle:    { color: colors.accent, fontSize: font.base, fontWeight: '600' },
  cardSub:      { color: colors.textMuted, fontSize: font.xs, marginTop: 2 },
  boardWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel:        { height: PANEL_H, backgroundColor: colors.surface, borderTopWidth: 2, borderTopColor: colors.border },
  panelTop:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn:      {},
  backText:     { color: colors.textMuted, fontSize: font.sm },
  dots:         { flexDirection: 'row', gap: 5 },
  dot:          { width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
  dotDone:      { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
  dotCurrent:   { backgroundColor: colors.accent, borderColor: colors.accent },
  stepCounter:  { color: colors.textMuted, fontSize: font.xs, marginLeft: 'auto' },
  panelBody:    { flex: 1, padding: spacing.sm },
  stepTitle:    { fontSize: font.base, fontWeight: '700', color: colors.accent },
  explanation:  { fontSize: font.xs, color: colors.text, lineHeight: font.xs * 1.8 },
  challengeBox: { borderWidth: 1, borderColor: colors.accent, borderRadius: radius.sm, padding: spacing.sm },
  challengeText:{ color: colors.accent, fontSize: font.xs },
  feedbackText: { fontSize: font.sm, fontWeight: '700', padding: spacing.xs },
  feedbackOk:   { color: colors.success },
  feedbackBad:  { color: colors.danger },
  panelFooter:  { padding: spacing.sm, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-end' },
  nextBtn:      { backgroundColor: colors.accent, borderRadius: radius.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  nextBtnText:  { color: colors.bg, fontWeight: '700', fontSize: font.base },
});
