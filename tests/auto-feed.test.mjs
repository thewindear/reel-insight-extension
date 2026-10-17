import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

/** 编译现有模块供隔离环境执行，测试真实调度逻辑。 */
function compiled(path) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
}
const settingsModule = { exports: {} };
runInNewContext(compiled('../src/reel/settings.ts'), settingsModule);
const timers = new Map();
let sequence = 0;
let settings = { autoFeed: true, autoBrowseFeed: true, autoProfileData: false, autoFeedProfiles: false };
let settingsListener;
let runtimeListener;
const playsRequests = [];
const profileRequests = [];
let profileCancels = 0;
let playsCancels = 0;
let code = 'FIRST';
let ready = true;
let saveSuccess = true;
let advances = 0;
let saves = 0;
let plays = null;
const reelSaves = [];
const pageListeners = new Map();
let feedAuthor;
let aboutCalls = 0;
let now = 10000;
const profileSaves = [];
const location = { pathname: '/reels/', href: 'https://www.instagram.com/reels/', search: '' };
const controller = new AbortController();
const document = { readyState: 'complete', hidden: false,
  /** 测试页面不提供内嵌数据。 */ querySelectorAll() { return []; },
  /** 注册页面事件。 */ addEventListener(name, callback) { pageListeners.set(name, callback); },
  /** 清理页面事件。 */ removeEventListener() {},
  /** 接受缓存请求。 */ dispatchEvent() {} };
