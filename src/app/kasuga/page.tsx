'use client';

import { useEffect } from 'react';

/** 旧URL(/kasuga/)。3D走りゲームは /run/ に移したので、4-1へ案内する。 */
export default function Page() {
  useEffect(() => {
    window.location.replace('/run/?level=4-1');
  }, []);
  return <p style={{ padding: 24 }}>3D走りゲームへ移動します…</p>;
}
