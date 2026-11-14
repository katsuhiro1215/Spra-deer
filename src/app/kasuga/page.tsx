import type { Metadata } from 'next';
import { KasugaShell } from './KasugaShell';

export const metadata: Metadata = {
  title: 'お試し：春日大社へ｜Spraと鹿。',
  description: '鹿になって、石灯籠の参道を春日大社までかけぬけよう。3D走りゲームのお試し版。',
};

export default function Page() {
  return <KasugaShell />;
}
