export const VIEW = { width: 720, height: 1280 };
export const FIELD = { left: 114, right: 606, top: 240, bottom: 3700 };
export const START = { x: 360, y: 3580 };
export const GOAL = { x: 360, y: 300, radius: 65 };
export const RULES = { speed: 235, radius: 14, poopRadius: 21, jumpDuration: .82, jumpHeight: 80, jumpCooldown: .24, step: 1 / 120 };
export type Point = { x: number; y: number };
export type TrapDefinition = Point & { id: string; width: number; height: number; warning: number };
const row = (y: number, gap: number): Point[] => Array.from({ length: 8 }, (_, i) => ({ x: 128 + i * 64, y })).filter(p => Math.abs(p.x - gap) > 75);
export const POOPS: Point[] = [
  ...row(3330, 256), ...row(3000, 448),
  { x: 174, y: 2700 }, { x: 200, y: 2665 },
  ...row(2470, 384), ...row(2250, 256),
  { x: 518, y: 1890 }, { x: 551, y: 1860 },
  ...row(1670, 448), ...row(1280, 384),
  ...row(700, 256),
];
// Fixed locations make every surprise learnable. Each bait gap has a safe detour.
export const TRAPS: TrapDefinition[] = [
  { id: 'first-surprise', x: 360, y: 2780, width: 176, height: 130, warning: .65 },
  { id: 'landing-surprise', x: 168, y: 2030, width: 176, height: 140, warning: .76 },
  { id: 'last-surprise', x: 296, y: 1060, width: 176, height: 150, warning: .72 },
];
export function chapter(y: number): string {
  if (y > 3070) return 'うんこをよけて、上のゴールへ。';
  if (y > 2510) return '空いている道。…あれ？';
  if (y > 1760) return '跳ぶ前に、着地点も見てみよう。';
  if (y > 850) return 'もう大丈夫？ 足元をよく見て。';
  return 'あと少し。旗のところへ！';
}
