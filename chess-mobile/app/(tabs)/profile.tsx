import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { getMe, logout } from '../../src/api/auth';
import { apiFetch } from '../../src/api/client';
import { colors, spacing, radius, font } from '../../src/constants/theme';

interface Stats {
  wins: number; losses: number; draws: number; total: number;
  byDifficulty: { difficulty: string; wins: number; losses: number; draws: number }[];
}

export default function ProfileScreen() {
  const [username, setUsername] = useState('');
  const [stats,    setStats]    = useState<Stats | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      getMe().catch(() => null),
      apiFetch<Stats>('/api/game/stats').catch(() => null),
    ]).then(([me, s]) => {
      if (me?.username) setUsername(me.username);
      if (s) setStats(s);
    }).finally(() => setLoading(false));
  }, []);

  function handleLogout() {
    Alert.alert('Log Out', 'Log out of your account?', [
      { text: 'Cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => {
        await logout();
        router.replace('/(auth)/login');
      }},
    ]);
  }

  const winRate = stats && stats.total > 0
    ? Math.round((stats.wins / stats.total) * 100)
    : null;

  return (
    <ScrollView style={s.bg} contentContainerStyle={s.container}>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : (
        <>
          <View style={s.avatarRow}>
            <View style={s.avatar}>
              <Text style={s.avatarChar}>{username ? username[0].toUpperCase() : '?'}</Text>
            </View>
            <View>
              <Text style={s.username}>{username || 'Unknown'}</Text>
              <Text style={s.userSub}>Chess Retro</Text>
            </View>
          </View>

          <View style={s.section}>
            <Text style={s.sectionTitle}>Overall Record</Text>
            <View style={s.statRow}>
              <StatBox label="Wins"   value={stats?.wins   ?? 0} color={colors.success} />
              <StatBox label="Losses" value={stats?.losses ?? 0} color={colors.danger}  />
              <StatBox label="Draws"  value={stats?.draws  ?? 0} color={colors.textMuted} />
            </View>
            {winRate !== null && (
              <Text style={s.winRate}>{winRate}% win rate · {stats?.total} games</Text>
            )}
          </View>

          {stats?.byDifficulty && stats.byDifficulty.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>By Difficulty</Text>
              {stats.byDifficulty.map(row => (
                <View key={row.difficulty} style={s.diffRow}>
                  <Text style={s.diffLabel}>{row.difficulty.toUpperCase()}</Text>
                  <Text style={s.diffStat}>
                    <Text style={{ color: colors.success }}>{row.wins}W</Text>
                    {'  '}
                    <Text style={{ color: colors.danger }}>{row.losses}L</Text>
                    {'  '}
                    <Text style={{ color: colors.textMuted }}>{row.draws}D</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
            <Text style={s.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.statBox}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bg:          { flex: 1, backgroundColor: colors.bg },
  container:   { padding: spacing.lg, gap: spacing.lg },
  avatarRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  avatar:      { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.accent },
  avatarChar:  { fontSize: font.xl, fontWeight: '700', color: colors.accent },
  username:    { fontSize: font.lg, fontWeight: '700', color: colors.accent },
  userSub:     { fontSize: font.xs, color: colors.textMuted, marginTop: 2 },
  section:     { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  sectionTitle:{ fontSize: font.sm, color: colors.accent, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.xs },
  statRow:     { flexDirection: 'row', gap: spacing.sm },
  statBox:     { flex: 1, alignItems: 'center', padding: spacing.sm, backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  statValue:   { fontSize: font.xl, fontWeight: '700' },
  statLabel:   { fontSize: font.xs, color: colors.textMuted, marginTop: 2 },
  winRate:     { fontSize: font.xs, color: colors.textMuted, textAlign: 'center' },
  diffRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  diffLabel:   { flex: 1, fontSize: font.xs, color: colors.textMuted, letterSpacing: 1 },
  diffStat:    { fontSize: font.sm, fontWeight: '600' },
  logoutBtn:   { borderWidth: 1, borderColor: colors.danger, borderRadius: radius.sm, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  logoutText:  { color: colors.danger, fontWeight: '700', fontSize: font.base },
});
