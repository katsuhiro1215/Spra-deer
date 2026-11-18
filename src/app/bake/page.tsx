import type { Metadata } from 'next';
import { BakeShell } from './BakeShell';

export const metadata: Metadata = {
  title: '鹿せんべい大作戦｜Spraと鹿。',
  description: '奈良公園のせんべい屋台で、せんべいを焼いて鹿にわたそう。WORLD 2 の3Dゲーム。',
};

export default function Page() {
  return <BakeShell />;
}
