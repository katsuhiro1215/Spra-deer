// 面の番号の付けかえ(保存してある記録・コインの印を、新しい番号へ引きつぐ)。
// 2026-11-19 Owner決定: 奇数のワールドは Spra が主役、偶数のワールドは鹿が主役。
// そのため WORLD 3(鹿、走る。)と WORLD 4(奈良公園、大掃除！)を入れかえた: 旧 3-n → 新 4-n、旧 4-1 → 新 3-1。

/** 旧番号 → 新番号(WORLD 3・4 の入れかえ)。関係のない番号は、そのまま返す */
export function swapWorld34(id: string): string {
  const m = /^([34])-(\d+)$/.exec(id);
  if (!m) return id;
  return `${m[1] === '3' ? 4 : 3}-${m[2]}`;
}
/** 「first:3-1」のような、面の番号を含む印の付けかえ */
export function swapWorld34Key(key: string): string {
  const i = key.lastIndexOf(':');
  return i < 0 ? swapWorld34(key) : `${key.slice(0, i + 1)}${swapWorld34(key.slice(i + 1))}`;
}
