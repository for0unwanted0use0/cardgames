import { describe, expect, it } from "vitest";
import { microphoneErrorMessage } from "../components/VoicePanel";

describe("voice microphone errors", () => {
  it("gives actionable messages for permission, missing-device, and busy-device failures", () => {
    expect(microphoneErrorMessage(new DOMException("denied", "NotAllowedError"))).toBe("Microphone access was not allowed.");
    expect(microphoneErrorMessage(new DOMException("missing", "NotFoundError"))).toBe("No microphone was found.");
    expect(microphoneErrorMessage(new DOMException("busy", "NotReadableError"))).toContain("unavailable");
  });
});
