import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Line — evacuation status',
  description:
    'Officer door-knock list and dispatcher status board for the Line welfare-check system.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The officer page has thumb-sized targets; stop iOS zooming on focus but allow pinch.
  maximumScale: 5,
  themeColor: '#0b0f14',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/*
          Libre Caslon Display and Geist Mono carry the reference build's typography. Loaded
          by link rather than next/font so the production build has no network dependency,
          and every rule names a local fallback (Georgia, the system mono) so a venue with
          bad wifi degrades instead of breaking.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* The rule below is a Pages Router rule; a link in the App Router's root layout
            does apply to every page. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Display&family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
