import type { Metadata } from 'next';
import { JumpShell } from './JumpShell';

export const metadata: Metadata = {
  title: '鹿の背中で ぴょんぴょん｜Spraと鹿。',
  description: 'Spra が 鹿の背中を ぴょんぴょん跳んで、上へ上へ。WORLD 5 のジャンプゲーム。',
};

export default function Page() {
  return <JumpShell />;
}
