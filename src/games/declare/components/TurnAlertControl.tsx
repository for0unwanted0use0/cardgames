"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "declare-turn-alerts-v1";

function soundBell(context: AudioContext) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(740, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(520, context.currentTime + 0.22);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.32);
}

export default function TurnAlertControl({ isTurn, activeGame }: { isTurn: boolean; activeGame: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);
  const wasTurn = useRef(isTurn);

  useEffect(() => {
    setEnabled(localStorage.getItem(STORAGE_KEY) === "on");
    setLoaded(true);
  }, []);

  useEffect(() => {
    const turnJustStarted = loaded && enabled && activeGame && isTurn && !wasTurn.current;
    wasTurn.current = isTurn;
    if (!turnJustStarted) return;
    const context = audioContext.current;
    if (context) void context.resume().then(() => soundBell(context)).catch(() => undefined);
    navigator.vibrate?.([120, 70, 120]);
  }, [activeGame, enabled, isTurn, loaded]);

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    if (!next) return;
    const AudioContextConstructor = window.AudioContext;
    audioContext.current ??= new AudioContextConstructor();
    void audioContext.current.resume().then(() => soundBell(audioContext.current!)).catch(() => undefined);
    navigator.vibrate?.(80);
  }

  return <div className="turn-alert-setting">
    <span><strong>Turn alerts</strong><small>Bell and vibration when supported</small></span>
    <button type="button" className={enabled ? "alert-toggle enabled" : "alert-toggle"} aria-pressed={enabled} onClick={toggle}>
      {enabled ? "On" : "Enable"}
    </button>
  </div>;
}
