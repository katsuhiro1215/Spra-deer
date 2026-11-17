import type { Metadata } from 'next';
import { CartShell } from './CartShell';

export const metadata: Metadata = {
  title: '鹿と暴走トロッコ｜Spraと鹿。',
  description: '鹿が引くトロッコで、山の線路をかけ下りる。WORLD 8 の3Dトロッコゲーム。',
};

export default function Page() {
  return <CartShell />;
}
