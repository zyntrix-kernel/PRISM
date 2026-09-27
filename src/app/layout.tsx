import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PRISM — Projected Reality Interaction & Spatial Manipulation",
  description:
    "PRISM by ZYNASH LABS: a dreamy, hand-controlled 3D science lab. Point to move the cursor, pinch to grab — no controller needed. Built on Three.js + MediaPipe.",
  keywords: [
    "PRISM",
    "hand tracking",
    "MediaPipe",
    "Three.js",
    "spatial interface",
    "gesture control",
    "3D visualization",
    "ZYNASH LABS",
  ],
  authors: [{ name: "ZYNASH LABS" }],
  icons: {
    icon: "data:,",
  },
  openGraph: {
    title: "PRISM — Spatial Interaction Lab",
    description:
      "A dreamy, hand-controlled 3D science lab. Point + pinch to explore the solar system, atoms, black holes, and more.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
