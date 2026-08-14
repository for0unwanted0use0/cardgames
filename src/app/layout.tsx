import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Card Table",
  description: "Local card-game scorepads and playable games",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
