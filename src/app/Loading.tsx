'use client';

import { useEffect, useState } from 'react';
import './loading.css';

/** 3Dゲームなどの 読み込み中(2〜3秒)に、白い画面のままにならないよう出す。done になると すっと消える */
export function Loading({ done }: { done: boolean }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => setGone(true), 500);
    return () => window.clearTimeout(t);
  }, [done]);
  if (gone) return null;
  return (
    <div className={`lo-root${done ? ' lo-out' : ''}`} role="status" aria-live="polite">
      <img className="lo-logo" src="/assets/logo.svg" alt="" />
      <p className="lo-text">よみこみ中…</p>
      <i className="lo-bar" />
    </div>
  );
}
