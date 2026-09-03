# Table Talk voice setup

Table Talk adds optional, audio-only LiveKit Cloud rooms to Online Declare. Convex remains authoritative for game rooms and seats; LiveKit carries microphone audio only.

## Required environment variables

Configure these locally in `.env.local` and in Vercel for the Production environment:

```text
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
```

Do not prefix the API key or secret with `NEXT_PUBLIC_`. The browser receives only a short-lived participant token and the non-secret WebSocket URL from `/api/voice/token` after the player clicks **Join Voice**.

The existing `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOY_KEY` configuration remains unchanged.

## Vercel

1. Open the Cardgames project in Vercel.
2. Go to **Settings → Environment Variables**.
3. Add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` for **Production**.
4. Keep `LIVEKIT_API_SECRET` marked sensitive.
5. Redeploy only after the changes are committed and pushed.

## Authorization model

1. The client sends its existing Declare room code and private seat token to the Next.js route.
2. Convex verifies that the room exists and that the token belongs to a seat in that room.
3. Convex supplies the authoritative player ID and display name.
4. The server creates a 10-minute LiveKit token restricted to `declare-<ROOM_CODE>`.
5. The token permits joining, publishing microphone audio, and subscribing to audio. It does not permit data publishing, metadata updates, recording, room administration, camera, or screen sharing.

No seat token, card data, discard data, microphone media, or LiveKit API secret is placed in participant metadata or returned by the endpoint.

## Manual verification

Use separate browsers/devices and headphones to avoid acoustic feedback.

- Verify two players can play without joining voice.
- Join voice explicitly on both devices and approve microphone access.
- Confirm two-way audio, mute, unmute, Leave Voice, and rejoin.
- Confirm Leave Voice does not leave the Declare game.
- Deny microphone permission and confirm the game remains usable and Try Again is available.
- Create two Declare rooms and confirm their voice participant lists/audio are isolated.
- Test three simultaneous voice participants.
- Test six participants when six devices/sessions are available; otherwise record it as pending.
