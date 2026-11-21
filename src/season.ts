// ホームの季節(着せ替え)。日付で自動に変わる。せっていで、好きな季節に固定もできる(この端末に保存)。
// 季節ごとの Spra の衣装の絵ができたら、SEASONS の spra に入れる(無いあいだは ふだんの Spra)。

export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter';
export type SeasonPick = SeasonKey | 'auto';

export type Season = {
  key: SeasonKey;
  label: string;
  /** 空の色(上・下)と、丘の色 */
  sky: [string, string]; hill: [string, string];
  /** 奥に見える 奈良の名所と、その横はば(画面の横の %。縦長の絵は 小さめ) */
  far: string; farW: number;
  /** 手前の左右の木(無ければ なし) */
  tree?: string;
  /** 降ってくるもの */
  fall: 'petal' | 'spark' | 'leaf' | 'snow';
  /** 季節の衣装の Spra(無ければ ふだんの絵) */
  spra?: string;
  /** Spra の ひとこと */
  lines: string[];
};

const L = '/assets/runner/landmarks';
export const SEASONS: Record<SeasonKey, Season> = {
  spring: {
    key: 'spring', label: '春', sky: ['#bfe3fb', '#fdeef3'], hill: ['#a9d98a', '#86c26a'],
    far: `${L}/kofukuji-pagoda.webp`, farW: 38, tree: `${L}/sakura-tree.webp`, fall: 'petal',
    lines: ['桜が きれいだね！', '春の 奈良公園へ 行こう！', '子鹿が 生まれる 季節だよ'],
  },
  summer: {
    key: 'summer', label: '夏', sky: ['#5fb8f0', '#d8f2ff'], hill: ['#7cc75a', '#55a843'],
    far: `${L}/kasuga.webp`, farW: 80, fall: 'spark',
    lines: ['あついね〜。木かげで ひと休み', '夏の 燈花会、行ってみたいな', 'せんべい、とけないかな？'],
  },
  autumn: {
    key: 'autumn', label: '秋', sky: ['#f6c48e', '#fdebd0'], hill: ['#d6b26a', '#b98f4c'],
    far: `${L}/todaiji-hall.webp`, farW: 74, tree: `${L}/maple-tree.webp`, fall: 'leaf',
    lines: ['紅葉が まっかだね！', '鹿の 角きりの 季節だよ', 'どの ワールドで あそぶ？'],
  },
  winter: {
    key: 'winter', label: '冬', sky: ['#c9dcef', '#f3f8fc'], hill: ['#f4f8fb', '#dde8f1'],
    far: `${L}/omiwa-snow.webp`, farW: 68, fall: 'snow',
    lines: ['雪だ！ 鹿も もこもこ', 'さむいね。いっしょに 走ろう！', '雪の 奈良も すてきだよ'],
  },
};

/** 日付から季節(3〜5月=春、6〜8月=夏、9〜11月=秋、12〜2月=冬) */
export function seasonOf(date: Date): SeasonKey {
  const m = date.getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

const KEY = 'spra-deer:season:v1';
export function loadSeasonPick(): SeasonPick {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'spring' || v === 'summer' || v === 'autumn' || v === 'winter' ? v : 'auto';
  } catch { return 'auto'; }
}
export function saveSeasonPick(p: SeasonPick): void {
  try { if (p === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* 保存できない環境 */ }
}
/** いまの季節(せっていで選んでいれば、それ) */
export function currentSeason(date = new Date(), pick: SeasonPick = loadSeasonPick()): Season {
  return SEASONS[pick === 'auto' ? seasonOf(date) : pick];
}
