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
/**
 * せんべいを狙う鹿。sense 以内にせんべい（持っているSpru、または置いたせんべい）が来ると走り出し、
 * Spruに触れると取られる。sense が 0 なら、その場から動かない（触れると取られる、見分けるための別の鹿）。
 */
export type ThiefDefinition = {
  id: string; kind: 'stag' | 'doe' | 'fawn'; x: number; y: number;
  sense: number; speed: number;
};
/** ステージ2の面。ボタンは「ジャンプ」でなく「せんべいを置く」になり、ゴールは「届け先の鹿」になる。 */
export type DeliveryDefinition = {
  baits: number; // 置けるせんべいの数
  targetKind: 'stag' | 'doe' | 'fawn';
  mark?: boolean; // 届け先の鹿に目印を出す
  thieves: ThiefDefinition[];
  eat?: number; // 置いたせんべいを食べる時間（秒、既定2.6）
};
/** ステージ3（大掃除）。ボタンで、まわり radius 内のうんこを掃く。うんこが limit 個以上になると失敗。動ける範囲は arena。 */
/** ステージ3（大掃除）。うんこに触れる（radius以内）と、自動で掃ける。通り過ぎて残したうんこが limit 個になると失敗。 */
export type SweepDefinition = { limit: number; radius: number };
/** ステージ4（横断）。道を横切る動物。速さの符号が向き。画面の外で折り返して、同じ道をぐるぐる回る（時間だけで決まる）。 */
export type CrosserDefinition = { id: string; kind: 'stag' | 'doe' | 'fawn'; y: number; x0: number; speed: number };
export type CrossDefinition = { crossers: CrosserDefinition[] };
/** ステージ5（救出）。迷子の鹿は、found 以内に近づくとついてくる。連れている鹿が危険に当たると失敗。 */
export type RescueDefinition = { kind: 'stag' | 'doe' | 'fawn'; x: number; y: number; found: number; lag: number };

// ---- WORLD 1 の作り直し(設計書 28章): 道の形・池・コイン ----
/** 通れないもの(植え込み・灯籠の列・岩)。道の形(曲がる道・分かれ道・行き止まり)を作る。跳んでも越えられない。 */
export type HedgeDefinition = { x: number; y: number; w: number; h: number; look?: 'hedge' | 'lantern' | 'rock' };
/** 池。着地していると落ちる(飛び石・はすの葉の上は大丈夫)。 */
export type PondDefinition = { x: number; y: number; w: number; h: number };
/**
 * 池の飛び石・はすの葉。r=乗れる半径。
 * sink: 乗ってからこの秒数で沈む(しばらくすると、また浮く)。move: 左右へゆっくり動く(乗っていると運ばれる)。
 */
export type StoneDefinition = { id: string; x: number; y: number; r: number; sink?: number; move?: { dx: number; period: number }; lily?: boolean };
/** コイン。kind が無ければシルバー。air=高い所にあり、跳ばないと取れない。 */
export type CoinDefinition = { x: number; y: number; kind?: 'gold' | 'premium'; air?: boolean };
