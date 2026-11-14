import type { NextConfig } from 'next';

// 静的書き出し（Tane・Spra Go と同じ）。ゲームはブラウザ側だけで動く。
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: false, // 開発時にゲームが二重起動しないように
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.*.*', '172.*.*.*', '10.*.*.*'], // 開発時に、スマホなどからも開けるように
};

export default nextConfig;
