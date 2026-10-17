import { settingsFrom } from '../src/reel/settings';
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
    if (message?.type === 'CANCEL_REEL_PLAYS' || message?.type === 'CANCEL_FEED_PROFILE') {
      const tabId = sender.tab?.id;
      if (sender.id !== browser.runtime.id || typeof tabId !== 'number' || !sender.url?.startsWith('https://www.instagram.com/')) return;
      const key = `${message.type === 'CANCEL_FEED_PROFILE' ? 'profileWorker' : 'reelPlaysWorker'}:${tabId}`;
      void browser.storage.session.get(key).then(async stored => {
        const binding = stored[key] as { tabId?: unknown; feedProfile?: unknown; nextPlaysCode?: unknown } | undefined;
        if (message.type === 'CANCEL_FEED_PROFILE' && binding?.feedProfile !== true) { sendResponse({ accepted: false }); return; }
        if (typeof binding?.tabId === 'number') await browser.tabs.remove(binding.tabId).catch(() => {});
        sendResponse({ accepted: true });
      }).catch(() => sendResponse({ accepted: false }));
      return true;
    }
    if (message?.type === 'OPEN_PROFILE_WORKER') {
      const tabId = sender.tab?.id;
      const profile = typeof message.url === 'string' ? profileUsername(message.url) : null;
      if (sender.id !== browser.runtime.id || typeof tabId !== 'number' ||
        !sender.url?.startsWith('https://www.instagram.com/') ||
        !profile || message.profile !== profile ||
        (message.target !== 'profile' && message.target !== 'reels' && message.target !== 'plays') ||
        (message.feedProfile === true && message.target !== 'profile') ||
        (message.playsCode !== undefined && (message.feedProfile !== true || typeof message.playsCode !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(message.playsCode))) ||
        (message.target === 'plays' && (typeof message.code !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(message.code))) ||
        new URL(message.url).searchParams.has('ig_plugin_worker')) return;
      const key = `${message.target === 'plays' ? 'reelPlaysWorker' : 'profileWorker'}:${tabId}`;
      // 先让采集页成为活动页面，待资料保存或首批 Reel 开始处理后再切回来源页。
      void browser.storage.session.get(key).then(async stored => {
        if (message.target === 'plays') {
          const data = await browser.storage.local.get('reels');
          const records = Array.isArray(data.reels) ? data.reels as SavedReel[] : [];
          if (!records.some(row => row.code === message.code && row.plays === null &&
            row.authors[0]?.username.toLowerCase() === profile.toLowerCase())) throw new Error('Missing collected Reel');
        }
        const previous = stored[key] as { tabId?: unknown; windowId?: unknown; profile?: unknown; target?: unknown; code?: unknown; feedProfile?: unknown; nextPlaysCode?: unknown } | undefined;
        if (previous?.profile === profile && previous.target === message.target && previous.code === message.code && Boolean(previous.feedProfile) === (message.feedProfile === true) && typeof previous.tabId === 'number' &&
          typeof previous.windowId === 'number' &&
          await browser.tabs.get(previous.tabId).then(() => true, () => false)) return previous.tabId;
        if (typeof previous?.tabId === 'number') {
          await browser.tabs.remove(previous.tabId).catch(() => {});
          await browser.storage.session.remove(`profileWorkerTab:${previous.tabId}`);
        }
        const window = await browser.windows.create({
          url: `https://www.instagram.com/${profile}/${message.target === 'profile' && !message.playsCode ? '' : 'reels/'}?ig_plugin_worker=1${message.target === 'plays' ? `&ig_plugin_plays=${encodeURIComponent(message.code)}` : ''}${message.feedProfile === true ? '&ig_plugin_feed_profile=1' : ''}${message.playsCode ? `&ig_plugin_profile_plays=${encodeURIComponent(message.playsCode)}` : ''}`, focused: true,
        });
        if (typeof window?.id !== 'number') throw new Error('Missing worker window ID');
        const [worker] = await browser.tabs.query({ windowId: window.id, active: true });
        if (typeof worker?.id !== 'number') {
          await browser.windows.remove(window.id);
          throw new Error('Missing worker tab ID');
        }
        await browser.storage.session.set({
          [key]: { tabId: worker.id, windowId: window.id, profile, target: message.target, ...(message.feedProfile === true ? { feedProfile: true, ...(message.playsCode ? { nextPlaysCode: message.playsCode } : {}) } : {}), ...(message.target === 'plays' ? { code: message.code } : {}) },
          [`profileWorkerTab:${worker.id}`]: { sourceTabId: tabId, profile, ...(message.feedProfile === true ? { feedProfile: true, ...(message.playsCode ? { nextPlaysCode: message.playsCode } : {}) } : {}), ...(message.target === 'plays' ? { code: message.code } : {}) },
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
        (message.kind !== undefined && message.kind !== 'profile' && message.kind !== 'cancelled' && message.kind !== 'plays') ||
        ((message.kind === 'plays' || message.plays !== undefined) && message.plays !== null && (!Number.isSafeInteger(message.plays) || message.plays < 0)) ||
        !counts || ![counts.completed, counts.total, counts.failed].every(value => Number.isSafeInteger(value) && value >= 0)) return;
      const reverseKey = `profileWorkerTab:${tabId}`;
      void browser.storage.session.get(reverseKey).then(async stored => {
        const binding = stored[reverseKey] as { sourceTabId?: unknown; profile?: unknown; code?: unknown; feedProfile?: unknown; nextPlaysCode?: unknown } | undefined;
        if (!binding || binding.profile !== message.profile || typeof binding.sourceTabId !== 'number') {
          sendResponse({ accepted: false });
          return;
        }
        if (message.kind === 'plays' && typeof binding.code !== 'string' ||
          typeof binding.code === 'string' && message.kind !== 'plays' && message.kind !== 'cancelled') {
          sendResponse({ accepted: false }); return;
        }
        const sourceTabId = binding.sourceTabId;
        let filled = false;
        const targetCode = message.kind === 'plays' ? binding.code :
          binding.feedProfile === true && message.kind === 'profile' ? binding.nextPlaysCode : undefined;
        if (typeof targetCode === 'string' && message.plays !== null && message.plays !== undefined) {
          // 只更新绑定目标的已有记录；串行写入避免覆盖同时到来的数据或恢复已清空记录。
          const action = storageQueue.then(async () => {
            const stored = await browser.storage.local.get(['reels', 'settings']);
            const settings = settingsFrom(stored.settings);
            if (!settings.autoFeed || !settings.autoFeedPlays) return;
            const records = Array.isArray(stored.reels) ? stored.reels as SavedReel[] : [];
            const target = records.find(row => row.code === targetCode &&
              row.authors[0]?.username.toLowerCase() === String(binding.profile).toLowerCase());
            if (!target || target.plays !== null) return;
            await browser.storage.local.set({ reels: records.map(row => row === target ?
              { ...row, plays: message.plays, savedAt: new Date().toISOString() } : row) });
            filled = true;
          });
          storageQueue = action.then(() => {}, () => {});
          await action;
        }
        sendResponse({ accepted: true });
        const notice = binding.feedProfile === true ? browser.tabs.sendMessage(sourceTabId, {
          type: 'FEED_PROFILE_COMPLETE', profile: binding.profile,
          ...(typeof binding.nextPlaysCode === 'string' ? { completedPlaysCode: binding.nextPlaysCode } : {}),
        }).catch(() => {}) : typeof binding.code === 'string' ? browser.tabs.sendMessage(sourceTabId, {
          type: 'REEL_PLAYS_COMPLETE', code: binding.code, filled,
        }).catch(() => {}) : message.kind === 'cancelled' ? Promise.resolve() : browser.tabs.sendMessage(sourceTabId, {
          type: 'PROFILE_COLLECTION_COMPLETE', profile: binding.profile,
          progress: { completed: counts.completed, total: counts.total, failed: counts.failed },
          ...(message.kind === 'profile' ? { kind: 'profile' } : {}),
        }).catch(() => {});
        void notice.then(async () => {
          await browser.tabs.remove(tabId).catch(() => {});
          const sourceKey = `${typeof binding.code === 'string' ? 'reelPlaysWorker' : 'profileWorker'}:${sourceTabId}`;
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

  /** 用户关闭补播放数窗口时解除来源页等待，并清理该窗口的任务绑定。 */
  browser.tabs.onRemoved?.addListener(tabId => {
    const reverseKey = `profileWorkerTab:${tabId}`;
    void browser.storage.session.get(reverseKey).then(async stored => {
      const binding = stored[reverseKey] as { sourceTabId?: unknown; code?: unknown; profile?: unknown; feedProfile?: unknown; nextPlaysCode?: unknown } | undefined;
      if (typeof binding?.sourceTabId !== 'number' || typeof binding.code !== 'string' && binding.feedProfile !== true) return;
      await browser.tabs.sendMessage(binding.sourceTabId, binding.feedProfile === true ?
        { type: 'FEED_PROFILE_COMPLETE', profile: binding.profile } :
        { type: 'REEL_PLAYS_COMPLETE', code: binding.code, filled: false }).catch(() => {});
      const sourceKey = `${binding.feedProfile === true ? 'profileWorker' : 'reelPlaysWorker'}:${binding.sourceTabId}`;
      const current = (await browser.storage.session.get(sourceKey))[sourceKey] as { tabId?: unknown } | undefined;
      await browser.storage.session.remove(current?.tabId === tabId ? [sourceKey, reverseKey] : reverseKey);
    }).catch(() => {});
  });

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

