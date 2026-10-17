import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { authorFrom, profileFrom } from '../src/reel/extract.ts';
import { profileUsername } from '../src/reel/profile-url.ts';

const source = readFileSync(new URL('../src/content/page.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const metadata = new Map([
  ['meta[property="og:url"]', 'https://www.instagram.com/meninblazers/reel/DZaNr7gtNEI/'],
  ['meta[property="instapp:owner_user_id"]', '1381910194'],
  ['meta[name="twitter:title"]', 'Men in Blazers (@meninblazers) • Instagram reel'],
  ['meta[property="og:description"]', 'meninblazers on June 10, 2026: "LINDSEY HEAPS IS A TRUE CAPTAIN 🇺🇸\nThanks @bankofamerica". '],
  ['meta[name="description"]', '2,015 likes, 9 comments - meninblazers on June 10, 2026'],
  ['meta[property="og:image"]', 'https://example.com/cover.jpg'],
  ['meta[property="al:ios:url"]', 'instagram://media?id=3916503019393700104'],
]);
const location = { href: 'https://www.instagram.com/reels/DZaNr7gtNEI/', hostname: 'www.instagram.com', pathname: '/reels/DZaNr7gtNEI/' };
const buttons = [];
const videos = [];
let profileMain = null;
let profileHeader = null;
const document = {
  /** 模拟未渲染 article 的页面，只提供 Reel 的公开元信息。 */
  querySelector(selector) { return selector === 'main' ? profileMain : selector === 'main header' ? profileHeader : selector === 'img[alt^="ujual"]' ? { src: 'https://example.com/avatar.jpg' } : metadata.has(selector) ? { content: metadata.get(selector) } : null; },
  /** 模拟视频节点尚未出现，但地址已经是 Reel。 */
  querySelectorAll(selector) {
    if (selector === 'video') return videos;
    if (selector.startsWith('main button')) return buttons;
    return [];
  },
};
const context = {
  exports: {}, document, location, URL, innerHeight: 900,
  /** 使用真实作者解析逻辑验证页面元信息兜底。 */
  require(name) {
    if (name === '../reel/extract') return { authorFrom, profileFrom };
    if (name === '../reel/profile-url') return { profileUsername };
    throw new Error(`Unexpected import: ${name}`);
  },
};
runInNewContext(compiled, context);
const active = context.exports.readActiveReel();
assert.equal(active.reel.authors[0].username, 'meninblazers');
assert.equal(active.reel.authors[0].name, 'Men in Blazers');
assert.equal(active.reel.authors[0].id, '1381910194');
assert.equal(active.reel.caption, 'LINDSEY HEAPS IS A TRUE CAPTAIN 🇺🇸\nThanks @bankofamerica');
assert.equal(active.reel.coverUrl, 'https://example.com/cover.jpg');
assert.equal(active.reel.mediaId, '3916503019393700104');
assert.equal(active.reel.publishedAt, null);
assert.equal(Object.hasOwn(active.reel, 'shares'), false);
assert.equal(active.reel.reposts, null);
assert.equal(active.reel.likes, 2015);
assert.equal(active.reel.comments, 9);

videos.push({
  parentElement: null, currentSrc: '', src: '', poster: '',
  /** 模拟当前可见的视频位置。 */
  getBoundingClientRect() { return { top: 0, bottom: 500, width: 300, height: 500 }; },
  /** 当前页面没有 article 容器时仍应能读取计数。 */
  closest() { return null; },
  /** 模拟视频节点不含标记控件。 */
  querySelectorAll() { return []; },
});
buttons.push({
  textContent: '42',
  /** 模拟当前视频旁的转发按钮。 */
  getBoundingClientRect() { return { top: 300, bottom: 340, width: 40, height: 40 }; },
  /** 提供页面显示的按钮名称。 */
  getAttribute(name) { return name === 'aria-label' ? '转发' : null; },
  /** 按钮名称已在自身属性中，无需查找图标。 */
  querySelector() { return null; },
});
assert.equal(context.exports.readActiveReel().reel.reposts, 42);
let playButtonTop = 600;
buttons.push({
  textContent: '1,234',
  /** 模拟相邻视频的播放按钮，稍后移入当前视频区域。 */
  getBoundingClientRect() { return { top: playButtonTop, bottom: playButtonTop + 40, width: 40, height: 40 }; },
  /** 提供播放量按钮名称。 */
  getAttribute(name) { return name === 'aria-label' ? '播放量' : null; },
  /** 按钮名称已在自身属性中，无需查找图标。 */
  querySelector() { return null; },
});
assert.equal(context.exports.readActiveReel().reel.plays, null);
playButtonTop = 300;
assert.equal(context.exports.readActiveReel().reel.plays, 1234);

