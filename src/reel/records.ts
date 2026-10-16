import { mergeProfiles, mergeReels } from './extract';
import type { Profile, Reel } from './types';

export type SavedReel = Reel & { savedAt: string };
export type SavedProfile = Profile & { savedAt: string };

/** 按用户名更新达人记录，替换完整 bio 链接列表并保留缺失的其他资料。 */
export function upsertProfile(records: SavedProfile[], incoming: Profile, savedAt: string): SavedProfile[] {
  const previous = records.find(row => row.username.toLowerCase() === incoming.username.toLowerCase());
  const merged = mergeProfiles(previous, incoming);
  return [{ ...merged, savedAt }, ...records.filter(row => row.username.toLowerCase() !== incoming.username.toLowerCase())];
}

/** 清理旧版记录中的分享字段，保留其他已采集数据。 */
export function withoutShares(records: SavedReel[]): SavedReel[] {
  return records.map(row => {
    if (!row || typeof row !== 'object' || !Object.prototype.hasOwnProperty.call(row, 'shares')) return row;
    const clean = { ...row } as SavedReel & { shares?: unknown };
    delete clean.shares;
    return clean;
  });
}

/** 按视频 ID 或 shortcode 合并记录，缺失的视频 ID 用 shortcode 保持同一行。 */
export function upsertReel(records: SavedReel[], incoming: Reel, savedAt: string): SavedReel[] {
  const matches = records.filter(row => row.code === incoming.code ||
    (incoming.mediaId !== null && row.mediaId === incoming.mediaId));
  const merged = matches.reduce<Reel | undefined>((result, row) => mergeReels(result, row), undefined);
  const next = { ...mergeReels(merged, incoming), savedAt };
  return withoutShares([next, ...records.filter(row => !matches.includes(row))]);
}
