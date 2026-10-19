import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import writeExcelFile from 'write-excel-file/universal';
import { unzipSync } from 'fflate';
import { mergeProfiles, mergeReels, bioUrl } from '../src/reel/extract.ts';
import { captionEntities } from '../src/reel/caption.ts';

/** 在测试中加载依赖少量浏览器模块的纯数据逻辑。 */
function load(path, dependencies) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, Date, require: name => dependencies[name] });
  return exports;
}

const { upsertProfile, upsertReel, withoutShares } = load('../src/reel/records.ts', { './extract': { mergeProfiles, mergeReels } });
const { exportProfileRow, exportRow, exportHeaders, exportHeadersEn } = load('../src/popup/export.ts',
  { '../reel/caption': { captionEntities }, '../reel/extract': { bioUrl } });
const author = { id: '7', username: 'creator', name: 'Creator', avatar: null, verified: false,
  biography: null, followers: 0, following: null, posts: null, private: false,
  externalUrl: null, profileUrl: 'https://www.instagram.com/creator/' };
const reel = { code: 'ABC123', url: 'https://www.instagram.com/reel/ABC123/', mediaId: null,
  publishedAt: null, authors: [author], taggedUsers: [], caption: 'Hi #travel @friend',
  videoUrl: null, coverUrl: null, plays: 0, likes: null, comments: null, reposts: null };
const legacy = { ...reel, shares: 8, savedAt: '2026-10-15T00:00:00.000Z' };
assert.equal(Object.hasOwn(withoutShares([legacy])[0], 'shares'), false);
assert.equal(withoutShares([legacy])[0].caption, reel.caption);
assert.equal(Object.hasOwn(upsertReel([legacy], reel, '2026-10-16T00:00:00.000Z')[0], 'shares'), false);
const first = upsertReel([], reel, '2026-10-16T00:00:00.000Z');
const updated = upsertReel(first, { ...reel, mediaId: '123456', plays: 5, likes: 0 }, '2026-10-16T01:00:00.000Z');
assert.equal(updated.length, 1, '后取得 reels_id 不应创建重复行');
assert.equal(updated[0].mediaId, '123456');
assert.equal(updated[0].plays, 5);
assert.equal(updated[0].likes, 0);
const profile = { ...author, bioLinks: ['https://example.com/path?a=1', 'https://other.example.org/'], joinedAt: null, basedIn: null, verifiedAt: null };
const profiles = upsertProfile([], profile, '2026-10-16T00:00:00.000Z');
const updatedProfiles = upsertProfile(profiles, { ...profile, name: null, followers: 5, bioLinks: [] }, '2026-10-16T01:00:00.000Z');
assert.equal(updatedProfiles.length, 1);
assert.equal(updatedProfiles[0].name, 'Creator');
assert.equal(updatedProfiles[0].followers, 5);
assert.equal(updatedProfiles[0].bioLinks[0], 'https://example.com/path?a=1');
const refreshedProfiles = upsertProfile(updatedProfiles, { ...profile, name: null, bioLinksComplete: true,
  bioLinks: ['https://new.example.com/'] }, '2026-10-16T02:00:00.000Z');
assert.equal(refreshedProfiles.length, 1, '重复采集同一达人仍只保留一条记录');
assert.deepEqual(refreshedProfiles[0].bioLinks, ['https://new.example.com/'], '新链接列表应替换旧列表');
assert.equal(refreshedProfiles[0].name, 'Creator', '链接更新不应清空缺失的其他资料');
const clearedProfiles = upsertProfile(refreshedProfiles, { ...profile, bioLinksComplete: true, bioLinks: [] },
  '2026-10-16T03:00:00.000Z');
assert.deepEqual(clearedProfiles[0].bioLinks, [], '当前账号删除所有链接后应清空旧列表');
const profileRow = exportProfileRow({ ...updatedProfiles[0], joinedAt: 'October 2020', basedIn: 'United States', verifiedAt: null }, 'en');
assert.equal(profileRow[3], 'creator');
assert.equal(profileRow[5], 5);
assert.deepEqual(JSON.parse(profileRow[8]), ['https://example.com/path?a=1', 'https://other.example.org/']);
assert.equal(profileRow[10], 'October 2020');
assert.equal(upsertReel(updated, { ...reel, mediaId: '123456', code: 'NEWCODE', likes: null }, '2026-10-16T02:00:00.000Z').length, 1);
const row = exportRow(updated[0]);
assert.equal(exportHeaders.length, row.length);
assert.equal(exportHeadersEn.length, row.length);
assert.equal(exportHeadersEn[24], 'Plays');
assert.equal(exportHeadersEn[27], 'Reposts');
assert.equal(exportRow(updated[0], 'en')[8], 'No');
assert.equal(row[0], '123456');
assert.equal(row[20], 'friend');
assert.equal(row[24], 5);
assert.equal(row[25], 0);
assert.equal(row[26], null);
assert.equal(row[28] instanceof Date, true);
assert.equal(exportHeaders.includes('分享数'), false);
const blob = await writeExcelFile([Array.from(exportHeaders), Array.from(row)], {
  sheet: 'Reels', dateFormat: 'yyyy-mm-dd hh:mm:ss',
}).toBlob();
const buffer = new Uint8Array(await blob.arrayBuffer());
assert.equal(Buffer.from(buffer.subarray(0, 2)).toString(), 'PK', '导出内容应为 XLSX ZIP 文件');
const files = unzipSync(buffer);
const sheet = new TextDecoder().decode(files['xl/worksheets/sheet1.xml']);
const strings = new TextDecoder().decode(files['xl/sharedStrings.xml']);
assert.match(strings, /123456/);
assert.match(sheet, /<v>5<\/v>/);
const englishBlob = await writeExcelFile([Array.from(exportHeadersEn), Array.from(exportRow(updated[0], 'en'))],
  { sheet: 'Reels', dateFormat: 'yyyy-mm-dd hh:mm:ss' }).toBlob();
const englishFiles = unzipSync(new Uint8Array(await englishBlob.arrayBuffer()));
assert.match(new TextDecoder().decode(englishFiles['xl/sharedStrings.xml']), /Publisher username/);
console.log('Saved Reel upsert and Excel field mapping checks passed');

assert.equal(exportProfileRow({ ...profiles[0], category: 'Artist' })[15], 'Artist');
assert.equal(exportProfileRow(profiles[0])[15], '');
assert.equal(upsertProfile([], { ...profile, category: 'Artist' }, '2026-10-16T00:00:00.000Z')[0].category, 'Artist');

const sponsor = { ...author, username: 'brand', profileUrl: 'https://www.instagram.com/brand/' };
const sponsored = upsertReel(updated, { ...reel, sponsors: [sponsor] }, '2026-10-16T04:00:00.000Z');
assert.equal(sponsored[0].sponsors[0].username, 'brand');
assert.equal(JSON.parse(exportRow(sponsored[0])[29])[0].username, 'brand');
assert.equal(exportHeaders[29], '赞助方资料');
assert.equal(exportHeadersEn[29], 'Sponsors JSON');
assert.equal(exportRow(reel)[29], '[]');