const markedLink = {
  textContent: 'marked.user',
  /** 模拟 Instagram 标记控件的辅助名称。 */
  getAttribute(name) { return name === 'aria-label' ? '标记的用户 marked.user' : null; },
  /** 名称已在控件自身，无需查找子元素。 */
  querySelector() { return null; },
};
const mentionLink = {
  textContent: '@caption.only',
  /** caption 提及不带标记控件名称。 */
  getAttribute() { return null; },
  /** caption 提及没有标记图标。 */
  querySelector() { return null; },
};
const plainLabelLink = {
  textContent: '标记的用户 another.user',
  /** 普通辅助名称不能被当作标记用户名。 */
  getAttribute(name) { return name === 'aria-label' ? 'Open' : null; },
  /** 名称已在控件自身。 */
  querySelector() { return null; },
};
const reelRoot = {
  /** 其余页面资料仍由 meta 兜底。 */
  querySelector() { return null; },
  /** 只返回当前视频区域内的标记控件及 caption 提及。 */
  querySelectorAll() { return [markedLink, mentionLink, plainLabelLink]; },
};
/** 将当前视频关联到自己的区域，避免读取相邻 Reel。 */
videos[0].closest = () => reelRoot;
assert.equal(context.exports.readActiveReel().reel.taggedUsers.map(user => user.username).join(','), 'marked.user,another.user');

const adjacentLink = {
  textContent: 'adjacent.user',
  /** 相邻视频也有标记控件，但不属于当前视频。 */
  getAttribute(name) { return name === 'aria-label' ? '标记的用户 adjacent.user' : null; },
  /** 名称已在控件自身。 */
  querySelector() { return null; },
};
const outer = {
  parentElement: null, tagName: 'DIV',
  /** 两条视频的共同容器，不能作为当前视频范围。 */
  querySelectorAll(selector) { return selector === 'video' ? [videos[0], {}] : [markedLink, adjacentLink]; },
  /** 相邻 Reel 的链接不能用于判断当前视频。 */
  querySelector() { return { href: 'https://www.instagram.com/reel/ADJACENT/' }; },
};
const currentContainer = {
  parentElement: outer, tagName: 'DIV',
  /** 当前容器只包含一条视频及其标记控件。 */
  querySelectorAll(selector) { return selector === 'video' ? [videos[0]] : [markedLink]; },
  /** 没有 Reel 链接可供旧版页面兜底。 */
  querySelector() { return null; },
};
/** 模拟没有 article 的 Reels 信息流。 */
videos[0].closest = () => null;
videos[0].parentElement = currentContainer;
assert.equal(context.exports.readActiveReel().reel.taggedUsers.map(user => user.username).join(','), 'marked.user');

location.href = 'https://www.instagram.com/reels/NEWCODE/';
/** 即使旧视频还显示着作者，也不能把其标记用户归到新地址。 */
videos[0].closest = () => ({
  querySelector(selector) {
    return selector.startsWith('header a') ? { getAttribute: () => '/old.author/' } : null;
  },
  querySelectorAll: () => [markedLink],
});
assert.equal(context.exports.readActiveReel().reel, null);
metadata.set('meta[property="og:url"]', 'https://www.instagram.com/new.author/reel/NEWCODE/');
/** 即使 meta 已切到新视频，旧视频自己的链接仍能阻止串数据。 */
currentContainer.querySelector = () => ({ href: 'https://www.instagram.com/reel/DZaNr7gtNEI/' });
assert.equal(context.exports.readActiveReel().code, 'DZaNr7gtNEI', '推荐页优先确认仍在视口中的视频，不能套用新地址的编号');
assert.equal(context.exports.readActiveReel().reel.mediaId, null, '地址与视频不一致时不能读取该地址的元信息');

