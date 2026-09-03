import { AccessToken, TrackSource, type VideoGrant } from "livekit-server-sdk";

export const VOICE_TOKEN_TTL_SECONDS = 10 * 60;

export type VoiceSeatIdentity = {
  roomCode: string;
  playerId: string;
  playerName: string;
};

export type VoiceTokenRequest = {
  roomCode: string;
  seatToken: string;
};

export type VoiceTokenResponse = {
  serverUrl: string;
  token: string;
};

export type VoiceTokenConfig = {
  serverUrl: string;
  apiKey: string;
  apiSecret: string;
};

export class VoiceRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function getVoiceRoomName(roomCode: string): string {
  const normalized = roomCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) throw new VoiceRequestError("Invalid room code.", 400);
  return `declare-${normalized}`;
}

export function parseVoiceTokenRequest(value: unknown): VoiceTokenRequest {
  if (!value || typeof value !== "object") throw new VoiceRequestError("Invalid request.", 400);
  const body = value as Record<string, unknown>;
  if (typeof body.roomCode !== "string" || typeof body.seatToken !== "string") {
    throw new VoiceRequestError("Room code and seat credential are required.", 400);
  }
  const roomCode = body.roomCode.trim().toUpperCase();
  getVoiceRoomName(roomCode);
  if (body.seatToken.length < 24 || body.seatToken.length > 200) {
    throw new VoiceRequestError("Invalid seat credential.", 400);
  }
  return { roomCode, seatToken: body.seatToken };
}

export async function issueVoiceToken(
  request: VoiceTokenRequest,
  config: VoiceTokenConfig,
  authorize: (request: VoiceTokenRequest) => Promise<VoiceSeatIdentity>,
): Promise<VoiceTokenResponse> {
  const identity = await authorize(request);
  if (identity.roomCode !== request.roomCode) throw new VoiceRequestError("Voice access denied.", 403);

  const room = getVoiceRoomName(identity.roomCode);
  const participantIdentity = `${identity.roomCode}:${identity.playerId}`;
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: participantIdentity,
    name: identity.playerName,
    ttl: VOICE_TOKEN_TTL_SECONDS,
  });
  const grant: VideoGrant = {
    roomJoin: true,
    room,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  };
  token.addGrant(grant);
  return { serverUrl: config.serverUrl, token: await token.toJwt() };
}
