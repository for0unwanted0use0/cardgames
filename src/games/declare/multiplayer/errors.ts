export function playerFacingError(error: unknown): string {
  const data = error && typeof error === "object" && "data" in error
    ? (error as { data?: unknown }).data
    : undefined;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
    return data.message.trim();
  }

  const raw = error instanceof Error && error.message ? error.message : "The room action failed. Please try again.";
  const convexMessage = raw.match(/Uncaught ConvexError:\s*([^\n]+)/)?.[1];
  return (convexMessage ?? raw).trim();
}
