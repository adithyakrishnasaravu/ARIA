import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";

import { CopilotProvider } from "@/components/providers/copilot-provider";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ARIA | Autonomous Root-cause Intelligence Agent",
  description:
    "Multi-agent incident investigation copilot: Datadog + Neo4j + MongoDB + Bedrock in a CopilotKit UI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${plexMono.variable}`}>
        <CopilotProvider>{children}</CopilotProvider>
      </body>
    </html>
  );
}
