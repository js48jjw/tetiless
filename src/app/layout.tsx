import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TETILESS",
  description: "TETILESS Block Build",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" href="/icons/icon_192x192.png" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#06b6d4" />
        <meta name="color-scheme" content="only light" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        role="application"
        aria-label="Block Stacking Game App"
      >
        {children}
        {/* Left Promo Banner */}
        <a
          className="promo-banner left"
          href="https://pmioham9d3.sens.kr"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="왼쪽 홍보 배너"
        >
          <img src="/dbsense-banner-left.png" alt="왼쪽 홍보 배너" />
        </a>
        {/* Right Promo Banner */}
        <a
          className="promo-banner right"
          href="https://ig8rt9xz3i.sens.kr"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="오른쪽 홍보 배너"
        >
          <img src="/dbsense-banner-right.png" alt="오른쪽 홍보 배너" />
        </a>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
