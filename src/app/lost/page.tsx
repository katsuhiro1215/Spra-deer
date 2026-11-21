import type { Metadata } from 'next';
import { LostShell } from './LostShell';

export const metadata: Metadata = {
  title: '鹿のまいご探し｜Spraと鹿。',
  description: '夜の奈良公園で、ちょうちんを持った Spra が、まいごの子鹿を お母さん鹿の ところへ 連れて帰る。WORLD 7 の迷路ゲーム。',
};

export default function Page() {
  return <LostShell />;
}
