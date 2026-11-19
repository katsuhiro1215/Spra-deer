// WORLD 2: お店を手伝う なかま(2-5 から)。Spra の横に 正面の立ち絵を出し、手伝ったときに ひとこと(焼く・積む・配る 共通)。
import { FRIENDS } from '../sweep/levels.ts';
import type { FriendId } from './levels.ts';

/** 手伝いの 中身(はじめの画面の「あそびかた」に足す) */
export const HELPER_TEXT: Partial<Record<FriendId, string>> = {
  lumi: 'Lumi が 金色の時間を 光で のばしてくれる',
  ruru: 'Ruru が 焦げそうな 鉄板に 水を かけてくれる',
  kuru: 'Kuru が 左から来る くいしんぼう鹿を 通せんぼ',
  momo: 'Momo が いると、鹿が 長く 待ってくれる',
  piko: 'Piko が 風を やわらげてくれる',
};

export function mountHelpers(root: HTMLElement, helpers: FriendId[] | undefined) {
  const box = root.querySelector<HTMLElement>('[data-ks="helpers"]');
  const els = new Map<FriendId, HTMLElement>();
  if (box) {
    box.replaceChildren();
    for (const id of helpers ?? []) {
      if (id === 'spra') continue;
      const el = document.createElement('div');
      el.className = 'bk-helper';
      el.dataset.id = id;
      el.innerHTML = `<img src="/assets/bake/friends/${id}.png" alt="${FRIENDS[id].name}"><span class="bk-helper-say"></span><small>${FRIENDS[id].name}</small>`;
      box.append(el);
      els.set(id, el);
    }
  }
  const timers = new Map<FriendId, number>();
  /** 手伝ったときの ひとこと(ぴょんと はねる) */
  const say = (id: FriendId, text: string, ms = 1400) => {
    const el = els.get(id);
    if (!el) return;
    const s = el.querySelector<HTMLElement>('.bk-helper-say')!;
    s.textContent = text;
    el.classList.remove('jump'); void el.offsetWidth; el.classList.add('jump', 'saying');
    window.clearTimeout(timers.get(id));
    timers.set(id, window.setTimeout(() => el.classList.remove('saying'), ms));
  };
  return { say, dispose: () => { for (const t of timers.values()) window.clearTimeout(t); box?.replaceChildren(); } };
}
