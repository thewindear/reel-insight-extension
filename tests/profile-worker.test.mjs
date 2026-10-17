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
function start(pathname, search, settings, grid = []) {
  const location = { pathname, search, href: `https://www.instagram.com${pathname}${search}` };
  const isWorker = Boolean(search);
  let poll;
  let settingsListener;
  let pageReads = 0;
  let gridReads = 0;
  let profileHidden = false;
  let listener;
  let now = 10000;
  const events = new Map();
  const context = {
    exports: {}, URLSearchParams, location, Event, AbortController, Date: { now: () => now },
    document: {
      readyState: 'complete',
      /** 注册页面数据监听。 */ addEventListener(name, listener) { events.set(name, listener); },
      /** 请求页面已有缓存。 */ dispatchEvent() {},
      /** 本例没有内嵌 JSON。 */ querySelectorAll() { return []; },
    },
    /** 页面等待完成时推进虚拟时间。 */ setTimeout(callback, milliseconds) { now += milliseconds; callback(); },
    /** 测试主动触发周期读取。 */ setInterval(callback) { poll = callback; return 1; },
    browser: {
      storage: {
        local: { /** 读取每个窗口各自的采集配置。 */ async get() { return { settings }; } },
        onChanged: { /** 保留配置变更监听器供取消任务检查。 */ addListener(value) { settingsListener = value; } },
      },
      runtime: {
        id: 'extension-id',
        onMessage: { /** 保留记录页控制消息以检查任务隔离。 */ addListener(value) { listener = value; } },
        /** 提供记录页来源地址。 */ getURL(path) { return `chrome-extension://extension-id${path}`; },
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
      if (name === '../reel/extract') return { mergeProfiles, profileFromPageEvent: value => value,
        /** 本例没有 Reel 网络响应。 */ findReels: () => [],
        /** 本例没有达人网络响应。 */ findProfile: () => null };
      if (name === './page') return { readFeedAuthor: () => null,
        /** 记录是否在来源页读取了达人 DOM。 */
        readProfilePage: () => { pageReads++; return profileHidden ? null : base; },
        /** 本例仅采集达人资料。 */ readProfileReels: () => { gridReads++; return grid; },
        /** 本例没有当前 Reel。 */ readActiveReel: () => null,
        /** 模拟账户简介补全。 */
        collectProfileAbout: async () => { aboutCalls++; return { ...base, joinedAt: '2024年12月', basedIn: '美国' }; },
      };
      throw new Error(`Unexpected import: ${name}`);
    },
  };
  runInNewContext(compiled, context);
  context.exports.startReelReader();
  return { /** 模拟滚动后主页头部被虚拟化移除。 */ hideProfile: () => { profileHidden = true; },
    /** 检查资料任务是否尝试读取视频网格。 */ gridReads: () => gridReads,
    /** 从本扩展记录页发起批量补全请求。 */ request: type => {
      let reply;
      listener({ type }, { id: 'extension-id', url: 'chrome-extension://extension-id/viewer.html' }, value => { reply = value; });
      return reply;
    },
    /** 推进资料稳定等待时间。 */ advance: milliseconds => { now += milliseconds; },
    /** 模拟主页接口返回完整资料。 */ profile: value => events.get('instagram-plugin:profile')({ detail: value }),
    /** 触发内容脚本读取。 */ poll: () => poll(), /** 查看达人 DOM 读取次数。 */ pageReads: () => pageReads,
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

// 推荐页打开的资料窗口必须采集完整主页字段，即使主页采集位置原本为当前页。
const feedSettings = { autoFeed: true, autoFeedProfiles: true, autoProfileData: false, autoProfile: true,
  profileDataMode: 'current-tab', profileMode: 'new-tab' };
const feedDetails = start('/creator/', '?ig_plugin_worker=1&ig_plugin_feed_profile=1', feedSettings);
await new Promise(setImmediate);
const beforeFeedDone = finished.length;
feedDetails.poll();
await new Promise(setImmediate);
feedDetails.profile({ ...base, biography: 'Complete bio', externalUrl: 'https://one.example/',
  bioLinks: ['https://one.example/', 'https://two.example/'], bioLinksComplete: true });
feedDetails.poll();
await new Promise(setImmediate);
assert.equal(finished.length, beforeFeedDone, '主页资料尚未稳定时不能提前关闭窗口');
feedDetails.advance(2000);
feedDetails.poll();
await new Promise(setImmediate);
assert.equal(saved.at(-1).profile.biography, 'Complete bio');
assert.deepEqual(saved.at(-1).profile.bioLinks, ['https://one.example/', 'https://two.example/']);
assert.equal(finished.length, beforeFeedDone + 1);
assert.equal(finished.at(-1).kind, 'profile', '推荐页补全只能执行达人详情采集');

const timedOutDetails = start('/creator/', '?ig_plugin_worker=1&ig_plugin_feed_profile=1', feedSettings);
await new Promise(setImmediate);
timedOutDetails.advance(30000);
timedOutDetails.poll();
await new Promise(setImmediate);
assert.equal(finished.at(-1).kind, 'cancelled', '达人详情加载超时应关闭任务，不能永久阻塞推荐页');

// 即使全局列表采集已开启，带推荐页资料任务标记的窗口也不能读取或启动列表采集。
for (const profileMode of ['new-tab', 'current-tab']) {
  const settings = { ...feedSettings, profileMode };
  const beforeOpened = opened.length;
  const isolated = start('/creator/reels/', '?ig_plugin_worker=1&ig_plugin_feed_profile=1', settings,
    [{ code: 'SHOULD_NOT_COLLECT', authors: [{ username: 'creator' }], plays: 100 }]);
  await new Promise(setImmediate);
  isolated.poll();
  await new Promise(setImmediate);
  isolated.advance(2000);
  isolated.poll();
  await new Promise(setImmediate);
  assert.equal(isolated.gridReads(), 0, '资料补全窗口不得读取、滚动或打开达人 Reels 网格');
  assert.equal(isolated.request('START_PROFILE_ENRICHMENT').accepted, false, '资料任务不能通过消息切换为视频列表采集');
  assert.equal(opened.length, beforeOpened, '资料任务不能再启动视频采集窗口');
  assert.equal(settings.autoProfile, true, '隔离任务不能关闭用户的全局自动列表采集配置');
  assert.equal(finished.at(-1).kind, 'profile');
}

// 资料与目标播放数从同一个 Reels 页面获取，不启动第二页或批量列表采集。
const beforeCombinedDone = finished.length;
const combinedWorker = start('/creator/reels/', '?ig_plugin_worker=1&ig_plugin_feed_profile=1&ig_plugin_profile_plays=TARGET',
  { ...feedSettings, profilePages: 1 }, [{ code: 'TARGET', plays: 4567, authors: [{ username: 'creator' }] }]);
await new Promise(setImmediate);
combinedWorker.poll();
await new Promise(setImmediate);
combinedWorker.profile({ ...base, biography: 'Combined bio', bioLinks: ['https://combined.example/'], bioLinksComplete: true });
combinedWorker.poll();
await new Promise(setImmediate);
combinedWorker.poll();
await new Promise(setImmediate);
combinedWorker.hideProfile();
combinedWorker.advance(2000);
combinedWorker.poll();
await new Promise(setImmediate);
assert.equal(finished.length, beforeCombinedDone + 1);
assert.equal(finished.at(-1).kind, 'profile');
assert.equal(finished.at(-1).plays, 4567);
assert.equal(saved.at(-1).profile.biography, 'Combined bio');
assert.deepEqual(saved.at(-1).profile.bioLinks, ['https://combined.example/']);
assert.equal(combinedWorker.request('START_PROFILE_ENRICHMENT').accepted, false, '同页补播放数不代表允许采集整个列表');
