import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { authorFrom, profileFrom } from '../src/reel/extract.ts';
import { profileUsername } from '../src/reel/profile-url.ts';

const source = readFileSync(new URL('../src/content/page.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const location = { href: 'https://www.instagram.com/creator/', pathname: '/creator/' };
let phase = 0;
const close = { textContent: '关闭', click() { phase = 3; } };
const dialog = {
  innerText: '账户简介\ncreator\n加入日期\n2024年12月\n账户所在地\n美国\n已认证\n2025年8月',
  parentElement: null,
  /** 弹窗中只有扩展需要使用的关闭按钮。 */
  querySelectorAll() { return [close]; },
};
const title = { textContent: '账户简介', innerText: '账户简介', children: [], parentElement: dialog,
  /** 标题自身没有关闭按钮。 */
  querySelectorAll() { return []; },
};
const aboutButton = {
  textContent: '账户简介',
  /** 模拟可见的菜单项。 */
  getBoundingClientRect() { return { width: 100 }; },
  /** 打开账户简介弹窗。 */
  click() { phase = 2; },
};
const option = {
  /** 主页的选项按钮。 */
  getAttribute() { return '选项'; },
  /** 打开菜单。 */
  click() { phase = 1; },
};
const header = {
  /** 提供与当前地址匹配的用户名和选项按钮。 */
  querySelectorAll(selector) { return selector === 'h1, h2, a' ? [{ textContent: 'creator' }] : selector === 'button, [role="button"]' ? [option] : []; },
  /** 其余主页字段由接口提供，此处保持缺失。 */
  querySelector() { return null; },
};
const document = {
  body: {},
  /** 弹窗在本例中没有 role=dialog，验证标题兜底定位。 */
  querySelector(selector) { return selector === 'main header' ? header : null; },
  /** 模拟菜单出现及弹窗加载。 */
  querySelectorAll(selector) { return selector === 'button, [role="button"]' && phase === 1 ? [aboutButton] :
    selector === 'h1, h2, h3, div, span' && phase === 2 ? [title] : []; },
};
dialog.parentElement = document.body;
const context = { exports: {}, document, location, URL, setTimeout,
  /** 运行真实 DOM 编排代码及真实字段校验。 */
  require(name) {
    if (name === '../reel/extract') return { authorFrom, profileFrom };
    if (name === '../reel/profile-url') return { profileUsername };
    throw new Error(`Unexpected import: ${name}`);
  },
};
runInNewContext(compiled, context);
assert.equal(context.exports.readProfilePage().joinedAt, null);
const profile = await context.exports.collectProfileAbout('creator');
assert.equal(profile.joinedAt, '2024年12月');
assert.equal(profile.basedIn, '美国');
assert.equal(profile.verifiedAt, '2025年8月');
assert.equal(phase, 3, '扩展打开的账户简介必须关闭');
assert.equal(await context.exports.collectProfileAbout('other'), null, '不得采集非当前账号');
const cancelled = new AbortController();
cancelled.abort();
assert.equal(await context.exports.collectProfileAbout('creator', cancelled.signal), null, '关闭自动采集后不得打开账户简介');
assert.equal(phase, 3, '关闭自动采集不得再次操作主页菜单');
console.log('Automatic account-about collection checks passed');

// 推荐页通过当前视频的菜单读取账户简介，不能借用预加载视频或主页头部。
let authorUsername = 'creator';
const feedProfile = profileFrom({ username: 'creator', full_name: 'Creator' });
const feedLink = { href: 'https://www.instagram.com/reel/FEEDCODE/' };
const authorLink = {
  /** 推荐视频的发布者链接。 */ getAttribute() { return `/${authorUsername}/`; },
};
const feedOption = {
  /** 推荐页使用 More options 标签而非主页 Options。 */ getAttribute() { return 'More options'; },
  /** 模拟打开和收起视频菜单。 */ click() { phase = phase === 1 ? 0 : 1; },
};
const feedScope = {
  tagName: 'DIV', parentElement: { tagName: 'MAIN' },
  /** 当前容器只包含一条视频及其操作按钮。 */ querySelectorAll(selector) {
    return selector === 'video' ? [feedVideo] : selector === 'button, [role="button"]' ? [feedOption] : [];
  },
  /** 公开发布者链接与 Reel 地址用于确认归属。 */ querySelector(selector) {
    if (selector === 'a[href*="/reel/"]') return feedLink;
    if (selector === 'header a[href^="/"]') return authorLink;
    return null;
  },
};
const feedVideo = {
  parentElement: feedScope,
  /** 视频位于视口中央。 */ getBoundingClientRect() { return { top: 0, bottom: 800, height: 800, width: 400 }; },
  /** 模拟视频文章容器。 */ closest() { return feedScope; },
};
const originalQueryAll = document.querySelectorAll;
/** 保留真实弹窗阶段，同时提供当前视频。 */
document.querySelectorAll = selector => selector === 'video' ? [feedVideo] : originalQueryAll(selector);
context.innerHeight = 900;
location.href = 'https://www.instagram.com/reels/FEEDCODE/';
location.pathname = '/reels/FEEDCODE/';
phase = 0;
const feedAbout = await context.exports.collectProfileAbout('creator', undefined, feedProfile);
assert.equal(feedAbout.username, 'creator');
assert.equal(feedAbout.joinedAt, '2024年12月');
assert.equal(feedAbout.basedIn, '美国');
assert.equal(phase, 3, '推荐页账户简介读完也必须关闭');
authorUsername = 'other';
phase = 0;
assert.equal(await context.exports.collectProfileAbout('creator', undefined, feedProfile), null, '相邻视频作者不匹配时不能打开菜单');
assert.equal(phase, 0);
authorUsername = 'creator';
const originalAboutClick = aboutButton.click;
/** 打开账户简介期间用户手动切换推荐视频。 */
aboutButton.click = () => { phase = 2; authorUsername = 'other'; };
assert.equal(await context.exports.collectProfileAbout('creator', undefined, feedProfile), null, '打开弹窗后切换作者时不能保存旧资料');
assert.equal(phase, 3, '切换作者后仍要关闭扩展打开的旧弹窗');
aboutButton.click = originalAboutClick;
