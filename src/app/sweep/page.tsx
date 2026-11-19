import type { Metadata } from 'next';
import { SweepShell } from './SweepShell';

export const metadata: Metadata = {
  title: '奈良公園、大掃除！｜Spraと鹿。',
  description: '大仏さままでの参道を、ほうきで ぴかぴかに。WORLD 3 の3D掃除ゲーム。',
};

export default function Page() {
  return <SweepShell />;
}
