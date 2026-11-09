export const VIEW = { width: 720, height: 1280 };
export const FIELD = { left: 114, right: 606, top: 240, bottom: 3700 };
export const GOAL = { x: 360, y: 300, radius: 65 };
export const RULES = { speed: 235, radius: 14, poopRadius: 21, jumpDuration: .82, jumpHeight: 80, jumpCooldown: .24, step: 1 / 120 };
export type Point = { x: number; y: number };
/**
 * 崩れる床。
 * - trigger 'near': 近づくと（warning 秒後に）穴になる。
 * - trigger 'land': ジャンプの着地点が近い（landReach 以内）と、すぐ穴になる。
 * - silent: true なら、ひび・揺れ・「ミシッ」を出さない（床は普通の道に見える）。
 */
export type TrapDefinition = Point & {
  id: string; width: number; height: number; warning: number;
  trigger?: 'near' | 'land'; silent?: boolean; landReach?: number;
};
/** 道をふさぐ壁（横から突然出てくる）。player が triggerY より奥へ来ると動く。 */
export type WallDefinition = {
  id: string; side: 'l' | 'r';
  y: number; thickness: number; // 壁の中心の高さと、奥行き
  triggerY: number; // プレイヤーのYがこれ以下になったら出てくる
  speed: number; hold: number; // 出てくる速さ(px/s)と、閉じたまま止まる時間(秒)
};
/** ジャンプすると、着地点へ向かって動いてくるうんこ。 */
export type SliderDefinition = {
  id: string; x: number; y: number; toX: number; toY: number;
  within: number; // この距離以内でジャンプすると動き出す
  speed: number;
};
