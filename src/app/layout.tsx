import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

// 公開のお試しのあいだは、検索に載せない。正式に公開するとき、この1行を消す(設計書 38章)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'Spraと鹿。｜足元には、ご用心。',
  description: '鹿のうんこをよけて、ゴールへ。…その道、ほんとうに安全？ Spraと鹿。奈良公園が舞台の縦画面ゲーム。',
  icons: { icon: '/favicon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#234b3a' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;800;900&family=Zen+Maru+Gothic:wght@500;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
