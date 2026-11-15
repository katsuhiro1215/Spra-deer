import type { Metadata } from 'next';
import { RunShell } from './RunShell';

export const metadata: Metadata = {
  title: '鹿、走る。｜Spraと鹿。',
  description: '鹿になって、参道や街道をかけぬけよう。ステージ3の3D走りゲーム。',
};

export default function Page() {
  return <RunShell />;
}
