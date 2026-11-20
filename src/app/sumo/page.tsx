import type { Metadata } from 'next';
import { SumoShell } from './SumoShell';

export const metadata: Metadata = {
  title: '鹿ずもう｜Spraと鹿。',
  description: '角を合わせて、はっけよい。いろんな鹿と押し合い勝負をする、WORLD 6 のゲーム。',
};

export default function Page() {
  return <SumoShell />;
}
