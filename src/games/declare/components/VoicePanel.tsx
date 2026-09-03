"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RoomAudioRenderer, StartAudio } from "@livekit/components-react";
import { ConnectionState, Room, RoomEvent, type Participant } from "livekit-client";

type VoicePanelProps = { roomCode: string; seatToken: string };
type VoicePhase = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";
type VoiceParticipant = {
  identity: string; name: string; isSpeaking: boolean; isMicrophoneEnabled: boolean; isLocal: boolean;
};
type VoiceTokenResponse = { serverUrl: string; token: string };

export function microphoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access was not allowed.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "No microphone was found.";
  if (name === "NotReadableError" || name === "TrackStartError") return "The microphone is unavailable or being used by another application.";
  return error instanceof Error && error.message ? error.message : "Voice is temporarily unavailable.";
}

function visibleParticipant(participant: Participant, isLocal: boolean): VoiceParticipant {
  return {
    identity: participant.identity,
    name: participant.name || (isLocal ? "You" : participant.identity),
    isSpeaking: participant.isSpeaking,
    isMicrophoneEnabled: participant.isMicrophoneEnabled,
    isLocal,
  };
}

export default function VoicePanel({ roomCode, seatToken }: VoicePanelProps) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [phase, setPhase] = useState<VoicePhase>("disconnected");
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const leavingRef = useRef(false);

  const refreshParticipants = useCallback(() => {
    if (room.state === ConnectionState.Disconnected) return setParticipants([]);
    setParticipants([
      visibleParticipant(room.localParticipant, true),
      ...Array.from(room.remoteParticipants.values()).map((participant) => visibleParticipant(participant, false)),
    ]);
  }, [room]);

  useEffect(() => {
    const onConnectionState = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) setPhase("connected");
      else if (state === ConnectionState.Connecting) setPhase("connecting");
      else if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) setPhase("reconnecting");
      else if (!leavingRef.current) setPhase((current) => current === "error" ? current : "disconnected");
      refreshParticipants();
    };
    const onDisconnected = () => {
      setParticipants([]);
      setPhase((current) => leavingRef.current || current !== "error" ? "disconnected" : current);
      leavingRef.current = false;
    };
    const onMediaError = (mediaError: Error) => {
      setError(microphoneErrorMessage(mediaError));
      setPhase("error");
    };
    room.on(RoomEvent.ConnectionStateChanged, onConnectionState);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.ParticipantConnected, refreshParticipants);
    room.on(RoomEvent.ParticipantDisconnected, refreshParticipants);
    room.on(RoomEvent.TrackMuted, refreshParticipants);
    room.on(RoomEvent.TrackUnmuted, refreshParticipants);
    room.on(RoomEvent.LocalTrackPublished, refreshParticipants);
    room.on(RoomEvent.LocalTrackUnpublished, refreshParticipants);
    room.on(RoomEvent.ActiveSpeakersChanged, refreshParticipants);
    room.on(RoomEvent.MediaDevicesError, onMediaError);
    return () => {
      room.removeAllListeners();
      void room.disconnect(true);
    };
  }, [refreshParticipants, room]);

  async function joinVoice() {
    if (busy || room.state !== ConnectionState.Disconnected) return;
    setBusy(true);
    setError("");
    setPhase("connecting");
    leavingRef.current = false;
    try {
      const response = await fetch("/api/voice/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, seatToken }),
      });
      const body = await response.json() as VoiceTokenResponse | { error?: string };
      if (!response.ok || !("token" in body) || !("serverUrl" in body)) {
        throw new Error("error" in body && body.error ? body.error : "Voice is temporarily unavailable.");
      }
      await room.connect(body.serverUrl, body.token, { autoSubscribe: true });
      await room.startAudio().catch(() => undefined);
      await room.localParticipant.setMicrophoneEnabled(true);
      setPhase("connected");
      refreshParticipants();
    } catch (joinError) {
      leavingRef.current = true;
      await room.disconnect(true).catch(() => undefined);
      leavingRef.current = false;
      setError(microphoneErrorMessage(joinError));
      setPhase("error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMute() {
    if (busy || phase !== "connected") return;
    setBusy(true);
    setError("");
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled);
      refreshParticipants();
    } catch (muteError) {
      setError(microphoneErrorMessage(muteError));
    } finally {
      setBusy(false);
    }
  }

  async function leaveVoice() {
    if (busy) return;
    setBusy(true);
    leavingRef.current = true;
    await room.disconnect(true).catch(() => undefined);
    setParticipants([]);
    setError("");
    setPhase("disconnected");
    leavingRef.current = false;
    setBusy(false);
  }

  const connected = phase === "connected" || phase === "reconnecting";
  const localMuted = connected && !room.localParticipant.isMicrophoneEnabled;

  return <details className="voice-panel" aria-label="Optional room voice">
    <summary className="voice-heading"><span><i className={`voice-dot ${connected ? "online" : ""}`} aria-hidden="true" />Voice{connected ? ` · ${participants.length}` : ""}</span><small>{phase === "connecting" ? "Connecting…" : phase === "reconnecting" ? "Reconnecting…" : phase === "connected" ? "Connected" : phase === "error" ? "Unavailable" : "Optional"}</small></summary>
    {!connected && phase !== "connecting" && <button className="voice-join" disabled={busy} onClick={joinVoice}>{phase === "error" ? "Try Again" : "Join Voice"}</button>}
    {phase === "connecting" && <p className="subtle voice-status">Requesting secure voice access…</p>}
    {connected && <>
      <div className="voice-participants">{participants.map((participant) => <div key={participant.identity}>
        <span>{participant.name}{participant.isLocal ? " (you)" : ""}</span>
        <small className={participant.isSpeaking ? "speaking" : ""}>{participant.isSpeaking ? "Speaking" : participant.isMicrophoneEnabled ? "Connected" : "Muted"}</small>
      </div>)}</div>
      <div className="voice-actions">
        <button className="secondary" disabled={busy || phase === "reconnecting"} onClick={toggleMute}>{localMuted ? "Unmute" : "Mute"}</button>
        <button className="quiet danger" disabled={busy} onClick={leaveVoice}>Leave Voice</button>
      </div>
      <RoomAudioRenderer room={room} />
      <StartAudio room={room} label="Enable voice playback" />
    </>}
    {error && <p className="voice-error" role="alert">{error}</p>}
  </details>;
}
