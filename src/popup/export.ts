import { captionEntities } from '../reel/caption';
import type { SavedProfile, SavedReel } from '../reel/records';
import type { Language } from '../reel/i18n';

/** 将当前采集字段映射为一条 Excel 数据行，保留零值和完整账号资料。 */
export function exportRow(reel: SavedReel, language: Language = 'zh'): (string | number | Date | null)[] {
  const author = reel.authors[0];
  const caption = captionEntities(reel.caption ?? '');
  const yes = language === 'en' ? 'Yes' : '是';
  const no = language === 'en' ? 'No' : '否';
  return [
    reel.mediaId ?? reel.code, reel.code, reel.url, reel.publishedAt ? new Date(reel.publishedAt) : null,
    author?.id ?? null, author?.username ?? null, author?.name ?? null,
    author?.avatar ?? null, author?.verified === null || author?.verified === undefined ? null : author.verified ? yes : no,
    author?.biography ?? null, author?.followers ?? null, author?.following ?? null,
    author?.posts ?? null, author?.private === null || author?.private === undefined ? null : author.private ? yes : no,
    author?.externalUrl ?? null, author?.profileUrl ?? null,
    JSON.stringify(reel.authors.slice(1)), JSON.stringify(reel.taggedUsers ?? []),
    reel.caption, caption.tags.join(', '), caption.mentions.join(', '), caption.links.join(', '),
    reel.videoUrl, reel.coverUrl, reel.plays, reel.likes, reel.comments, reel.reposts,
    new Date(reel.savedAt),
  ];
}

export const exportHeaders = [
  'reels_id', 'shortcode', 'Reel 原页', '发布时间 (UTC)', '发布者 ID', '发布者用户名', '发布者名称',
  '发布者头像', '发布者已认证', '发布者简介', '粉丝数', '关注数', '帖子数', '私密账号',
  '作者链接', '作者主页', '合作者资料', '标记用户资料', 'Caption', 'Tags', '提及的人',
  '文案链接', '视频原地址', '视频封面', '播放量', '赞数', '评论数', '转发数',
  '最近采集时间 (UTC)',
];

export const exportHeadersEn = [
  'reels_id', 'shortcode', 'Reel URL', 'Published at (UTC)', 'Publisher ID', 'Publisher username', 'Publisher name',
  'Publisher avatar', 'Publisher verified', 'Publisher bio', 'Followers', 'Following', 'Posts', 'Private account',
  'Author link', 'Author profile', 'Collaborators JSON', 'Tagged users JSON', 'Caption', 'Tags', 'Mentions',
  'Caption links', 'Video URL', 'Video cover', 'Plays', 'Likes', 'Comments', 'Reposts',
  'Last collected at (UTC)',
];

/** 将一条达人记录映射为 Excel 的独立字段。 */
export function exportProfileRow(profile: SavedProfile, language: Language = 'zh'): (string | number | Date | null)[] {
  return [
    profile.avatar, profile.name, profile.id, profile.username, profile.posts, profile.followers,
    profile.following, profile.biography, JSON.stringify(profile.bioLinks),
    profile.verified === null ? null : profile.verified ? language === 'en' ? 'Yes' : '是' : language === 'en' ? 'No' : '否',
    profile.joinedAt, profile.basedIn, profile.verifiedAt, profile.profileUrl, new Date(profile.savedAt),
  ];
}

/** 将已保存记录导出为真正的 XLSX 文件。 */
export async function downloadExcel(records: SavedReel[], language: Language = 'zh'): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const headers = language === 'en' ? exportHeadersEn : exportHeaders;
  const rows = [headers.map(header => ({ value: header, fontWeight: 'bold' as const })),
    ...records.map(reel => exportRow(reel, language))];
  const blob = await writeExcelFile(rows, {
    sheet: 'Reels', stickyRowsCount: 1, dateFormat: 'yyyy-mm-dd hh:mm:ss',
    columns: headers.map(header => ({ width: Math.min(38, Math.max(16, header.length * 2 + 4)) })),
  }).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `instagram-reels-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** 将达人资料按独立列导出，缺失字段保持为空单元格。 */
export async function downloadProfilesExcel(records: SavedProfile[], language: Language = 'zh'): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/universal');
  const headers = language === 'en' ? ['Avatar', 'Name', 'Instagram ID', 'Username', 'Posts', 'Followers', 'Following', 'Bio', 'Bio links', 'Verified', 'Date joined', 'Account based in', 'Date verified', 'Profile URL', 'Last collected at (UTC)'] :
    ['头像', '昵称', 'ins id', 'username', '帖子数', '粉丝数', '关注数', 'bio', 'bio 里的链接', '是否认证', '加入时间', '账户所在地', '认证时间', '达人主页', '最近采集时间 (UTC)'];
  const rows = [headers.map(header => ({ value: header, fontWeight: 'bold' as const })),
    ...records.map(profile => exportProfileRow(profile, language))];
  const blob = await writeExcelFile(rows, {
    sheet: 'Profiles', stickyRowsCount: 1, dateFormat: 'yyyy-mm-dd hh:mm:ss',
    columns: headers.map(header => ({ width: Math.min(38, Math.max(16, header.length * 2 + 4)) })),
  }).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `instagram-profiles-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
