import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { register, storeToken } from '../../src/api/auth';
import { colors, spacing, radius, font } from '../../src/constants/theme';

export default function RegisterScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleRegister() {
    if (!username.trim() || !password) { setError('Username and password required.'); return; }
    if (password !== confirm)          { setError('Passwords do not match.'); return; }
    if (password.length < 6)           { setError('Password must be at least 6 characters.'); return; }
    setLoading(true); setError('');
    try {
      const res = await register(username.trim(), password);
      await storeToken(res.token);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message ?? 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.brand}>♟ Chess Retro</Text>
          <Text style={s.subtitle}>Create your account</Text>
        </View>
        <View style={s.card}>
          <Text style={s.label}>Username</Text>
          <TextInput style={s.input} value={username} onChangeText={setUsername}
            autoCapitalize="none" autoCorrect={false} returnKeyType="next"
            placeholder="choose a username" placeholderTextColor={colors.textMuted} />

          <Text style={[s.label, { marginTop: spacing.md }]}>Password</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword}
            secureTextEntry returnKeyType="next"
            placeholder="min 6 characters" placeholderTextColor={colors.textMuted} />

          <Text style={[s.label, { marginTop: spacing.md }]}>Confirm Password</Text>
          <TextInput style={s.input} value={confirm} onChangeText={setConfirm}
            secureTextEntry returnKeyType="done" onSubmitEditing={handleRegister}
            placeholder="re-enter password" placeholderTextColor={colors.textMuted} />

          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity style={[s.btn, loading && s.btnOff]} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.bg} /> : <Text style={s.btnText}>Create Account</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.link} onPress={() => router.back()}>
            <Text style={s.linkText}>Already have an account? Sign In</Text>
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
