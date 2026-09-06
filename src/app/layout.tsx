import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";
import ConvexClientProvider from "./ConvexClientProvider";

export const metadata: Metadata = {
  title: "Card Table · Online Declare",
  description: "Local card-game scorepads and playable games",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  return (
    <html lang="en">
      <body><ConvexClientProvider>{children}</ConvexClientProvider></body>
      {measurementId && <GoogleAnalytics gaId={measurementId} />}
    </html>
  );
}
