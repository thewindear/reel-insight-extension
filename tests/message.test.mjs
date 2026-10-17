import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/content/reel-reader.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const reel = { code: 'ABC123', authors: [] };
let current = { code: reel.code, reel };
let profileReels = [];
let listener;
let settingsListener;
let poll;
let profileAboutCalls = 0;
const saved = [];
const scripts = [];
const profile = { username: 'creator', joinedAt: null, basedIn: null, verifiedAt: null };
const document = {
  readyState: 'loading',
  /** 模拟内容脚本依赖的页面事件注册。 */
  addEventListener() {},
  /** 模拟内容脚本依赖的页面事件派发。 */
  dispatchEvent() {},
  /** 模拟页面内导航后新增的 JSON 脚本。 */
  querySelectorAll() { return scripts; },
};
const context = {
  exports: {}, URLSearchParams, document, Event, AbortController, location: { pathname: '/creator/reels/', href: 'https://www.instagram.com/reels/' },
  /** 由测试手动触发读取，无需真正启动后台定时器。 */
  setInterval(callback) { poll = callback; return 1; },
  browser: { storage: {
    local: { /** 返回默认采集配置。 */ async get() { return {}; } },
    onChanged: { /** 保存配置变更监听器。 */ addListener(value) { settingsListener = value; } },
  }, runtime: { onMessage: {
    /** 保存消息监听器，供断言直接触发。 */
    addListener(value) { listener = value; },
  },
    id: 'extension-id',
    /** 验证手动采集消息来自本扩展记录页。 */
    getURL(path) { return `chrome-extension://extension-id${path}`; },
    /** 记录无需打开 popup 的自动保存请求。 */
    async sendMessage(message) { saved.push(message); return { saved: true }; },
  } },
  /** 只替换数据源，测试真实的消息监听代码。 */
  require(name) {
    if (name === '../reel/settings') return { defaultSettings: { language: 'zh', autoFeed: true, autoProfileData: true, autoProfile: false, profileDataMode: 'current-tab', profileMode: 'current-tab' },
      /** 模拟独立的自动达人资料配置。 */
      settingsFrom: value => ({ language: value?.language === 'en' ? 'en' : 'zh', autoFeed: value?.autoFeed ?? true,
        autoProfileData: value?.autoProfileData ?? true, autoProfile: value?.autoProfile ?? false,
        profileDataMode: value?.profileDataMode ?? 'current-tab', profileMode: value?.profileMode ?? 'current-tab' }) };
    if (name === '../reel/extract') return { findReels: payload => payload.reels ?? [], mergeReels: (_, next) => next,
      reelFromPageEvent: () => null,
      /** 本例内嵌 JSON 不包含达人资料。 */
      findProfile: () => null,
      /** 本例只保留最新的达人资料。 */
      mergeProfiles: (_, next) => next,
      /** 本例没有页面派发的达人事件。 */
      profileFromPageEvent: () => null };
    if (name === '../reel/profile-url') return { /** 仅将测试中的主页视为当前达人。 */
      profileUsername: url => url === 'https://www.instagram.com/creator/' ? 'creator' : null };
    if (name === './page') return { readFeedAuthor: () => null, readActiveReel: () => current,
      /** 只在当前达人主页提供资料。 */
      readProfilePage: () => context.location.pathname === '/creator/' ? profile : null,
      readProfileReels: () => profileReels,
      /** 记录自动打开账户简介的次数。 */
      collectProfileAbout: async () => { profileAboutCalls++; return { ...profile, joinedAt: '2024年12月' }; } };
    throw new Error(`Unexpected import: ${name}`);
  },
};
runInNewContext(compiled, context);
const readCurrentReel = context.exports.startReelReader();

/** 模拟 Chrome 的 sendResponse，检查监听器是否真正回复 popup。 */
function request(type, sender = {}) {
  let reply;
  listener({ type }, sender, value => { reply = value; });
  return reply;
}

