import type { ReactNode } from 'react';
import './legal.css';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="legal">
      <a className="legal-back" href="/">← ゲームにもどる</a>
      <h1>{title}</h1>
      <p className="legal-draft">下書きです。公開前にOwnerが確認し、必要に応じて専門家の確認を受けます。【要入力】の部分は、Ownerが埋めます。</p>
      {children}
      <p className="legal-foot">運営: かつコード（Spra）／最終更新: 2026-11-14（下書き）</p>
    </main>
  );
}
