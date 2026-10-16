import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/content/reel-reader.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const profilePath = '/creator/reels/';
const location = { pathname: profilePath };
const items = ['GRID111', 'GRID222'].map(code => ({ code, url: `https://www.instagram.com/reel/${code}/`, caption: null, authors: [] }));
const records = new Map([['GRID111', { ...items[0], caption: '已有文案' }]]);
const clicked = [];
const pauses = [];
let holdPause = false;
let listener;

const context = {
  exports: {}, location, Event,
  history: { /** 模拟关闭 Instagram 详情弹层。 */ back() { location.pathname = profilePath; } },
  document: {
    readyState: 'complete',
    /** 模拟内容脚本注册事件。 */ addEventListener() {},
    /** 模拟内容脚本请求页面缓存。 */ dispatchEvent() {},
    /** 测试不需要 JSON 内嵌脚本。 */ querySelectorAll() { return []; },
    /** 网格链接被点击后应进入对应 Reel 详情。 */ querySelector(selector) {
      const code = selector.match(/reel\/(GRID\d+)\//)?.[1];
      return code ? { click() { clicked.push(code); location.pathname = `/reel/${code}/`; } } : null;
    },
  },
  /** 按需暂停详情等待，以检查停止时的返回行为。 */ setTimeout(callback) {
    if (holdPause) pauses.push(callback);
    else callback();
  },
  /** 保留周期读取器，但不运行后台轮询。 */ setInterval() { return 1; },
  browser: {
    storage: {
      local: { /** 返回已持久化的 Caption。 */ async get() { return { reels: [...records.values()] }; } },
      onChanged: { /** 测试中不改变配置。 */ addListener() {} },
    },
    runtime: {
      id: 'extension-id',
      /** 返回抽屉页面地址以校验消息来源。 */ getURL(path) { return `chrome-extension://extension-id${path}`; },
      onMessage: { /** 保存消息监听器。 */ addListener(value) { listener = value; } },
      /** 保存 Reel 并保留已有的非空 Caption。 */ async sendMessage(message) {
        assert.equal(message.type, 'SAVE_REEL');
        const previous = records.get(message.reel.code);
        records.set(message.reel.code, { ...previous, ...message.reel, caption: message.reel.caption ?? previous?.caption ?? null });
        return { saved: true };
      },
    },
  },
  /** 注入页面读取与合并方法，运行真实的批量控制逻辑。 */ require(name) {
    if (name === '../reel/settings') return { defaultSettings: { language: 'zh', autoFeed: true, autoProfile: false }, settingsFrom: () => ({ language: 'zh', autoFeed: true, autoProfile: false }) };
    if (name === '../reel/extract') return {
      findReels: () => [], reelFromPageEvent: () => null,
      mergeReels: (previous, next) => ({ ...previous, ...next, caption: next.caption ?? previous?.caption ?? null }),
    };
    if (name === '../reel/profile-url') return { profileUsername: () => null };
    if (name === './page') return {
      readProfilePage: () => null,
      readProfileReels: () => location.pathname === profilePath ? items : [],
      readActiveReel: () => location.pathname === profilePath ? null : {
        code: location.pathname.match(/GRID\d+/)?.[0],
        reel: location.pathname.includes('GRID222') ? { ...items[1], caption: '从详情取得的文案' } : null,
      },
    };
    throw new Error(`Unexpected import: ${name}`);
  },
};
runInNewContext(compiled, context);
context.exports.startReelReader();
await new Promise(setImmediate);

/** 直接调用内容脚本消息监听器，检查用户发起的补全过程。 */
function request(type) {
  let reply;
  listener({ type }, { id: 'extension-id', url: 'chrome-extension://extension-id/viewer.html?tabId=7' }, value => { reply = value; });
  return reply;
}

assert.equal(request('START_PROFILE_ENRICHMENT').accepted, true);
await new Promise(setImmediate);
await new Promise(setImmediate);
assert.deepEqual(clicked, ['GRID222'], '已有 Caption 的 Reel 不应重复打开');
assert.equal(records.get('GRID222').caption, '从详情取得的文案');
assert.equal(location.pathname, profilePath, '补全后返回原网格');
const progress = request('GET_REEL');
assert.equal(progress.status, 'profile');
assert.equal(progress.progress.state, 'done');
assert.equal(progress.progress.completed, 1);
assert.equal(progress.progress.failed, 0);
items.push({ code: 'GRID333', url: 'https://www.instagram.com/reel/GRID333/', caption: null, authors: [] });
holdPause = true;
assert.equal(request('START_PROFILE_ENRICHMENT').accepted, true);
await new Promise(setImmediate);
assert.equal(location.pathname, '/reel/GRID333/');
assert.equal(request('STOP_PROFILE_ENRICHMENT').accepted, true);
assert.equal(location.pathname, profilePath);
assert.equal(request('GET_REEL').progress.state, 'stopped');
for (const resume of pauses) resume();
console.log('Profile Caption enrichment checks passed');
