/** Spraの向き。dr=右下, dl=左下, ur=右上, ul=左上（下=画面の手前、上=奥）。 */
export type Facing = 'down' | 'up' | 'dr' | 'dl' | 'ur' | 'ul';

/**
 * 入力の向きを60度ずつ6つの領域に分けて、表示する向きを決める。
 * 画面座標（yが下向き）。真下・真上は90度ずつの中心、斜めは30度・150度などが中心。
 * 真横は領域の境目になるため、手前側（下向き）の斜めを選ぶ。
 */
export function facingOf(dx: number, dy: number): Facing {
  const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360; // 0=右, 90=下, 180=左, 270=上
  if (angle < 60) return 'dr';
  if (angle < 120) return 'down';
  if (angle <= 180) return 'dl';
  if (angle < 240) return 'ul';
  if (angle < 300) return 'up';
  return 'ur';
}
