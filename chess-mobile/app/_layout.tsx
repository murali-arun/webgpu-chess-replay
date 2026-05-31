import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { getToken } from '../src/api/client';

function AuthGate() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getToken().then(token => {
      if (!token) router.replace('/(auth)/login');
      setChecked(true);
    });
  }, []);

  if (!checked) return null;
  return null;
}

export default function RootLayout() {
  return (
    <>
      <AuthGate />
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