assert.equal(request('OTHER'), undefined);
assert.equal(request('GET_REEL').status, 'loading');
assert.equal(readCurrentReel().status, 'loading');
document.readyState = 'complete';
await new Promise(setImmediate);
assert.equal(request('GET_REEL').status, 'ready');
assert.equal(readCurrentReel().status, 'ready');
current = { code: 'NEXTCODE', reel: null };
assert.equal(readCurrentReel().status, 'loading');
scripts.push({ textContent: JSON.stringify({ reels: [{ code: 'NEXTCODE', authors: [] }] }) });
assert.equal(readCurrentReel().reel.code, 'NEXTCODE');
current = null;
assert.equal(request('GET_REEL').status, 'not-reel');
await new Promise(setImmediate);
current = { code: 'SCROLL789', reel: { code: 'SCROLL789', authors: [] } };
context.location.pathname = '/reels/SCROLL789/';
settingsListener({ settings: { newValue: { autoFeed: false } } }, 'local');
const beforePaused = saved.length;
poll();
await new Promise(setImmediate);
assert.equal(saved.length, beforePaused, '关闭推荐页自动采集后不能写入记录');
settingsListener({ settings: { newValue: { autoFeed: true } } }, 'local');
poll();
await new Promise(setImmediate);
assert.equal(saved.at(-1).reel.code, 'SCROLL789', '信息流滚动后即使未打开 popup 也应保存');
current = null;
context.location.pathname = '/creator/reels/';
profileReels = [
  { code: 'GRID111', authors: [{ username: 'creator' }] },
  { code: 'GRID222', authors: [{ username: 'creator' }] },
];
assert.equal(request('GET_REEL').status, 'profile');
poll();
await new Promise(setImmediate);
assert.equal(saved.at(-1).reel.code, 'SCROLL789', '默认关闭达人列表自动采集');
const count = saved.length;
poll();
await new Promise(setImmediate);
assert.equal(saved.length, count, '网格条目未变化时不重复保存');
profileReels.push({ code: 'GRID333', authors: [{ username: 'creator' }] });
poll();
await new Promise(setImmediate);
assert.equal(saved.length, count, '关闭达人列表自动采集后滚动不会保存网格条目');
profileReels = [];
context.location.pathname = '/creator/';
context.location.href = 'https://www.instagram.com/creator/';
settingsListener({ settings: { newValue: { autoProfileData: false } } }, 'local');
poll();
await new Promise(setImmediate);
assert.equal(saved.filter(message => message.type === 'SAVE_PROFILE').length, 0, '关闭自动达人资料后不保存主页数据');
assert.equal(profileAboutCalls, 0, '关闭自动达人资料后不打开账户简介');
settingsListener({ settings: { newValue: { autoProfileData: true } } }, 'local');
poll();
await new Promise(setImmediate);
assert.equal(saved.some(message => message.type === 'SAVE_PROFILE'), true, '开启自动达人资料后保存当前主页');
assert.equal(profileAboutCalls, 1, '开启自动达人资料后读取账户简介');
settingsListener({ settings: { newValue: { autoProfileData: false } } }, 'local');
context.location.pathname = '/reels/';
context.location.href = 'https://www.instagram.com/reels/';
poll();
context.location.pathname = '/creator/';
context.location.href = 'https://www.instagram.com/creator/';
assert.equal(request('GET_REEL').hasReels, false, '达人主页无网格时仍应提供手动采集入口');
assert.equal(request('COLLECT_PROFILE', { id: 'other-extension', url: 'chrome-extension://extension-id/viewer.html' }), undefined, '其他来源不能手动采集');
profile.followers = 10;
const beforeManual = saved.filter(message => message.type === 'SAVE_PROFILE').length;
assert.equal(request('COLLECT_PROFILE', { id: 'extension-id', url: 'chrome-extension://extension-id/viewer.html' }).accepted, true);
await new Promise(setImmediate);
await new Promise(setImmediate);
assert.equal(saved.filter(message => message.type === 'SAVE_PROFILE').length > beforeManual, true, '自动关闭后手动采集仍可保存达人');
assert.equal(profileAboutCalls, 2, '手动采集仍会读取账户简介');
assert.equal(request('COLLECT_PROFILE', { id: 'extension-id', url: 'chrome-extension://extension-id/viewer.html' }).accepted, true);
console.log('Chrome message response checks passed');
