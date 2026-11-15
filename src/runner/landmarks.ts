// scripts/build-landmarks.py が作る。名所・アイテムの絵(public/assets/runner/landmarks/<名前>.webp)の縦横比。
// 手で書きかえない(絵を差しかえたら、スクリプトを流し直す)。
export const LANDMARK_ASPECT: Record<string, number> = {
  'todaiji-hall': 1.6425,
  'nandaimon': 1.5662,
  'kofukuji-pagoda': 0.5742,
  'yakushiji-pagoda': 0.5389,
  'toshodaiji-hall': 2.0504,
  'horyuji': 1.5550,
  'omiwa-snow': 0.8782,
  'zaodo': 1.5398,
  'koriyama-castle': 1.5492,
  'suzakumon': 1.9655,
  'potion': 0.6293,
  'sakura-tree': 0.8086,
  'maple-tree': 0.7805,
  'ikoma': 3.3755,
  'osaka-skyline': 3.1434,
  'fake-senbei': 0.9956,
  'kasuga': 2.0260,
  'osaka-bay': 2.9985,
  'train': 3.9882,
};