/** 模拟用户主页中已加载的 Reel 网格链接及封面。 */
function gridLink(href, cover) {
  return { href, textContent: href.includes('ONE123') ? '5,946' : '1万', querySelector: () => cover ? { src: cover, currentSrc: cover } : null };
}
location.href = 'https://www.instagram.com/ujual/reels/';
location.pathname = '/ujual/reels/';
profileMain = {
  /** 提供主页头像。 */
  querySelector: () => null,
  /** 混入别人的 Reel 与外站链接，验证它们不会被采集。 */
  querySelectorAll: () => [
    gridLink('https://www.instagram.com/ujual/reel/ONE123/', 'https://example.com/one.jpg'),
    gridLink('https://www.instagram.com/ujual/reel/TWO456/', 'https://example.com/two.jpg'),
    gridLink('https://www.instagram.com/other/reel/WRONG/', 'https://example.com/wrong.jpg'),
    gridLink('https://example.com/ujual/reel/REMOTE/', 'https://example.com/remote.jpg'),
  ],
};
const profileReels = context.exports.readProfileReels();
assert.equal(profileReels.length, 2);
assert.equal(profileReels[0].code, 'ONE123');
assert.equal(profileReels[0].authors[0].username, 'ujual');
assert.equal(profileReels[0].authors[0].avatar, 'https://example.com/avatar.jpg');
assert.equal(profileReels[0].coverUrl, 'https://example.com/one.jpg');
assert.equal(profileReels[0].mediaId, null);
assert.equal(profileReels[0].plays, 5946);
assert.equal(profileReels[1].plays, null, '缩写播放量不应反推精确数字');
assert.equal(context.exports.readActiveReel(), null, '主页网格预览不应冒充详情视频');
profileHeader = {
  /** 同一页面内导航后只允许匹配当前用户名的头部。 */
  querySelectorAll(selector) { return selector === 'h1, h2, a' ? [{ textContent: 'ujual' }] : []; },
  /** 未加载的计数与简介保持空值。 */
  querySelector() { return null; },
};
assert.equal(context.exports.readProfilePage().username, 'ujual');
assert.equal(context.exports.readProfilePage().bioLinksComplete, false, '主页 DOM 未显示的链接不能当作已确认完整的空列表');
location.href = 'https://www.instagram.com/other/';
location.pathname = '/other/';
assert.equal(context.exports.readProfilePage(), null, '旧的主页头部不能保存为新达人');
console.log('Reel page metadata checks passed');

let nextScrolls = 0;
let containerScrolls = 0;
const feedContainer = {
  scrollHeight: 2400, clientHeight: 900, parentElement: null,
  /** 记录推荐页容器的滚动距离。 */ scrollBy(options) { assert.equal(options.top, 900); containerScrolls++; },
};
const feedVideo = {
  parentElement: feedContainer,
  /** 当前视频占据主要视口。 */ getBoundingClientRect() { return { top: 0, bottom: 800, height: 800, width: 450 }; },
};
const nextVideo = {
  /** 下一条视频已预加载但尚未进入视口。 */ getBoundingClientRect() { return { top: 900, bottom: 1700, height: 800, width: 450 }; },
  /** 浏览时必须定位到下一条视频的中央。 */ scrollIntoView(options) { assert.equal(options.block, 'center'); nextScrolls++; },
};
videos.splice(0, videos.length, feedVideo, nextVideo);
location.pathname = '/reels/';
assert.equal(context.exports.advanceFeedReel(), true);
assert.equal(nextScrolls, 1);
assert.equal(containerScrolls, 0);
videos.pop();
assert.equal(context.exports.advanceFeedReel(), true);
assert.equal(containerScrolls, 1, '没有预加载视频时只滚动所属容器');
location.pathname = '/creator/reels/';
assert.equal(context.exports.advanceFeedReel(), false, '达人列表不能被自动浏览');
location.pathname = '/reel/DETAIL/';
assert.equal(context.exports.advanceFeedReel(), false, '单条详情不能被自动浏览');
location.pathname = '/reels/';
videos.length = 0;
assert.equal(context.exports.advanceFeedReel(), false, '没有当前视频不能盲目滚动');

