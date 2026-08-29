import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';

import './globals.css';

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-archivo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ASCII-Lens',
  description:
    'Turn a photo or your webcam into ASCII art, entirely in the browser. Nothing is uploaded.',
};

export const viewport: Viewport = {
  themeColor: '#efece4',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
