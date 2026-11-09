export const VIEW = { width: 720, height: 1280 };
export const FIELD = { left: 114, right: 606, top: 240, bottom: 3700 };
export const GOAL = { x: 360, y: 300, radius: 65 };
export const RULES = { speed: 235, radius: 14, poopRadius: 21, jumpDuration: .82, jumpHeight: 80, jumpCooldown: .24, step: 1 / 120 };
export type Point = { x: number; y: number };
/**
 * 崩れる床。
 * - trigger 'near': 近づくと（warning 秒後に）穴になる。
 * - trigger 'land': ジャンプの着地点が近い（landReach 以内）と、すぐ穴になる。
 * - trigger 'y': プレイヤーが triggerY より奥へ来ると穴になる（ゴール直前の大穴など）。
 * - trigger 'goal': ゴールが動き出すと穴になる。
 * - silent: true なら、ひび・揺れ・「ミシッ」を出さない（床は普通の道に見える）。
 */
export type TrapDefinition = Point & {
  id: string; width: number; height: number; warning: number;
  trigger?: 'near' | 'land' | 'y' | 'goal'; silent?: boolean; landReach?: number; triggerY?: number;
};
/** ゴール。moveTo があると、プレイヤーが within 以内に近づいたとき、そちらへ逃げる。 */
export type GoalDefinition = { x: number; y: number; moveTo?: { x: number; y: number; within: number; speed: number } };
/** 道をふさぐ壁（横から突然出てくる）。player が triggerY より奥へ来ると動く。 */
export type WallDefinition = {
  id: string; side: 'l' | 'r';
  y: number; thickness: number; // 壁の中心の高さと、奥行き
  triggerY: number; // プレイヤーのYがこれ以下になったら出てくる
  speed: number; hold: number; // 出てくる速さ(px/s)と、閉じたまま止まる時間(秒)
  length?: number; // 壁の長さ（既定は道をふさぐ560）。左右から来て、真ん中で合わさる壁は短くする
};
/** 追いかけてくる鹿。player が triggerY より奥へ来ると走り出し、触れるとつかまる（ジャンプ中は越えられる）。 */
export type ChaserDefinition = {
  id: string; kind: 'stag' | 'doe' | 'fawn';
  x: number; y: number; // 最初にいる場所（画面の下のほう）
  triggerY: number; speed: number;
};
/**
 * 上から降ってくるうんこ。player が triggerY より奥へ来て delay 秒後に、落ちる場所へ影が出て、warn 秒後に落ちる。
 * aim: 'player' なら、影が出た瞬間のプレイヤーの位置に落ちる（動き続ければ当たらない）。
 */
export type RainDefinition = {
  id: string; triggerY: number; delay: number; warn: number;
  x?: number; y?: number; aim?: 'player';
};
/** ジャンプすると、着地点へ向かって動いてくるうんこ。 */
export type SliderDefinition = {
  id: string; x: number; y: number; toX: number; toY: number;
  within: number; // この距離以内で（trigger に応じて）動き出す
  speed: number;
  trigger?: 'jump' | 'near'; // 'jump'=ジャンプしたとき（既定）, 'near'=近づいただけで
};