// 滚动到下一条时 URL 和 meta 保留旧值，仍应从无 article 的当前视频容器识别新作者。
location.pathname = '/reels/OLDCODE/';
location.href = 'https://www.instagram.com/reels/OLDCODE/';
metadata.set('meta[property="og:url"]', location.href);
let visibleCode = 'NEWCODE';
let visibleAuthor = 'new.creator';
const scope = {
  tagName: 'DIV', parentElement: { tagName: 'MAIN' },
  /** 单条视频容器不能跨到相邻推荐视频。 */ querySelectorAll(selector) { return selector === 'video' ? [visibleVideo] : []; },
  /** 同时验证推荐页使用复数 reels 链接的情况。 */ querySelector(selector) {
    if (selector === 'a[href*="/reels/"]') return { href: `https://www.instagram.com/reels/${visibleCode}/` };
    if (selector === 'header a[href^="/"]') return { getAttribute: () => `/${visibleAuthor}/` };
    return null;
  },
};
const visibleVideo = {
  parentElement: scope,
  /** 推荐页没有 article 元素。 */ closest() { return null; },
  /** 已滚动到视口中央。 */ getBoundingClientRect() { return { top: 0, bottom: 800, height: 800, width: 450 }; },
};
videos.push(visibleVideo);
assert.equal(context.exports.readActiveReel().code, 'NEWCODE');
assert.equal(context.exports.readActiveReel().reel.authors[0].username, 'new.creator');
visibleCode = 'THIRDCODE';
visibleAuthor = 'third.creator';
assert.equal(context.exports.readActiveReel().code, 'THIRDCODE');
assert.equal(context.exports.readActiveReel().reel.authors[0].username, 'third.creator');
assert.equal(context.exports.readActiveReel().reel.mediaId, null, '不得套用旧视频元信息');

assert.equal(context.exports.readFeedAuthor().username, 'third.creator');
const originalQueryAll = document.querySelectorAll;
/** 模拟作者栏与视频分离，且没有 Reel 永久链接和新 meta。 */
scope.querySelector = () => null;
let liveAuthor = 'visible.creator';
const liveLink = {
  /** 作者链接随页面内滚动更新。 */ get href() { return `https://www.instagram.com/${liveAuthor}/`; },
  /** 作者名与链接一致。 */ get textContent() { return liveAuthor; },
  /** 作者位于当前可见视频的底部。 */ getBoundingClientRect() { return { top: 700, bottom: 730, width: 100, height: 30 }; },
};
const staleLink = {
  href: 'https://www.instagram.com/old.creator/', textContent: 'old.creator',
  /** 预加载或上一条视频的作者已在视口外。 */ getBoundingClientRect() { return { top: -200, bottom: -170, width: 100, height: 30 }; },
};
/** 只给当前视频提供旁边可见的作者链接。 */
document.querySelectorAll = selector => selector === 'main a[href]' ? [staleLink, liveLink] : originalQueryAll(selector);
assert.equal(context.exports.readFeedAuthor().username, 'visible.creator');
liveAuthor = 'next.visible';
assert.equal(context.exports.readFeedAuthor().username, 'next.visible', '复用同一 DOM 节点也必须识别新作者');
location.pathname = '/creator/reels/';
assert.equal(context.exports.readFeedAuthor(), null, '主页网格不能走推荐页作者回退');
