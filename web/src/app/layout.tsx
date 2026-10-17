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
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
