import { describe, expect, it, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import {
  VoiceRequestError, getVoiceRoomName, issueVoiceToken, parseVoiceTokenRequest,
  type VoiceSeatIdentity, type VoiceTokenRequest,
} from "./token";

const config = {
  serverUrl: "wss://example.livekit.cloud",
  apiKey: "test-api-key",
  apiSecret: "test-api-secret-that-never-leaves-the-server",
};

const alice: VoiceSeatIdentity = {
  roomCode: "AB12CD",
  playerId: "player-1",
  playerName: "Alice",
};

const request: VoiceTokenRequest = {
  roomCode: "AB12CD",
  seatToken: "valid-seat-token-1234567890",
};

describe("voice room mapping and request validation", () => {
  it("maps Declare rooms deterministically into a separate LiveKit namespace", () => {
    expect(getVoiceRoomName("ab12cd")).toBe("declare-AB12CD");
    expect(() => getVoiceRoomName("bad-room")).toThrow(VoiceRequestError);
  });

  it("accepts only a room code and valid seat credential and ignores impersonation fields", () => {
    expect(parseVoiceTokenRequest({
      roomCode: "ab12cd",
      seatToken: request.seatToken,
      playerId: "player-6",
      playerName: "Impostor",
    })).toEqual(request);
    expect(() => parseVoiceTokenRequest({ roomCode: "AB12CD" })).toThrow(VoiceRequestError);
  });
});

describe("voice token authorization", () => {
  it("issues a short-lived, audio-publish-only token using authoritative seat identity", async () => {
    const authorize = vi.fn(async () => alice);
    const response = await issueVoiceToken(request, config, authorize);
    expect(authorize).toHaveBeenCalledWith(request);
    expect(response.serverUrl).toBe(config.serverUrl);
    expect(JSON.stringify(response)).not.toContain(config.apiSecret);

    const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(response.token);
    expect(claims.sub).toBe("AB12CD:player-1");
    expect(claims.name).toBe("Alice");
    expect(claims.video).toMatchObject({
      roomJoin: true,
      room: "declare-AB12CD",
      canPublish: true,
      canPublishSources: ["microphone"],
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    expect(claims.video?.roomAdmin).not.toBe(true);
  });

  it.each([
    ["invalid seat token"],
    ["seat token from another room"],
    ["missing room"],
    ["guessed room code"],
  ])("rejects %s", async () => {
    const deny = vi.fn(async () => { throw new Error("not authorized"); });
    await expect(issueVoiceToken(request, config, deny)).rejects.toThrow("not authorized");
  });

  it("rejects an authorization result for a different room", async () => {
    await expect(issueVoiceToken(request, config, async () => ({ ...alice, roomCode: "ZZ99ZZ" })))
      .rejects.toMatchObject({ status: 403 });
  });
});