const context = {
  exports: {}, URLSearchParams, document, location, Event, AbortController, Date: { now: () => now },
  /** 记录待执行定时器及真实换算后的等待时间。 */ setTimeout(callback, delay) { const id = ++sequence; timers.set(id, { callback, delay }); return id; },
  /** 取消尚未触发的浏览。 */ clearTimeout(id) { timers.delete(id); },
  /** 测试主动轮询，避免真实计时。 */ setInterval() { return 1; },
  /** 清理轮询。 */ clearInterval() {},
  browser: {
    storage: { local: { /** 返回实际配置。 */ async get() { return { settings }; } },
      onChanged: { /** 保存设置监听。 */ addListener(value) { settingsListener = value; }, /** 清理设置监听。 */ removeListener() {} } },
    runtime: { id: 'test', onMessage: { /** 接受消息监听。 */ addListener(value) { runtimeListener = value; }, /** 清理消息监听。 */ removeListener() {} },
      /** 模拟成功和失败的保存。 */ async sendMessage(message) {
        if (message.type === 'OPEN_PROFILE_WORKER' && message.feedProfile === true) { profileRequests.push(message); return { tabId: 12 }; }
        if (message.type === 'CANCEL_FEED_PROFILE') { profileCancels++; return { accepted: true }; }
        if (message.type === 'OPEN_PROFILE_WORKER' && message.target === 'plays') { playsRequests.push(message); return { tabId: 11 }; }
        if (message.type === 'CANCEL_REEL_PLAYS') { playsCancels++; return { accepted: true }; }
        if (message.type === 'SAVE_PROFILE') { profileSaves.push(message); return { saved: true }; }
        reelSaves.push(message.reel);
        saves++; return { saved: saveSuccess };
      } },
  },
  /** 使用真实设置解析，仅替换浏览器页面读取。 */ require(name) {
    if (name === '../reel/settings') return settingsModule.exports;
    if (name === '../reel/profile-url') return { profileUsername: () => null };
    if (name === '../reel/extract') return { findReels: () => [], reelFromPageEvent: value => value,
      mergeReels: (a, b) => ({ ...a, ...Object.fromEntries(Object.entries(b).filter(([, value]) => value !== null)) }),
      mergeProfiles: (a, b) => ({ ...a, ...Object.fromEntries(Object.entries(b).filter(([, value]) => value !== null)) }) };
    if (name === './page') return { readFeedAuthor: () => feedAuthor ?? null, readProfileReels: () => [], readActiveReel: () => ready ? { code, reel: { code, caption: 'Ready', plays, authors: feedAuthor ? [feedAuthor] : [] } } : null,
      advanceFeedReel: () => { advances++; return true; },
      collectProfileAbout: () => { aboutCalls++; throw new Error('推荐页不得直接打开账户简介'); } };
    throw new Error(name);
  },
};
runInNewContext(compiled('../src/content/reel-reader.ts'), context);
const read = context.exports.startReelReader(controller.signal);
await new Promise(setImmediate);
/** 更新配置并模拟跨标签页的存储通知。 */
function change(value) {
  settings = { ...settings, ...value };
  settingsListener({ settings: { newValue: settings } }, 'local');
}
/** 执行唯一待处理的浏览定时器。 */
function fire() {
  assert.equal(timers.size, 1);
  const [id, timer] = [...timers][0];
  timers.delete(id);
  timer.callback();
}
for (const [unit, value, delay] of [['ms', 1000, 1000], ['s', 2, 2000], ['min', 0.5, 30000]]) {
  change({ feedDelayUnit: unit, feedDelay: value });
  read();
  await new Promise(setImmediate);
  assert.ok(saves > 0, '先保存当前视频');
  assert.equal([...timers.values()][0].delay, delay);
  plays = 1234;
  read();
  await new Promise(setImmediate);
  assert.equal(reelSaves.at(-1).plays, 1234, '等待切换期间晚到的播放数必须继续保存');
  assert.equal(timers.size, 1, '重复读取不能添加多个切换任务');
  fire();
  const previous = advances;
  read();
  await new Promise(setImmediate);
  assert.equal(timers.size, 0, '同一视频只切换一次，等待新视频出现');
  assert.equal(advances, previous);
  code += 'N';
}
// 上一条已经采集并切走后，页面迟到的规范化网络响应仍应补齐原记录。
const capturedCode = 'FIRST';
pageListeners.get('instagram-plugin:reel')({ detail: { code: capturedCode, caption: 'Ready', plays: 5678, authors: [] } });
await new Promise(setImmediate);
assert.equal(reelSaves.at(-1).code, capturedCode);
assert.equal(reelSaves.at(-1).plays, 5678);
const beforePreload = reelSaves.length;
pageListeners.get('instagram-plugin:reel')({ detail: { code: 'PRELOADED', plays: 9999, authors: [] } });
await new Promise(setImmediate);
assert.equal(reelSaves.length, beforePreload, '不能因为预加载响应新增未浏览的视频');
change({ feedDelay: 1000, feedDelayUnit: 'ms' });
read();
await new Promise(setImmediate);
change({ autoBrowseFeed: false });
assert.equal(timers.size, 0, '关闭自动浏览立即取消等待');
read();
await new Promise(setImmediate);
assert.equal(timers.size, 0);
change({ autoBrowseFeed: true, autoFeed: false });
read();
await new Promise(setImmediate);
assert.equal(timers.size, 0, '采集关闭时不能自动浏览');
change({ autoFeed: true });
code = 'FAILED';
saveSuccess = false;
read();
await new Promise(setImmediate);
assert.equal(timers.size, 0, '保存失败不能跳过当前视频');
saveSuccess = true;
read();
await new Promise(setImmediate);
location.pathname = '/creator/reels/';
const beforeLeave = advances;
fire();
assert.equal(advances, beforeLeave, '离开推荐页后不能继续切换');
location.pathname = '/reels/';
code = 'MANUAL';
read();
await new Promise(setImmediate);
code = 'MANUALNEXT';
fire();
assert.equal(advances, beforeLeave, '手动切换后旧定时器不能跳过新视频');
read();
await new Promise(setImmediate);
document.hidden = true;
fire();
assert.equal(advances, beforeLeave, '后台标签页不能自动切换');
document.hidden = false;
ready = false;
read();
await new Promise(setImmediate);
assert.equal(timers.size, 0, '未加载视频时等待数据');
ready = true;
read();
await new Promise(setImmediate);
assert.equal(timers.size, 1);
change({ autoFeedProfiles: true });
assert.equal(settingsModule.exports.settingsFrom(settings).autoProfileData, true, '开启补全达人信息应同步开启自动采集达人资料');
code = 'PROFILE';
feedAuthor = { username: 'creator', profileUrl: 'https://www.instagram.com/creator/', externalUrl: null };
read();
await new Promise(setImmediate);
assert.equal(timers.size, 0, '达人详情采集期间不能自动切换视频');
assert.equal(profileRequests.length, 1);
assert.equal(profileRequests[0].target, 'profile');
assert.equal(profileRequests[0].url, feedAuthor.profileUrl);
assert.equal(profileSaves.length, 0, '推荐页不能把简略作者信息当作完整达人资料保存');
assert.equal(aboutCalls, 0, '推荐页不打开账户简介，交给达人详情采集');
runtimeListener({ type: 'FEED_PROFILE_COMPLETE', profile: 'creator' }, { id: 'test' }, () => {});
read();
await new Promise(setImmediate);
assert.equal(timers.size, 1);
code = 'PROFILE2';
read();
await new Promise(setImmediate);
assert.equal(profileRequests.length, 1, '同一发布者不重复打开详情页');
ready = false;
feedAuthor = { ...feedAuthor, username: 'next.creator', profileUrl: 'https://www.instagram.com/next.creator/' };
read();
await new Promise(setImmediate);
assert.equal(profileRequests.length, 2, '没有完整视频数据也应为新发布者打开详情页');
change({ autoFeedProfiles: false });
await new Promise(setImmediate);
assert.equal(profileCancels, 1, '关闭开关应停止正在执行的达人详情补全');
change({ autoFeedProfiles: false, autoBrowseFeed: true });
ready = true;
plays = null;
code = 'NEEDSPLAYS';
read();
await new Promise(setImmediate);
assert.equal(playsRequests.length, 1);
assert.equal(playsRequests[0].code, code);
assert.equal(playsRequests[0].profile, 'next.creator');
const beforeBackfill = advances;
if (timers.size) fire();
assert.equal(advances, beforeBackfill, '补播放数窗口工作期间不能自动切走');
read();
await new Promise(setImmediate);
assert.equal(playsRequests.length, 1, '同一缺失记录不能反复打开窗口');
runtimeListener({ type: 'REEL_PLAYS_COMPLETE', code }, { id: 'other-extension' }, () => {});
read();
await new Promise(setImmediate);
assert.equal(timers.size, 0, '其他扩展不能伪造补全完成通知');
runtimeListener({ type: 'REEL_PLAYS_COMPLETE', code }, { id: 'test' }, () => {});
read();
await new Promise(setImmediate);
assert.equal(timers.size, 1, '收到补全完成通知后恢复浏览');
fire();
assert.equal(advances, beforeBackfill + 1);
change({ autoFeedPlays: false });
code = 'PLAYSOPTION';
read();
await new Promise(setImmediate);
assert.equal(playsRequests.length, 1, '关闭自动补全视频播放后不打开列表窗口');
change({ autoFeedPlays: true });
read();
await new Promise(setImmediate);
assert.equal(playsRequests.length, 2, '开启后应补全当前缺失记录');
change({ autoFeedPlays: false });
await new Promise(setImmediate);
assert.equal(playsCancels, 1, '关闭开关时取消正在执行的播放数补全窗口');
read();
await new Promise(setImmediate);
assert.equal(playsRequests.length, 2);
// 同页两项补全完成后，来源页只恢复浏览，不能再创建播放数窗口。
change({ autoFeedProfiles: true, autoFeedPlays: true });
code = 'COMBINED';
feedAuthor = { ...feedAuthor, username: 'combined.creator', profileUrl: 'https://www.instagram.com/combined.creator/' };
const beforeCombinedPlays = playsRequests.length;
read();
await new Promise(setImmediate);
assert.equal(profileRequests.at(-1).playsCode, 'COMBINED');
runtimeListener({ type: 'FEED_PROFILE_COMPLETE', profile: 'combined.creator', completedPlaysCode: 'COMBINED' }, { id: 'test' }, () => {});
read();
await new Promise(setImmediate);
assert.equal(playsRequests.length, beforeCombinedPlays, '同页组合任务结束后不能另开播放数窗口');
assert.equal(timers.size, 1, '两项补全完成后恢复推荐页浏览');
controller.abort();
assert.equal(timers.size, 0, '扩展卸载时取消待执行任务');
console.log('Automatic feed browsing checks passed');
