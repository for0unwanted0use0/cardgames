"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";

const deploymentUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!deploymentUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured. Run `npx convex dev`. ");
const convex = new ConvexReactClient(deploymentUrl);

export default function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
