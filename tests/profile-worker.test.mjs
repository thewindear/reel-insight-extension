import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { mergeProfiles } from '../src/reel/extract.ts';
import { profileUsername } from '../src/reel/profile-url.ts';
import { defaultSettings, settingsFrom } from '../src/reel/settings.ts';

const source = readFileSync(new URL('../src/content/reel-reader.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const base = { id: '7', username: 'creator', name: 'Creator', avatar: null, verified: false,
  biography: null, followers: 5, following: 2, posts: 3, private: false, externalUrl: null,
  profileUrl: 'https://www.instagram.com/creator/', bioLinks: [], joinedAt: null, basedIn: null, verifiedAt: null };
const opened = [];
const saved = [];
const started = [];
const finished = [];
let aboutCalls = 0;

/** 在测试地址中启动内容脚本，并暴露周期读取与页面资料读取次数。 */
function start(pathname, search, settings) {
  const location = { pathname, search, href: `https://www.instagram.com${pathname}${search}` };
  const isWorker = Boolean(search);
  let poll;
  let settingsListener;
  let pageReads = 0;
  const context = {
    exports: {}, location, Event, AbortController, Date,
    document: {
      readyState: 'complete',
      /** 注册页面数据监听。 */ addEventListener() {},
      /** 请求页面已有缓存。 */ dispatchEvent() {},
      /** 本例没有内嵌 JSON。 */ querySelectorAll() { return []; },
    },
    /** 测试主动触发周期读取。 */ setInterval(callback) { poll = callback; return 1; },
    browser: {
      storage: {
        local: { /** 读取每个窗口各自的采集配置。 */ async get() { return { settings }; } },
        onChanged: { /** 保留配置变更监听器供取消任务检查。 */ addListener(value) { settingsListener = value; } },
      },
      runtime: {
        id: 'extension-id',
        onMessage: { /** 本例不发送抽屉消息。 */ addListener() {} },
        /** 记录从来源页或采集窗口发出的请求。 */
        async sendMessage(message) {
          if (message.type === 'OPEN_PROFILE_WORKER') { opened.push(message); return { tabId: 11 }; }
          if (message.type === 'SAVE_PROFILE') { saved.push({ isWorker, profile: message.profile }); return { saved: true }; }
          if (message.type === 'PROFILE_WORKER_STARTED') { started.push(message); return { accepted: true }; }
          if (message.type === 'PROFILE_WORKER_DONE') { finished.push(message); return { accepted: true }; }
          throw new Error(`Unexpected message: ${message.type}`);
        },
      },
    },
    /** 用真实配置与资料合并规则驱动内容脚本。 */
    require(name) {
      if (name === '../reel/settings') return { defaultSettings, settingsFrom };
      if (name === '../reel/profile-url') return { profileUsername };
      if (name === '../reel/extract') return { mergeProfiles,
        /** 本例没有 Reel 网络响应。 */ findReels: () => [],
        /** 本例没有达人网络响应。 */ findProfile: () => null };
      if (name === './page') return {
        /** 记录是否在来源页读取了达人 DOM。 */
        readProfilePage: () => { pageReads++; return base; },
        /** 本例仅采集达人资料。 */ readProfileReels: () => [],
        /** 本例没有当前 Reel。 */ readActiveReel: () => null,
        /** 模拟账户简介补全。 */
        collectProfileAbout: async () => { aboutCalls++; return { ...base, joinedAt: '2024年12月', basedIn: '美国' }; },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  runInNewContext(compiled, context);
  context.exports.startReelReader();
  return { /** 触发内容脚本读取。 */ poll: () => poll(), /** 查看达人 DOM 读取次数。 */ pageReads: () => pageReads,
    /** 模拟用户切换采集位置或开关。 */ changeSettings: next => settingsListener({ settings: { newValue: next } }, 'local') };
}

const separate = { autoProfileData: true, autoProfile: false, profileDataMode: 'new-tab', profileMode: 'new-tab' };
const origin = start('/creator/', '', separate);
await new Promise(setImmediate);
origin.poll();
await new Promise(setImmediate);
assert.equal(opened.length, 1, '达人主页应打开独立采集窗口');
assert.equal(opened[0].url, 'https://www.instagram.com/creator/');
assert.equal(opened[0].target, 'profile');
assert.equal(origin.pageReads(), 0, '独立窗口模式不能在来源页读取达人 DOM');
assert.equal(saved.length, 0, '独立窗口模式不能在来源页保存达人资料');
assert.equal(aboutCalls, 0, '独立窗口模式不能在来源页打开账户简介');

const worker = start('/creator/', '?ig_plugin_worker=1', separate);
await new Promise(setImmediate);
worker.poll();
await new Promise(setImmediate);
worker.poll();
await new Promise(setImmediate);
await new Promise(setImmediate);
assert.equal(saved.some(item => item.isWorker && item.profile.joinedAt === '2024年12月'), true, '采集窗口应保存账户简介');
assert.equal(saved.every(item => item.isWorker), true, '达人资料只能由采集窗口保存');
assert.equal(aboutCalls, 1);
assert.equal(started.length, 1, '保存后应切回来源页');
assert.equal(finished.length, 1, '资料采集结束后应关闭独立窗口');
assert.equal(finished[0].kind, 'profile');

const cancelled = start('/creator/', '?ig_plugin_worker=1', separate);
await new Promise(setImmediate);
cancelled.changeSettings({ autoProfileData: false, autoProfile: false, profileMode: 'new-tab' });
await new Promise(setImmediate);
assert.equal(finished.at(-1).kind, 'cancelled', '关闭达人采集后应收起独立窗口');

const moved = start('/creator/', '?ig_plugin_worker=1', separate);
await new Promise(setImmediate);
const finishedBeforeReelsMode = finished.length;
moved.changeSettings({ ...separate, profileMode: 'current-tab' });
await new Promise(setImmediate);
assert.equal(finished.length, finishedBeforeReelsMode, '只修改 Reels 采集位置不应关闭达人资料窗口');
moved.changeSettings({ ...separate, profileDataMode: 'current-tab' });
await new Promise(setImmediate);
assert.equal(finished.at(-1).kind, 'cancelled', '改为当前页采集达人资料后应收起原独立窗口');

const current = start('/creator/', '', { ...separate, profileDataMode: 'current-tab' });
await new Promise(setImmediate);
current.poll();
await new Promise(setImmediate);
assert.equal(opened.length, 1, '当前页模式不得打开新窗口');
assert.equal(current.pageReads(), 1, '当前页模式应在来源页读取达人 DOM');
assert.equal(saved.some(item => !item.isWorker), true, '当前页模式应在来源页保存达人资料');
const readsBeforeMove = current.pageReads();
const savesBeforeMove = saved.filter(item => !item.isWorker).length;
current.changeSettings(separate);
current.poll();
await new Promise(setImmediate);
assert.equal(opened.length, 2, '切换到独立窗口后应为当前达人打开采集页');
assert.equal(current.pageReads(), readsBeforeMove, '切换后来源页不再读取达人 DOM');
assert.equal(saved.filter(item => !item.isWorker).length, savesBeforeMove, '切换后来源页不再保存达人资料');

const mixed = { ...separate, autoProfile: true, profileMode: 'current-tab' };
const mixedOrigin = start('/creator/', '', mixed);
await new Promise(setImmediate);
mixedOrigin.poll();
await new Promise(setImmediate);
assert.equal(opened.at(-1).target, 'profile', 'Reels 设为当前页时资料仍可独立采集');
assert.equal(mixedOrigin.pageReads(), 0, '独立采集达人资料不读取来源页');
const mixedWorker = start('/creator/', '?ig_plugin_worker=1', mixed);
await new Promise(setImmediate);
mixedWorker.poll();
await new Promise(setImmediate);
mixedWorker.poll();
await new Promise(setImmediate);
assert.equal(finished.at(-1).kind, 'profile', 'Reels 设为当前页不应阻止资料窗口完成');

const opposite = { ...separate, autoProfile: true, profileDataMode: 'current-tab' };
const oppositeOrigin = start('/creator/', '', opposite);
await new Promise(setImmediate);
oppositeOrigin.poll();
await new Promise(setImmediate);
assert.equal(opened.at(-1).target, 'reels', 'Reels 独立采集时应打开其专用窗口');
assert.equal(oppositeOrigin.pageReads(), 1, '资料设为当前页时仍在来源页采集');
const oppositeWorker = start('/creator/reels/', '?ig_plugin_worker=1', opposite);
await new Promise(setImmediate);
oppositeWorker.poll();
assert.equal(oppositeWorker.pageReads(), 0, 'Reels 专用窗口不得重复采集当前页模式的达人资料');
console.log('Separate profile data window checks passed');
