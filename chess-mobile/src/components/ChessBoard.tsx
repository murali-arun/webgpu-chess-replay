import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Chess } from 'chess.js';
import { colors } from '../constants/theme';

const FILES = ['a','b','c','d','e','f','g','h'];

const WHITE_PIECES: Record<string, string> = {
  k:'♔', q:'♕', r:'♖', b:'♗', n:'♘', p:'♙',
};
const BLACK_PIECES: Record<string, string> = {
  k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟',
};

interface Props {
  fen: string;
  highlights?:    string[];
  moveDots?:      string[];
  hiddenSquares?: string[];
  flipped?:       boolean;
  flash?:         { square: string; type: 'correct' | 'wrong' } | null;
  onSquarePress?: (sq: string) => void;
}

const BOARD_SIZE = Math.min(Dimensions.get('window').width, 420);
const SQ = BOARD_SIZE / 8;

export default function ChessBoard({
  fen, highlights = [], moveDots = [], hiddenSquares = [],
  flipped = false, flash = null, onSquarePress,
}: Props) {
  let board: (ReturnType<Chess['board']>[0][0])[][] = [];
  try {
    const chess = new Chess();
    chess.load(fen, { skipValidation: true });
    board = chess.board();
  } catch {
    board = Array(8).fill(null).map(() => Array(8).fill(null));
  }

  const ranks = flipped ? [0,1,2,3,4,5,6,7] : [7,6,5,4,3,2,1,0];
  const files = flipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

  return (
    <View style={styles.board}>
      {ranks.map(ri => (
        <View key={ri} style={styles.rank}>
          {files.map(fi => {
            const sq     = `${FILES[fi]}${ri + 1}`;
            const piece  = board[7 - ri]?.[fi] ?? null;
            const isLight = (ri + fi) % 2 === 0;
            const isHl    = highlights.includes(sq);
            const isDot   = moveDots.includes(sq);
            const isHidden = hiddenSquares.includes(sq);
            const isFlash  = flash?.square === sq;

            let bgColor = isLight ? colors.sqLight : colors.sqDark;
            if (isHl) bgColor = colors.sqHl;
            if (isFlash) bgColor = flash?.type === 'correct' ? '#00cc55' : '#ff5555';

            const symbol = piece
              ? (piece.color === 'w' ? WHITE_PIECES : BLACK_PIECES)[piece.type]
              : '';

            return (
              <TouchableOpacity
                key={sq}
                activeOpacity={onSquarePress ? 0.7 : 1}
                onPress={() => onSquarePress?.(sq)}
                style={[styles.square, { backgroundColor: bgColor }]}
              >
                {!isHidden && symbol ? (
                  <Text style={[styles.piece, piece?.color === 'w' ? styles.whitePiece : styles.blackPiece]}>
                    {symbol}
                  </Text>
                ) : null}
                {isDot && !piece && (
                  <View style={styles.dot} />
                )}
                {isDot && piece && (
                  <View style={styles.captureDot} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board:       { width: BOARD_SIZE, height: BOARD_SIZE, borderWidth: 2, borderColor: colors.border },
  rank:        { flexDirection: 'row' },
  square:      { width: SQ, height: SQ, alignItems: 'center', justifyContent: 'center' },
  piece:       { fontSize: SQ * 0.62, lineHeight: SQ * 0.75, textAlign: 'center' },
  whitePiece:  { color: '#fff', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  blackPiece:  { color: '#111', textShadowColor: '#ffaa0066', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 },
  dot:         { width: SQ * 0.3, height: SQ * 0.3, borderRadius: SQ * 0.15, backgroundColor: 'rgba(255,170,0,0.65)' },
  captureDot:  { position: 'absolute', width: SQ, height: SQ, borderRadius: SQ / 2, borderWidth: 4, borderColor: 'rgba(255,170,0,0.65)', backgroundColor: 'transparent' },
});
