import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { profileFromPageEvent, reelFromPageEvent } from '../src/reel/extract.ts';
import { profileUsername } from '../src/reel/profile-url.ts';

const source = readFileSync(new URL('../entrypoints/background.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
let listener;
let actionClick;
let contentAvailable = true;
const createdTabs = [];
const workerWindows = [];
const removedTabs = [];
const focusedTabs = [];
const focusedWindows = [];
const session = new Map();
const contentMessages = [];
let stored = [];
let storedProfiles = [];
const browser = {
  runtime: {
    id: 'extension-id',
    /** 将扩展内部页面路径转为测试地址。 */
    getURL(path) { return `chrome-extension://extension-id${path}`; },
    onMessage: {
      /** 保存后台监听器以模拟内容脚本消息。 */
      addListener(value) { listener = value; },
    },
  },
  action: {
    onClicked: {
      /** 保存扩展图标的点击回调。 */
      addListener(value) { actionClick = value; },
    },
  },
  tabs: {
    /** 确认之前开启的采集标签页仍存在。 */
    async get(tabId) {
      if (tabId === 7) return { id: 7, windowId: 3 };
      if (tabId !== 10 || removedTabs.includes(tabId)) throw new Error('Tab closed');
      return { id: tabId, windowId: 20 };
    },
    /** 采集真正开始后重新激活发起采集的标签页。 */
    async update(tabId, details) { focusedTabs.push({ tabId, details }); },
    /** 返回独立窗口中处于活动状态的采集标签页。 */
    async query() { return [{ id: 10, windowId: 20 }]; },
    /** 模拟通知 Instagram 内容脚本打开抽屉。 */
    sendMessage(tabId, message) { contentMessages.push({ tabId, message }); return contentAvailable ? Promise.resolve({ opened: true }) : Promise.reject(new Error('missing content script')); },
    /** 记录内容脚本不可用时打开的独立记录页。 */
    create(details) { createdTabs.push(details); return Promise.resolve({ id: 8 + createdTabs.length }); },
    /** 自动采集完成后只关闭采集标签页。 */
    async remove(tabId) { removedTabs.push(tabId); },
  },
  windows: {
    /** 在不抢焦点的窗口中加载 Instagram。 */
    async create(details) { workerWindows.push(details); return { id: 20 }; },
    /** 采集真正开始后将来源窗口重新置前。 */
    async update(windowId, details) { focusedWindows.push({ windowId, details }); },
    /** 仅在窗口内无法取得标签页时清理空窗口。 */
    async remove() { throw new Error('Should not remove the whole window'); },
  },
  storage: { session: {
    /** 读取来源标签页与采集标签页的绑定。 */
    async get(key) { return { [key]: session.get(key) }; },
    /** 保存绑定以便后台休眠后复用。 */
    async set(value) { for (const [key, item] of Object.entries(value)) session.set(key, item); },
    /** 完成后删除来源与采集页绑定。 */
    async remove(keys) { for (const key of keys) session.delete(key); },
  }, local: {
    /** 返回后台当前保存的记录。 */
    async get() { return { reels: stored, profiles: storedProfiles }; },
    /** 保存测试记录。 */
    async set(value) { if ('reels' in value) stored = value.reels; if ('profiles' in value) storedProfiles = value.profiles; },
    /** 清空测试记录。 */
    async remove(key) { if (key === 'reels') stored = []; if (key === 'profiles') storedProfiles = []; },
  } },
};
runInNewContext(compiled, { exports: {}, browser, URL, Promise, Date, defineBackground: callback => callback(),
  /** 注入真实的页面字段校验和最小记录合并逻辑。 */
  require(name) {
    if (name === '../src/reel/extract') return { reelFromPageEvent, profileFromPageEvent };
    if (name === '../src/reel/profile-url') return { profileUsername };
    if (name === '../src/reel/records') return { upsertProfile: (rows, profile, savedAt) =>
      [{ ...rows.find(row => row.username === profile.username), ...profile, savedAt }, ...rows.filter(row => row.username !== profile.username)], upsertReel: (rows, reel, savedAt) =>
      [{ ...rows.find(row => row.code === reel.code), ...reel, savedAt }, ...rows.filter(row => row.code !== reel.code)] };
    throw new Error(`Unexpected import: ${name}`);
  },
});

const sender = { id: 'extension-id', url: 'https://www.instagram.com/reels/ABC123/', tab: { id: 7, windowId: 3, url: 'https://www.instagram.com/reels/ABC123/' } };
/** 模拟内容脚本等待后台响应。 */
function open(message, from = sender) {
  return new Promise(resolve => listener(message, from, resolve));
}

assert.equal((await open({ type: 'OPEN_REEL_DRAWER', code: 'ABC123', url: sender.url })).tabId, 7);
assert.equal(createdTabs.length, 0);

actionClick({ id: 7 });
await new Promise(setImmediate);
assert.equal(JSON.stringify(contentMessages), JSON.stringify([{ tabId: 7, message: { type: 'OPEN_REEL_DRAWER', tabId: 7 } }]));
assert.equal(createdTabs.length, 0);

contentAvailable = false;
actionClick({ id: 7 });
await new Promise(setImmediate);
assert.equal(createdTabs[0].url, 'chrome-extension://extension-id/viewer.html');

const switched = { ...sender, tab: { id: 7, windowId: 3 } };
assert.equal((await open({ type: 'OPEN_REEL_DRAWER', code: 'NEXT456', url: 'https://www.instagram.com/reels/NEXT456/' }, switched)).tabId, 7);
assert.equal((await open({ type: 'OPEN_REEL_DRAWER', profile: 'creator', url: 'https://www.instagram.com/creator/' }, switched)).tabId, 7);
assert.equal((await open({ type: 'OPEN_REEL_DRAWER', profile: 'creator', url: 'https://www.instagram.com/creator/reels/' }, switched)).tabId, 7);
const workerRequest = { type: 'OPEN_PROFILE_WORKER', profile: 'creator', url: 'https://www.instagram.com/creator/reels/', target: 'reels' };
assert.equal((await open(workerRequest, switched)).tabId, 10);
assert.equal(workerWindows[0].focused, true);
assert.equal(workerWindows[0].url, 'https://www.instagram.com/creator/reels/?ig_plugin_worker=1');
assert.equal((await open(workerRequest, switched)).tabId, 10, '刷新来源页后应复用采集标签页');
assert.equal(workerWindows.length, 1);
assert.equal((await open({ ...workerRequest, url: 'https://www.instagram.com/creator/' }, switched)).tabId, 10, '达人主页应复用同一采集窗口');
assert.equal(listener({ ...workerRequest, url: 'https://example.com/creator/reels/' }, switched, () => {}), undefined);
const workerSender = { id: 'extension-id', url: workerWindows[0].url, tab: { id: 10, windowId: 20 } };
assert.equal((await open({ type: 'PROFILE_WORKER_STARTED', profile: 'other' }, workerSender)).accepted, false);
assert.equal((await open({ type: 'PROFILE_WORKER_STARTED', profile: 'creator' }, workerSender)).accepted, true);
assert.equal(JSON.stringify(focusedTabs), JSON.stringify([{ tabId: 7, details: { active: true } }]));
assert.equal(JSON.stringify(focusedWindows), JSON.stringify([{ windowId: 3, details: { focused: true } }]));
const completed = { type: 'PROFILE_WORKER_DONE', profile: 'creator', progress: { completed: 2, total: 2, failed: 0 } };
assert.equal((await open({ ...completed, profile: 'other' }, workerSender)).accepted, false);
assert.equal((await open(completed, workerSender)).accepted, true);
await new Promise(setImmediate);
assert.equal(JSON.stringify(contentMessages.at(-1)), JSON.stringify({ tabId: 7, message: { type: 'PROFILE_COLLECTION_COMPLETE', profile: 'creator', progress: completed.progress } }));
assert.deepEqual(removedTabs, [10]);
assert.equal(session.has('profileWorker:7'), false);
const profileWorkerRequest = { ...workerRequest, url: 'https://www.instagram.com/creator/', target: 'profile' };
assert.equal((await open(profileWorkerRequest, switched)).tabId, 10);
assert.equal(workerWindows.at(-1).url, 'https://www.instagram.com/creator/?ig_plugin_worker=1', '达人资料独立窗口应打开主页');
const profileDone = { type: 'PROFILE_WORKER_DONE', profile: 'creator', kind: 'profile', progress: { completed: 1, total: 1, failed: 0 } };
assert.equal((await open(profileDone, workerSender)).accepted, true);
await new Promise(setImmediate);
assert.equal(JSON.stringify(contentMessages.at(-1)), JSON.stringify({ tabId: 7, message: { type: 'PROFILE_COLLECTION_COMPLETE', profile: 'creator', progress: profileDone.progress, kind: 'profile' } }));
assert.equal((await open(profileWorkerRequest, switched)).tabId, 10);
const beforeCancelNotices = contentMessages.length;
assert.equal((await open({ ...profileDone, kind: 'cancelled' }, workerSender)).accepted, true);
await new Promise(setImmediate);
assert.equal(contentMessages.length, beforeCancelNotices, '取消独立采集时不显示完成提示');
assert.equal(session.has('profileWorker:7'), false, '取消后清理采集窗口绑定');

assert.equal(listener({ type: 'OPEN_REEL_DRAWER', code: 'OTHER', url: sender.url }, sender, () => {}), undefined);
assert.equal(listener({ type: 'OPEN_REEL_DRAWER', profile: 'other', url: 'https://www.instagram.com/creator/' }, sender, () => {}), undefined);
assert.equal(listener({ type: 'OPEN_REEL_DRAWER', profile: 'explore', url: 'https://www.instagram.com/explore/' }, sender, () => {}), undefined);
assert.equal(listener({ type: 'OPEN_REEL_DRAWER', profile: 'creator', url: 'https://example.com/creator/' }, sender, () => {}), undefined);
assert.equal(listener({ type: 'OPEN_REEL_DRAWER', code: 'ABC123', url: 'https://example.com/reels/ABC123/' }, sender, () => {}), undefined);
assert.equal(listener({ type: 'OPEN_REEL_DRAWER', code: 'ABC123', url: {} }, sender, () => {}), undefined);
assert.equal(listener({ type: 'OPEN_REEL_DRAWER', code: 'ABC123', url: sender.url }, { ...sender, url: 'https://example.com/reels/ABC123/' }, () => {}), undefined);
assert.equal(createdTabs.length, 1);

const sample = { code: 'ABC123', authors: [{ username: 'creator' }], taggedUsers: [], plays: 0 };
assert.equal((await open({ type: 'SAVE_REEL', reel: sample, url: sender.url })).saved, true);
assert.equal(stored.length, 1);
assert.equal(stored[0].plays, 0);
assert.equal((await open({ type: 'SAVE_REEL', reel: { ...sample, plays: 12 }, url: sender.url })).saved, true);
assert.equal(stored.length, 1);
assert.equal(stored[0].plays, 12);
const profile = { username: 'creator', name: 'Creator', bioLinks: ['https://example.com'], followers: 0 };
assert.equal((await open({ type: 'SAVE_PROFILE', profile, url: 'https://www.instagram.com/creator/' }, switched)).saved, true);
assert.equal(storedProfiles.length, 1);
assert.equal(storedProfiles[0].followers, 0);
assert.equal(listener({ type: 'SAVE_PROFILE', profile, url: 'https://www.instagram.com/other/' }, switched, () => {}), undefined);
assert.equal(listener({ type: 'CLEAR_PROFILES' }, switched, () => {}), undefined);
assert.equal((await open({ type: 'CLEAR_PROFILES' }, { id: 'extension-id', url: 'chrome-extension://extension-id/viewer.html' })).saved, true);
assert.equal(storedProfiles.length, 0);
assert.equal(listener({ type: 'SAVE_REEL', reel: sample, url: 'https://example.com/reel/ABC123/' }, sender, () => {}), undefined);
assert.equal(listener({ type: 'CLEAR_REELS' }, sender, () => {}), undefined);
assert.equal((await open({ type: 'CLEAR_REELS' }, { id: 'extension-id', url: 'chrome-extension://extension-id/viewer.html' })).saved, true);
assert.equal(stored.length, 0);
console.log('Floating button open checks passed');
