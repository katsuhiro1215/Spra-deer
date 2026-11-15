import type { NextConfig } from 'next';

// 静的書き出し（Tane・Spra Go と同じ）。ゲームはブラウザ側だけで動く。
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: false, // 開発時にゲームが二重起動しないように
  devIndicators: false, // 開発時の左下の「N」ボタンを出さない(画面が下まであるので、下のバーのボタンに重なる)
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.*.*', '172.*.*.*', '10.*.*.*'], // 開発時に、スマホなどからも開けるように
};

export default nextConfig;
