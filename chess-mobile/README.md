# Chess Retro — Mobile App

React Native (Expo SDK 56) mobile app for [chess.anmious.cloud](https://chess.anmious.cloud).

## Screens

- **Play** — vs Stockfish (easy / medium / hard)
- **Online** — real-time multiplayer via WebSocket
- **Tutorial** — interactive lessons from the lesson API
- **Profile** — win/loss/draw stats + logout

## Prerequisites

- Node 22+
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- **iOS builds**: macOS + Xcode (from App Store)
- **Android builds**: Android Studio + JDK 17

## Setup

```bash
cd chess-mobile
npm install --legacy-peer-deps
eas login   # log in with Expo account (arunmurali)
```

## Local Builds (MacBook — free, unlimited)

### iOS

```bash
eas build --platform ios --local --profile production
```

Outputs a `.ipa` file locally. Submit to TestFlight:

```bash
eas submit --platform ios --latest
```

### Android

```bash
eas build --platform android --local --profile production
```

Outputs an `.aab` file locally.

## Run on Simulator / Device

```bash
npx expo run:ios       # opens in iOS Simulator
npx expo run:android   # opens in Android emulator
```

## CI (GitHub Actions)

Triggers automatically on push to `main` when files under `chess-mobile/` change.
Uses EAS cloud builders — iOS uses free tier (resets monthly).

To trigger manually: Actions tab → "Mobile Build (EAS)" → Run workflow.

## Environment

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://chess.anmious.cloud` |

Set in `eas.json` per build profile. No `.env` file needed.

## Credentials

- **Apple Team**: `FZM97P9CN7`
- **Bundle ID**: `com.arunmurali.chessretro`
- **App Store ID**: `6775067951`
- **EAS Project**: `ca0de529-5aa1-41d6-a0e7-480f96b70edb`
- **ASC API Key**: `AuthKey_ABV4UNU476.p8` (gitignored — copy from financialEngine-mobile)
