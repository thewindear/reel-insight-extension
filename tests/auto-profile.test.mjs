import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/content/reel-reader.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const path = '/creator/reels/';
const location = { pathname: path, search: '', get href() { return `https://www.instagram.com${this.pathname}${this.search}`; } };
const items = [{ code: 'FIRST', url: 'https://www.instagram.com/reel/FIRST/', caption: null, authors: [] }];
const saved = new Map([['FIRST', { ...items[0], caption: 'Existing caption' }]]);
let storedSettings = { autoProfile: true, profileMode: 'current-tab', profilePages: 2 };
const clicked = [];
let waited = 0;
const clickWaits = [];
const saveEvents = [];
const workerOpens = [];
const workerStarts = [];
const completed = [];
let poll;
let listener;
let settingsListener;
let scrolls = 0;
const context = {
  exports: {}, URLSearchParams, location, Event, Date,
  history: { /** 关闭详情并回到用户列表。 */ back() { location.pathname = path; } },
  window: { /** 首次自动滚动时模拟加载另一条 Reel。 */ scrollTo() {
    scrolls++;
    if (scrolls === 1) items.push({ code: 'SECOND', url: 'https://www.instagram.com/reel/SECOND/', caption: null, authors: [] });
  } },
  document: {
    readyState: 'complete', documentElement: { scrollHeight: 5000 },
    /** 注册页面事件。 */ addEventListener() {},
    /** 请求页面缓存。 */ dispatchEvent() {},
    /** 页面没有内嵌 JSON。 */ querySelectorAll() { return []; },
    /** 点击对应网格链接后进入详情。 */ querySelector(selector) {
      const code = selector.match(/reel\/(FIRST|SECOND)\//)?.[1];
      return code ? { click() { clicked.push(code); clickWaits.push(waited); location.pathname = `/reel/${code}/`; } } : null;
    },
  },
  /** 直接完成 Instagram 页面等待。 */ setTimeout(callback, milliseconds) { waited += milliseconds; callback(); },
  /** 保存周期采集回调供测试手动调用。 */ setInterval(callback) { poll = callback; return 1; },
  browser: {
    storage: {
      local: { /** 同时提供配置与已存记录。 */ async get() { return { settings: storedSettings, reels: [...saved.values()] }; } },
      onChanged: { /** 捕获自动采集开关变更监听器。 */ addListener(value) { settingsListener = value; } },
    },
    runtime: {
      id: 'extension-id',
      /** 生成抽屉来源地址。 */ getURL(value) { return `chrome-extension://extension-id${value}`; },
      onMessage: { /** 保留停止消息监听器。 */ addListener(value) { listener = value; } },
      /** 按 shortcode 保存真实详情数据。 */ async sendMessage(message) {
        if (message.type === 'OPEN_PROFILE_WORKER') { workerOpens.push(message); return { tabId: 11 }; }
        if (message.type === 'PROFILE_WORKER_STARTED') { workerStarts.push(message); return { accepted: true }; }
        if (message.type === 'PROFILE_WORKER_DONE') { completed.push(message); return { accepted: true }; }
        saveEvents.push({ code: message.reel.code, waited });
        const old = saved.get(message.reel.code);
        saved.set(message.reel.code, { ...old, ...message.reel, caption: message.reel.caption ?? old?.caption ?? null });
        return { saved: true };
      },
    },
  },
  /** 使用测试页面数据驱动真实自动队列。 */ require(name) {
    if (name === '../reel/settings') return { defaultSettings: { language: 'zh', autoFeed: true, autoProfileData: false, autoProfile: false, profileDataMode: 'new-tab', profileMode: 'new-tab', profilePages: 1 },
      /** 本例只测试达人 Reels 列表采集。 */
      settingsFrom: value => ({ language: 'zh', autoFeed: true, autoProfileData: false, autoProfile: value?.autoProfile === true,
        profileDataMode: 'new-tab', profileMode: value?.profileMode === 'current-tab' ? 'current-tab' : 'new-tab', profilePages: value?.profilePages ?? 1, profileDelay: value?.profileDelay ?? 1000, profileDelayUnit: value?.profileDelayUnit ?? 'ms' }) };
    if (name === '../reel/extract') return { findReels: () => [], reelFromPageEvent: () => null,
      mergeReels: (previous, next) => ({ ...previous, ...next, caption: next.caption ?? previous?.caption ?? null }) };
    if (name === '../reel/profile-url') return { /** 只识别测试中的达人列表页。 */
      profileUsername: () => location.pathname === path ? 'creator' : null };
    if (name === './page') return { readFeedAuthor: () => null,
      readProfilePage: () => null,
      readProfileReels: () => location.pathname === path ? items : [],
      readActiveReel: () => location.pathname === path ? null : {
        code: location.pathname.match(/FIRST|SECOND/)?.[0],
        reel: { ...items.find(item => location.pathname.includes(item.code)), caption: 'Detail caption' },
      },
    };
    throw new Error(`Unexpected import: ${name}`);
  },
};
runInNewContext(compiled, context);
context.exports.startReelReader();
await new Promise(setImmediate);
poll();
await new Promise(setImmediate);
await new Promise(setImmediate);
assert.deepEqual(clicked, ['FIRST'], '自动模式即使已有 Caption 也应打开新 Reel 采集详情');
assert.equal(saved.get('FIRST').caption, 'Detail caption');
assert.ok(saveEvents.filter(event => event.code === 'FIRST').every(event => event.waited >= 1000), '等待结束前不能提前批量保存首条记录');
assert.equal(clickWaits[0], 1000, '首条自动采集前应等待默认 1000 毫秒');
poll();
assert.equal(scrolls, 1, '补全已加载条目后应继续向下加载');
poll();
await new Promise(setImmediate);
await new Promise(setImmediate);
assert.deepEqual(clicked, ['FIRST', 'SECOND']);
assert.equal(saved.get('SECOND').caption, 'Detail caption');
assert.ok(saveEvents.filter(event => event.code === 'SECOND').every(event => event.waited >= 2000), '下一页的记录同样不能绕过延迟提前保存');
assert.ok(clickWaits[1] - clickWaits[0] >= 1000, '跨页的下一条 Reel 也必须等待采集间隔');
poll();
assert.equal(scrolls, 1, '达到两页上限后不能继续滚动');
items.push({ code: 'THIRD', url: 'https://www.instagram.com/reel/THIRD/', caption: null, authors: [] });
poll();
assert.deepEqual(clicked, ['FIRST', 'SECOND'], '达到页数上限后，即使页面后来加载更多条目也不继续采集');
items.pop();
settingsListener({ settings: { newValue: { autoProfile: false } } }, 'local');
poll();
assert.deepEqual(clicked, ['FIRST', 'SECOND'], '停止后不应自动重启');
let reply;
listener({ type: 'GET_REEL' }, {}, value => { reply = value; });
assert.equal(reply.progress.state, 'done');
settingsListener({ settings: { newValue: { autoProfile: true, profileMode: 'new-tab' } } }, 'local');
poll();
await new Promise(setImmediate);
assert.equal(workerOpens.length, 1, '单独标签页模式应只打开一个采集页');
assert.equal(clicked.length, 2, '原页面不能逐条打开 Reel');
listener({ type: 'GET_REEL' }, {}, value => { reply = value; });
assert.equal(reply.workerTabId, 11);
assert.equal(workerOpens[0].url, 'https://www.instagram.com/creator/reels/');
assert.equal(workerOpens[0].target, 'reels');
listener({ type: 'PROFILE_COLLECTION_COMPLETE', profile: 'creator', progress: { completed: 2, total: 2, failed: 0 } }, { id: 'extension-id' }, () => {});
listener({ type: 'GET_REEL' }, {}, value => { reply = value; });
assert.equal(reply.progress.state, 'done', '来源页应在专用窗口关闭后保留完成状态');
assert.equal(reply.workerTabId, undefined);
location.search = '?ig_plugin_worker=1';
storedSettings = { autoProfile: true, profileMode: 'new-tab', profilePages: 1 };
context.exports.startReelReader();
await new Promise(setImmediate);
poll();
assert.equal(workerStarts.length, 0, '首条 Reel 尚未处理完时不能提前切回来源页');
await new Promise(setImmediate);
await new Promise(setImmediate);
assert.deepEqual(clicked, ['FIRST', 'SECOND', 'FIRST', 'SECOND'], '采集标签页应自行处理首批 Reel');
poll();
assert.equal(workerStarts.length, 1, '专用窗口开始处理首批 Reel 时应切回来源页且只请求一次');
assert.equal(workerStarts[0].profile, 'creator');
assert.equal(scrolls, 1, '默认只采集首批，不主动下拉');
await new Promise(setImmediate);
assert.equal(completed.length, 1, '首批采集结束后只发送一次完成消息');
assert.equal(completed[0].profile, 'creator');
listener({ type: 'GET_REEL' }, {}, value => { reply = value; });
assert.equal(reply.workerHere, true, '专用标签页的抽屉也应能控制采集');
// 三种单位都应作用于实际队列，而不只是通过配置校验。
location.search = '';
for (const [unit, value, milliseconds] of [['ms', 1500, 1500], ['s', 0.5, 500], ['min', 0.01, 600]]) {
  storedSettings = { autoProfile: true, profileMode: 'current-tab', profilePages: 1, profileDelay: value, profileDelayUnit: unit };
  const beforeWait = waited;
  const beforeClicks = clicked.length;
  const beforeSaves = saveEvents.length;
  context.exports.startReelReader();
  await new Promise(setImmediate);
  poll();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  assert.equal(clickWaits[beforeClicks] - beforeWait, milliseconds, `${unit} 应正确换算为实际等待时间`);
  assert.ok(saveEvents.slice(beforeSaves).every(event => event.waited - beforeWait >= milliseconds), '每种单位都必须先等待再保存');
}
const pendingTimers = [];
/** 挂起等待以验证用户停止后不会继续保存或打开详情。 */
context.setTimeout = callback => { pendingTimers.push(callback); };
storedSettings = { autoProfile: true, profileMode: 'current-tab', profilePages: 1, profileDelay: 1, profileDelayUnit: 'min' };
const beforeStopSaves = saveEvents.length;
const beforeStopClicks = clicked.length;
context.exports.startReelReader();
await new Promise(setImmediate);
poll();
await new Promise(setImmediate);
assert.ok(pendingTimers.length > 0);
poll();
assert.equal(saveEvents.length, beforeStopSaves, '等待中轮询也不能提前保存整个列表');
listener({ type: 'STOP_PROFILE_ENRICHMENT' }, { id: 'extension-id', url: 'chrome-extension://extension-id/viewer.html?tabId=7' }, () => {});
for (const resume of pendingTimers) resume();
await new Promise(setImmediate);
assert.equal(saveEvents.length, beforeStopSaves, '停止等待后不能写入待采集记录');
assert.equal(clicked.length, beforeStopClicks, '停止等待后不能再打开详情');
console.log('Automatic profile collection checks passed');
