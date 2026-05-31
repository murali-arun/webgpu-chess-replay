import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { login, storeToken } from '../../src/api/auth';
import { colors, spacing, radius, font } from '../../src/constants/theme';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password) { setError('Username and password required.'); return; }
    setLoading(true); setError('');
    try {
      const res = await login(username.trim(), password);
      await storeToken(res.token);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message ?? 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.brand}>♟ Chess Retro</Text>
          <Text style={s.subtitle}>Play. Learn. Improve.</Text>
        </View>
        <View style={s.card}>
          <Text style={s.label}>Username</Text>
          <TextInput style={s.input} value={username} onChangeText={setUsername}
            autoCapitalize="none" autoCorrect={false} returnKeyType="next"
            placeholder="username" placeholderTextColor={colors.textMuted} />

          <Text style={[s.label, { marginTop: spacing.md }]}>Password</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword}
            secureTextEntry returnKeyType="done" onSubmitEditing={handleLogin}
            placeholder="••••••••" placeholderTextColor={colors.textMuted} />

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity style={[s.btn, loading && s.btnOff]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={s.btnText}>Sign In</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.link} onPress={() => router.push('/(auth)/register')}>
            <Text style={s.linkText}>No account? Register</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:    { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  header:  { alignItems: 'center', marginBottom: spacing.xl },
  brand:   { fontSize: font.xxl, fontWeight: '700', color: colors.accent, letterSpacing: 2 },
  subtitle:{ color: colors.textMuted, marginTop: spacing.xs, fontSize: font.base },
  card:    { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  label:   { fontSize: font.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  input:   { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, fontSize: font.base, color: colors.text, backgroundColor: colors.bg },
  error:   { color: colors.danger, fontSize: font.sm, marginVertical: spacing.xs },
  btn:     { backgroundColor: colors.accent, borderRadius: radius.sm, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  btnOff:  { opacity: 0.5 },
  btnText: { color: colors.bg, fontWeight: '700', fontSize: font.base },
  link:    { alignItems: 'center', marginTop: spacing.md },
  linkText:{ color: colors.accent, fontSize: font.sm },
});
