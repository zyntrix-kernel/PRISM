import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://prism-zynashlabs.vercel.app"),
  title: {
    default: "PRISM · ZYNASH LABS",
    template: "%s · PRISM",
  },
  description:
    "PRISM by ZYNASH LABS. Projected Reality Interaction & Spatial Manipulation, a hand-controlled realtime 3D science experience.",
  applicationName: "PRISM",
  generator: "Next.js",
  keywords: [
    "PRISM",
    "ZYNASH LABS",
    "hand tracking",
    "spatial interaction",
    "gesture control",
    "Three.js",
    "MediaPipe",
    "3D science",
  ],
  authors: [
    { name: "Tanay Bhandari", url: "https://github.com/zyntrix-kernel" },
    { name: "ZYNASH LABS" },
  ],
  creator: "ZYNASH LABS",
  publisher: "ZYNASH LABS",
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/zynash-logo.png",
    apple: "/zynash-logo.png",
  },
  openGraph: {
    title: "PRISM · ZYNASH LABS",
    description:
      "A realtime hand-controlled 3D science experience. Point, pinch, explore.",
    type: "website",
    siteName: "PRISM · ZYNASH LABS",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "PRISM · ZYNASH LABS",
    description:
      "Projected Reality Interaction & Spatial Manipulation.",
  },
};

export const viewport: Viewport = {
  themeColor: "#020812",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: true,
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
