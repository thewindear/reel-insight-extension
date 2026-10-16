import { profileUsername } from '../src/reel/profile-url';

/** 校验打开请求来自当前 Instagram Reel，并返回其 shortcode。 */
function reelCode(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const page = new URL(url);
    if (page.protocol !== 'https:' || page.hostname !== 'www.instagram.com') return null;
    return page.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?reels?\/([A-Za-z0-9_-]+)\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** 注册受控的记录保存、抽屉打开和清空操作。 */
export default defineBackground(() => {
  // 扩展更新后先清理旧记录里的分享字段，再处理新的保存请求。
  let storageQueue = browser.storage.local.get('reels').then(async stored => {
    const records = Array.isArray(stored.reels) ? stored.reels as SavedReel[] : [];
    if (records.some(row => row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'shares'))) {
      await browser.storage.local.set({ reels: withoutShares(records) });
    }
  }).catch(() => {});
  /** 校验消息来源，并处理记录写入、专用采集标签页与抽屉请求。 */
  const onMessage: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (message, sender, sendResponse) => {
    if (message?.type === 'SAVE_REEL' || message?.type === 'CLEAR_REELS' || message?.type === 'SAVE_PROFILE' || message?.type === 'CLEAR_PROFILES') {
      const reel = message.type === 'SAVE_REEL' ? reelFromPageEvent(message.reel) : null;
      const profile = message.type === 'SAVE_PROFILE' ? profileFromPageEvent(message.profile) : null;
      const validSave = reel && sender.id === browser.runtime.id &&
        sender.url?.startsWith('https://www.instagram.com/') &&
        typeof sender.tab?.id === 'number' && reelCode(message.url) === reel.code;
      const validProfile = profile && sender.id === browser.runtime.id &&
        sender.url?.startsWith('https://www.instagram.com/') &&
        typeof sender.tab?.id === 'number' && profileUsername(message.url)?.toLowerCase() === profile.username.toLowerCase();
      const validClear = (message.type === 'CLEAR_REELS' || message.type === 'CLEAR_PROFILES') && sender.id === browser.runtime.id &&
        sender.url?.startsWith(browser.runtime.getURL('/viewer.html'));
      if (!validSave && !validProfile && !validClear) return;
      // 同时打开多个 Reel 时，串行读写避免旧快照覆盖新记录；清空也排在同一队列中。
      const action = storageQueue.then(async () => {
        if (validClear) await browser.storage.local.remove(message.type === 'CLEAR_REELS' ? 'reels' : 'profiles');
        else if (validProfile) {
          const stored = await browser.storage.local.get('profiles');
          const records = Array.isArray(stored.profiles) ? stored.profiles as SavedProfile[] : [];
          await browser.storage.local.set({ profiles: upsertProfile(records, profile, new Date().toISOString()) });
        } else {
          const stored = await browser.storage.local.get('reels');
          const records = Array.isArray(stored.reels) ? stored.reels as SavedReel[] : [];
          await browser.storage.local.set({ reels: upsertReel(records, reel!, new Date().toISOString()) });
        }
      });
      storageQueue = action.then(() => {}, () => {});
      void action.then(() => sendResponse({ saved: true }), () => sendResponse({ saved: false }));
      return true;
    }
    if (message?.type === 'OPEN_PROFILE_WORKER') {
      const tabId = sender.tab?.id;
      const profile = typeof message.url === 'string' ? profileUsername(message.url) : null;
      if (sender.id !== browser.runtime.id || typeof tabId !== 'number' ||
        !sender.url?.startsWith('https://www.instagram.com/') ||
        !profile || message.profile !== profile ||
        (message.target !== 'profile' && message.target !== 'reels') ||
        new URL(message.url).searchParams.has('ig_plugin_worker')) return;
      const key = `profileWorker:${tabId}`;
      // 先让采集页成为活动页面，待资料保存或首批 Reel 开始处理后再切回来源页。
      void browser.storage.session.get(key).then(async stored => {
        const previous = stored[key] as { tabId?: unknown; windowId?: unknown; profile?: unknown; target?: unknown } | undefined;
        if (previous?.profile === profile && previous.target === message.target && typeof previous.tabId === 'number' &&
          typeof previous.windowId === 'number' &&
          await browser.tabs.get(previous.tabId).then(() => true, () => false)) return previous.tabId;
        if (typeof previous?.tabId === 'number') {
          await browser.tabs.remove(previous.tabId).catch(() => {});
          await browser.storage.session.remove(`profileWorkerTab:${previous.tabId}`);
        }
        const window = await browser.windows.create({
          url: `https://www.instagram.com/${profile}/${message.target === 'reels' ? 'reels/' : ''}?ig_plugin_worker=1`, focused: true,
        });
        if (typeof window?.id !== 'number') throw new Error('Missing worker window ID');
        const [worker] = await browser.tabs.query({ windowId: window.id, active: true });
        if (typeof worker?.id !== 'number') {
          await browser.windows.remove(window.id);
          throw new Error('Missing worker tab ID');
        }
        await browser.storage.session.set({
          [key]: { tabId: worker.id, windowId: window.id, profile, target: message.target },
          [`profileWorkerTab:${worker.id}`]: { sourceTabId: tabId, profile },
        });
        return worker.id;
      }).then(workerTabId => sendResponse({ tabId: workerTabId }), () => sendResponse({ error: true }));
      return true;
    }
    if (message?.type === 'PROFILE_WORKER_STARTED') {
      const tabId = sender.tab?.id;
      if (sender.id !== browser.runtime.id || typeof tabId !== 'number' ||
        !sender.url?.startsWith('https://www.instagram.com/') || typeof message.profile !== 'string') return;
      const reverseKey = `profileWorkerTab:${tabId}`;
      void browser.storage.session.get(reverseKey).then(async stored => {
        const binding = stored[reverseKey] as { sourceTabId?: unknown; profile?: unknown } | undefined;
        if (!binding || binding.profile !== message.profile || typeof binding.sourceTabId !== 'number') return false;
        const source = await browser.tabs.get(binding.sourceTabId);
        if (typeof source.windowId !== 'number') return false;
        await browser.tabs.update(binding.sourceTabId, { active: true });
        await browser.windows.update(source.windowId, { focused: true });
        return true;
      }).then(accepted => sendResponse({ accepted }), () => sendResponse({ accepted: false }));
      return true;
    }
    if (message?.type === 'PROFILE_WORKER_DONE') {
      const tabId = sender.tab?.id;
      const counts = message.progress;
      if (sender.id !== browser.runtime.id || typeof tabId !== 'number' ||
        !sender.url?.startsWith('https://www.instagram.com/') ||
        typeof message.profile !== 'string' ||
        (message.kind !== undefined && message.kind !== 'profile' && message.kind !== 'cancelled') ||
        !counts || ![counts.completed, counts.total, counts.failed].every(value => Number.isSafeInteger(value) && value >= 0)) return;
      const reverseKey = `profileWorkerTab:${tabId}`;
      void browser.storage.session.get(reverseKey).then(stored => {
        const binding = stored[reverseKey] as { sourceTabId?: unknown; profile?: unknown } | undefined;
        if (!binding || binding.profile !== message.profile || typeof binding.sourceTabId !== 'number') {
          sendResponse({ accepted: false });
          return;
        }
        const sourceTabId = binding.sourceTabId;
        sendResponse({ accepted: true });
        const notice = message.kind === 'cancelled' ? Promise.resolve() : browser.tabs.sendMessage(sourceTabId, {
          type: 'PROFILE_COLLECTION_COMPLETE', profile: binding.profile,
          progress: { completed: counts.completed, total: counts.total, failed: counts.failed },
          ...(message.kind === 'profile' ? { kind: 'profile' } : {}),
        }).catch(() => {});
        void notice.then(async () => {
          await browser.tabs.remove(tabId).catch(() => {});
          const sourceKey = `profileWorker:${sourceTabId}`;
          const current = (await browser.storage.session.get(sourceKey))[sourceKey] as { tabId?: unknown } | undefined;
          await browser.storage.session.remove(current?.tabId === tabId ? [sourceKey, reverseKey] : reverseKey);
        }).catch(() => {});
      }).catch(() => sendResponse({ accepted: false }));
      return true;
    }
    if (message?.type !== 'OPEN_REEL_DRAWER') return;
    const tab = sender.tab;
    // 页面内导航后 sender.url 可能仍是首次注入地址；tab.url 也可能因权限不可用。
    // 内容脚本在点击时提交当前地址，后台同时校验真实消息来源与 Reel 或达人页地址。
    if (sender.id !== browser.runtime.id || typeof tab?.id !== 'number' ||
      !sender.url?.startsWith('https://www.instagram.com/') ||
      typeof message.url !== 'string' ||
      !(typeof message.code === 'string' && reelCode(message.url) === message.code ||
        typeof message.profile === 'string' && profileUsername(message.url) === message.profile)) return;
    sendResponse({ tabId: tab.id });
  };
  browser.runtime.onMessage.addListener(onMessage);

  /** 插件图标打开当前 Instagram 页面抽屉；脚本尚未注入时打开独立记录页。 */
  browser.action.onClicked.addListener(tab => {
    if (typeof tab.id !== 'number') return;
    void browser.tabs.sendMessage(tab.id, { type: 'OPEN_REEL_DRAWER', tabId: tab.id }).then(
      reply => { if (reply?.opened !== true) return browser.tabs.create({ url: browser.runtime.getURL('/viewer.html') }); },
      () => browser.tabs.create({ url: browser.runtime.getURL('/viewer.html') }),
    );
  });
});
import { reelFromPageEvent } from '../src/reel/extract';
import { profileFromPageEvent } from '../src/reel/extract';
import { upsertProfile, upsertReel, withoutShares } from '../src/reel/records';
import type { SavedProfile, SavedReel } from '../src/reel/records';

