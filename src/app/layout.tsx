import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Kalam } from 'next/font/google';
import '@/styles/globals.css';

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  variable: '--font-bricolage',
  display: 'swap',
});

const kalam = Kalam({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-kalam',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Balderdash',
  description: 'The word-definition bluffing game. Host on a big screen, play from your phone.',
};

export const viewport: Viewport = {
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E6E9F7' },
    { media: '(prefers-color-scheme: dark)', color: '#12163A' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} ${kalam.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
