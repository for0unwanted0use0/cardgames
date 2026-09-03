import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import {
  VoiceRequestError, issueVoiceToken, parseVoiceTokenRequest,
  type VoiceTokenConfig,
} from "../../../../games/declare/voice/token";

export const runtime = "nodejs";

function voiceConfig(): VoiceTokenConfig {
  const serverUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!serverUrl || !apiKey || !apiSecret) {
    throw new VoiceRequestError("Voice is not configured.", 503);
  }
  return { serverUrl, apiKey, apiSecret };
}

export async function POST(request: Request) {
  try {
    const body = parseVoiceTokenRequest(await request.json());
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) throw new VoiceRequestError("Game service is not configured.", 503);
    const convex = new ConvexHttpClient(convexUrl);
    const response = await issueVoiceToken(body, voiceConfig(), async ({ roomCode, seatToken }) =>
      convex.query(api.rooms.voiceIdentity, { code: roomCode, seatToken }));
    return Response.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof VoiceRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Voice access denied." }, { status: 403 });
  }
}
