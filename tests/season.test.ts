import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS, currentSeason, seasonOf } from '../src/season.ts';

test('季節: 3〜5月=春、6〜8月=夏、9〜11月=秋、12〜2月=冬', () => {
  const at = (m: number) => seasonOf(new Date(2026, m - 1, 15));
  assert.deepEqual([1, 2, 3, 5, 6, 8, 9, 11, 12].map(at), ['winter', 'winter', 'spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter']);
});

test('季節: せっていで 選んだ季節が 日付より 先', () => {
  const nov = new Date(2026, 10, 21);
  assert.equal(currentSeason(nov, 'auto').key, 'autumn');
  assert.equal(currentSeason(nov, 'winter').key, 'winter');
});

test('季節: どの季節にも 名所の絵と ひとことが ある', () => {
  for (const s of Object.values(SEASONS)) {
    assert.ok(s.far.endsWith('.webp') && s.farW > 0 && s.farW <= 100, s.key);
    assert.ok(s.lines.length >= 2, s.key);
  }
});
