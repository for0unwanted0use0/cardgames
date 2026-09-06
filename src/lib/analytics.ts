"use client";

import { sendGAEvent } from "@next/third-parties/google";

type AnalyticsValue = string | number | boolean;

export function trackEvent(name: string, parameters: Record<string, AnalyticsValue> = {}) {
  if (!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) return;
  try { sendGAEvent("event", name, parameters); }
  catch { /* Analytics must never interrupt the game. */ }
}
