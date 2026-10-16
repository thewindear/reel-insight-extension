import { findProfile, findReels, mergeProfiles, mergeReels, profileFromPageEvent, reelFromPageEvent } from '../reel/extract';
import { profileUsername } from '../reel/profile-url';
import { defaultSettings, settingsFrom } from '../reel/settings';
import type { Profile, ProfileProgress, Reel, ReelReply } from '../reel/types';
import { collectProfileAbout, readActiveReel, readProfilePage, readProfileReels } from './page';

/** 在隔离脚本中接收页面数据，并提供 popup 与悬浮按钮共用的读取方法。 */
export function startReelReader(signal?: AbortSignal): () => ReelReply {
  const reels = new Map<string, Reel>();
  const profiles = new Map<string, Profile>();
  const savedProfiles = new Map<string, string>();
  const savingProfiles = new Map<string, Promise<void>>();
  let aboutUsername = '';
  let aboutAttempted = false;
  let aboutTask: Promise<void> | null = null;
  let aboutController: AbortController | null = null;
  let manualProfileUsername = '';
  let parsedScripts = new WeakSet<HTMLScriptElement>();
  const saved = new Map<string, string>();
  const saving = new Map<string, Promise<boolean>>();
  let saveError = false;
  let progress: ProfileProgress = { state: 'idle', completed: 0, total: 0, failed: 0 };
  let progressPath = '';
  let runId = 0;
  let openedCode: string | null = null;
  let settings = defaultSettings;
  let settingsLoaded = false;
  const attempted = new Set<string>();
  let autoSuspended = false;
  let scanComplete = false;
  let stableScans = 0;
  let nextScanAt = 0;
  let pagesLoaded = 0;
  let awaitingPage = false;
  let pageSize = 0;
  let workerTabId: number | null = null;
  let workerRequested = false;
  let workerUsername = '';
  let workerTarget: 'profile' | 'reels' | '' = '';
  let completionSent = false;
  let sourceFocusRestored = false;
  let sourceFocusTask: Promise<void> | null = null;
  const worker = /(?:^\?|&)ig_plugin_worker=1(?:&|$)/.test(location.search);
  const workerPath = worker ? location.pathname : null;

  /** 配置变更后立即调整当前页面采集行为，并停止已关闭的自动任务。 */
  function onSettingsChanged(changes: Record<string, { newValue?: unknown }>, area: string): void {
    if (area !== 'local' || !('settings' in changes)) return;
    const previous = settings;
    settings = settingsFrom(changes.settings?.newValue);
    settingsLoaded = true;
    if ((previous.autoProfileData && !settings.autoProfileData) || previous.profileDataMode !== settings.profileDataMode) aboutController?.abort();
    if ((!previous.autoProfileData && settings.autoProfileData) || previous.profileDataMode !== settings.profileDataMode) {
      aboutAttempted = false;
      parsedScripts = new WeakSet<HTMLScriptElement>();
      workerRequested = false;
      workerTabId = null;
      workerUsername = '';
      workerTarget = '';
    }
    if ((previous.autoProfile && !settings.autoProfile || previous.profileMode !== settings.profileMode) &&
      (progress.state === 'running' || progress.state === 'scanning')) stopEnrichment();
    if (!previous.autoProfile && settings.autoProfile || previous.profileMode !== settings.profileMode) {
      attempted.clear();
      autoSuspended = false;
      scanComplete = false;
      stableScans = 0;
      nextScanAt = 0;
      pagesLoaded = 0;
      awaitingPage = false;
      workerRequested = false;
      workerTabId = null;
      workerUsername = '';
      workerTarget = '';
    }
    if (previous.profilePages !== settings.profilePages) {
      scanComplete = false;
      stableScans = 0;
      nextScanAt = 0;
    }
    if (!settings.autoProfileData && !settings.autoProfile) {
      workerRequested = false;
      workerTabId = null;
      workerUsername = '';
      workerTarget = '';
    }
    if (worker && !needsWorker()) cancelProfileWorker();
    if ((!previous.autoProfileData || previous.profileDataMode !== settings.profileDataMode) && collectProfileHere())
      document.dispatchEvent(new Event('instagram-plugin:request'));
  }
  browser.storage.onChanged.addListener(onSettingsChanged);
  void browser.storage.local.get('settings').then(stored => {
    if (!settingsLoaded) settings = settingsFrom(stored.settings);
    settingsLoaded = true;
    if (worker && !needsWorker()) cancelProfileWorker();
    if (collectProfileHere()) document.dispatchEvent(new Event('instagram-plugin:request'));
  }).catch(() => { settingsLoaded = true; });

  /** 只在配置指定的页面或专用采集窗口读取并保存达人资料。 */
  function collectProfileHere(): boolean {
    return !worker && manualProfileUsername === profileUsername(location.href)?.toLowerCase() ||
      settings.autoProfileData && (settings.profileDataMode === 'current-tab' ? !worker : worker);
  }

  /** 任一达人任务选择独立窗口时复用同一个采集窗口。 */
  function needsWorker(): boolean {
    return settings.autoProfileData && settings.profileDataMode === 'new-tab' ||
      settings.autoProfile && settings.profileMode === 'new-tab';
  }

  /** 合并相同 Reel，并限制长期浏览时的内存占用。 */
  function cacheReel(reel: Reel): void {
    reels.set(reel.code, mergeReels(reels.get(reel.code), reel));
    if (reels.size > 40) reels.delete(reels.keys().next().value!);
  }

  /** MAIN world 的事件视为外部输入，先校验再放入缓存。 */
  function onPageReel(event: Event): void {
    const reel = reelFromPageEvent((event as CustomEvent).detail);
    if (reel) cacheReel(reel);
  }
  /** 校验页面派发的达人资料，只缓存当前页面对应的账号。 */
  function onPageProfile(event: Event): void {
    if (!collectProfileHere()) return;
    const profile = profileFromPageEvent((event as CustomEvent).detail);
    if (profile && profile.username.toLowerCase() === profileUsername(location.href)?.toLowerCase()) cacheProfile(profile);
  }

  /** 合并同一达人的分批资料，并限制缓存大小。 */
  function cacheProfile(profile: Profile): void {
    const key = profile.username.toLowerCase();
    const previous = profiles.get(key);
    profiles.set(key, mergeProfiles(previous, profile));
    if (profiles.size > 40) profiles.delete(profiles.keys().next().value!);
  }
  document.addEventListener('instagram-plugin:reel', onPageReel);
  document.addEventListener('instagram-plugin:profile', onPageProfile);
  document.dispatchEvent(new Event('instagram-plugin:request'));

  /** 首次加载及页面内切换时只读取新增 JSON 脚本，避免重复解析旧数据。 */
  function readPageScripts(): void {
    for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/json"], script[type="application/ld+json"]')) {
      if (parsedScripts.has(script) || !script.textContent || script.textContent.length > 5_000_000) continue;
      parsedScripts.add(script);
      try {
        const payload = JSON.parse(script.textContent);
        const username = profileUsername(location.href);
        const profile = collectProfileHere() && username ? findProfile(payload, username) : null;
        if (profile) cacheProfile(profile);
        for (const reel of findReels(payload)) {
          cacheReel(reel);
        }
      } catch { /* 部分内嵌脚本不是 JSON。 */ }
    }
  }

  /** 让后台复用或开启同一达人的独立采集窗口。 */
  function openProfileWorker(username: string): void {
    const target = settings.autoProfile && settings.profileMode === 'new-tab' ? 'reels' : 'profile';
    if (workerRequested && workerUsername === username.toLowerCase() && workerTarget === target) return;
    workerRequested = true;
    workerUsername = username.toLowerCase();
    workerTarget = target;
    workerTabId = null;
    progressPath = location.pathname;
    void browser.runtime.sendMessage({ type: 'OPEN_PROFILE_WORKER', profile: username, url: location.href, target }).then(
      reply => {
        if (workerUsername !== username.toLowerCase() || workerTarget !== target) return;
        if (typeof reply?.tabId === 'number') workerTabId = reply.tabId;
        else progress.state = 'error';
      },
      () => { if (workerUsername === username.toLowerCase() && workerTarget === target) progress.state = 'error'; },
    );
  }

  /** 采集页处理完首条 Reel 后请求后台切回发起采集的标签页，失败时下次轮询重试。 */
  function restoreSourceFocus(): void {
    if (!worker || sourceFocusRestored || sourceFocusTask || progressPath !== workerPath ||
      progress.completed === 0 || !['running', 'scanning', 'done'].includes(progress.state)) return;
    sourceFocusTask = browser.runtime.sendMessage({ type: 'PROFILE_WORKER_STARTED', profile: workerPath?.split('/')[1] }).then(
      reply => { sourceFocusRestored = reply?.accepted === true; },
      () => {},
    ).finally(() => { sourceFocusTask = null; });
  }

  /** 确认本轮达人资料或 Reel 已保存后，通知后台关闭专用标签页。 */
  function finishProfileWorker(): void {
    const workerCollectsProfile = settings.autoProfileData && settings.profileDataMode === 'new-tab';
    const workerCollectsReels = settings.autoProfile && settings.profileMode === 'new-tab';
    const profileOnly = workerCollectsProfile && !workerCollectsReels;
    if (!worker || completionSent || progress.state !== 'done' ||
      (!profileOnly && (!workerCollectsReels || !scanComplete)) || progressPath !== workerPath) return;
    const username = workerPath.split('/')[1]?.toLowerCase();
    const profile = username ? profiles.get(username) : null;
    // 同时采集 Reels 时也要等达人资料写入成功，避免窗口提前关闭丢字段。
    if (workerCollectsProfile && (!profile || aboutTask || savedProfiles.get(username!) !== JSON.stringify(profile))) return;
    completionSent = true;
    void Promise.all([...saving.values(), ...savingProfiles.values(), ...(sourceFocusTask ? [sourceFocusTask] : [])]).then(() => browser.runtime.sendMessage({
      type: 'PROFILE_WORKER_DONE', profile: workerPath?.split('/')[1], progress: { ...progress },
      ...(profileOnly ? { kind: 'profile' } : {}),
    })).then(
      reply => { if (reply?.accepted !== true) { completionSent = false; progress.state = 'error'; } },
      () => { completionSent = false; progress.state = 'error'; },
    );
  }

  /** 配置不再需要独立窗口时请求后台关闭已绑定的采集标签页。 */
  function cancelProfileWorker(): void {
    if (!worker || completionSent) return;
    completionSent = true;
    void browser.runtime.sendMessage({
      type: 'PROFILE_WORKER_DONE', profile: workerPath?.split('/')[1], kind: 'cancelled',
      progress: { completed: 0, total: 0, failed: 0 },
    }).then(reply => { if (reply?.accepted !== true) completionSent = false; }, () => { completionSent = false; });
  }

  /** 读取当前详情或用户网格，并仅保存与页面链接对应的 Reel。 */
  function readCurrentReel(): ReelReply {
    if (document.readyState === 'loading' || !settingsLoaded) return { status: 'loading' };
    if (worker && !needsWorker()) {
      cancelProfileWorker();
      return { status: 'not-reel' };
    }
    const username = profileUsername(location.href);
    if (!username) aboutUsername = '';
    if (manualProfileUsername && manualProfileUsername !== username?.toLowerCase()) manualProfileUsername = '';
    if (username && !worker && needsWorker()) openProfileWorker(username);
    if (worker && username && !progressPath) progressPath = location.pathname;
    if (username && collectProfileHere()) {
      if (aboutUsername !== username.toLowerCase()) { aboutUsername = username.toLowerCase(); aboutAttempted = false; }
      readPageScripts();
      const page = readProfilePage();
      if (page) cacheProfile(page);
      const profile = profiles.get(username.toLowerCase());
      if (profile) void saveCurrentProfile(profile);
      // 先读取账户简介，Reel 采集队列会等待弹窗关闭后再启动。
      if (page && !aboutAttempted && !aboutTask &&
        (!profile?.joinedAt || !profile.basedIn || (profile.verified && !profile.verifiedAt))) {
        aboutAttempted = true;
        const controller = new AbortController();
        aboutController = controller;
        aboutTask = collectProfileAbout(username, controller.signal).then(found => {
          if (!collectProfileHere() || !found || profileUsername(location.href)?.toLowerCase() !== username.toLowerCase()) return;
          cacheProfile(found);
          void saveCurrentProfile(profiles.get(username.toLowerCase())!);
        }).catch(() => {}).finally(() => { aboutTask = null; if (aboutController === controller) aboutController = null; });
      }
      // 只采集达人资料时，完整记录保存后切回来源页并关闭独立窗口。
      const current = profiles.get(username.toLowerCase());
      if (worker && settings.profileDataMode === 'new-tab' &&
        !(settings.autoProfile && settings.profileMode === 'new-tab') && page && current && !aboutTask &&
        (aboutAttempted || current.joinedAt && current.basedIn && (!current.verified || current.verifiedAt)) &&
        savedProfiles.get(username.toLowerCase()) === JSON.stringify(current)) {
        progress = { state: 'done', completed: 1, total: 1, failed: 0 };
        restoreSourceFocus();
        finishProfileWorker();
      }
    }
    const profileReels = readProfileReels();
    if (profileReels.length) {
      if (progressPath !== location.pathname) {
        runId++;
        progressPath = location.pathname;
        progress = { state: 'idle', completed: 0, total: 0, failed: 0 };
        attempted.clear();
        autoSuspended = false;
        scanComplete = false;
        stableScans = 0;
        nextScanAt = 0;
        pagesLoaded = 0;
        awaitingPage = false;
        if (workerUsername !== username?.toLowerCase()) { workerRequested = false; workerTabId = null; }
      }
      if (pagesLoaded === 0) pagesLoaded = 1;
      // 一次主动下拉后出现的新条目算下一页；首屏后续渲染仍属于第一页。
      if (awaitingPage && profileReels.length > pageSize) {
        pagesLoaded++;
        awaitingPage = false;
        stableScans = 0;
      }
      readPageScripts();
      // 专用标签页仅采集创建时指定的达人，避免用户在该标签页继续浏览时误采集其他账号。
      if (settings.autoProfile && !aboutTask && !autoSuspended && !scanComplete &&
        (settings.profileMode === 'current-tab' ? !worker : worker && location.pathname === workerPath)) {
        for (const item of profileReels) {
          // 网格链接确认 shortcode 后才使用缓存，避免预加载的其他账号视频混入。
          void saveCurrentReel(mergeReels(reels.get(item.code), item));
        }
        const unseen = profileReels.filter(item => !attempted.has(item.code));
        if (progress.state !== 'running' && unseen.length) {
          stableScans = 0;
          scanComplete = false;
          startProfile(unseen, false);
        } else if (progress.state !== 'running' && !scanComplete && pagesLoaded >= settings.profilePages) {
          scanComplete = true;
          progress.state = 'done';
        } else if (progress.state !== 'running' && !scanComplete && Date.now() >= nextScanAt) {
          // 每次回到列表后向下加载更多条目；连续三次无新链接后停止主动滚动。
          pageSize = profileReels.length;
          awaitingPage = true;
          window.scrollTo(0, document.documentElement.scrollHeight);
          stableScans++;
          nextScanAt = Date.now() + 3000;
          progress.state = stableScans >= 3 ? 'done' : 'scanning';
          if (stableScans >= 3) scanComplete = true;
        }
      }
      restoreSourceFocus();
      finishProfileWorker();
      return { status: 'profile', progress: { ...progress }, ...(workerTabId && settings.autoProfile && settings.profileMode === 'new-tab' ? { workerTabId } : {}), ...(worker ? { workerHere: true } : {}) };
    }
    const current = readActiveReel();
    if (!current) return username ? { status: 'profile', progress: { ...progress }, hasReels: false } : { status: 'not-reel' };
    readPageScripts();
    const cached = reels.get(current.code);
    const reel = cached && current.reel ? mergeReels(current.reel, cached) : cached ?? current.reel;
    const autoSave = !/^\/reels(?:\/|$)/.test(location.pathname) || settings.autoFeed;
    if (reel && autoSave) void saveCurrentReel(reel);
    return reel ? { status: 'ready', reel, saveError, autoSave } : { status: 'loading' };
  }

  /** 为手动操作和自动配置共用同一条批量队列。 */
  function startProfile(items: Reel[], onlyMissingCaption: boolean): void {
    progressPath = location.pathname;
    progress = { state: 'running', completed: 0, total: items.length, failed: 0 };
    for (const item of items) {
      attempted.add(item.code);
      void saveCurrentReel(mergeReels(reels.get(item.code), item));
    }
    const id = ++runId;
    void enrichProfile(id, progressPath, items, onlyMissingCaption);
  }

  /** 仅在视频数据变化时交给后台持久化，失败后允许下次读取重试。 */
  async function saveCurrentReel(reel: Reel): Promise<boolean> {
    const serialized = JSON.stringify(reel);
    if (serialized === saved.get(reel.code)) return true;
    const pending = saving.get(reel.code);
    if (pending) {
      await pending;
      return saveCurrentReel(reel);
    }
    const task = browser.runtime.sendMessage({ type: 'SAVE_REEL', reel, url: reel.url }).then(
      reply => reply?.saved === true,
      () => false,
    ).then(success => {
      saveError = !success;
      if (success) {
        saved.set(reel.code, serialized);
        if (saved.size > 200) saved.delete(saved.keys().next().value!);
      }
      return success;
    }).finally(() => saving.delete(reel.code));
    saving.set(reel.code, task);
    return task;
  }

  /** 仅在当前达人资料变化时保存，失败后允许下一次轮询重试。 */
  async function saveCurrentProfile(profile: Profile): Promise<void> {
    if (!collectProfileHere()) return;
    const key = profile.username.toLowerCase();
    const serialized = JSON.stringify(profile);
    if (savedProfiles.get(key) === serialized) return;
    const pending = savingProfiles.get(key);
    if (pending) {
      await pending;
      return saveCurrentProfile(profile);
    }
    const task = browser.runtime.sendMessage({ type: 'SAVE_PROFILE', profile, url: location.href }).then(
      reply => { if (reply?.saved === true) savedProfiles.set(key, serialized); },
      () => {},
    ).finally(() => savingProfiles.delete(key));
    savingProfiles.set(key, task);
    await task;
  }

  /** 只识别正在自动打开的详情地址，避免回退用户自己的页面。 */
  function currentOpenedCode(): string | null {
    return location.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?reel\/([A-Za-z0-9_-]+)\/?$/)?.[1] ?? null;
  }

  /** 停止补全，并仅在仍停留于自动打开的 Reel 时返回原列表。 */
  function stopEnrichment(): void {
    runId++;
    autoSuspended = true;
    scanComplete = true;
    if (progress.state === 'running' || progress.state === 'scanning') progress.state = 'stopped';
    if (openedCode && currentOpenedCode() === openedCode) history.back();
    openedCode = null;
  }

  /** 等待 Instagram 的页面内导航和详情响应，不阻塞其他消息。 */
  function pause(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 250));
  }

  /** 逐条打开已加载的 Reel，自动模式采集所有新条目，手动模式只补 Caption。 */
  async function enrichProfile(id: number, path: string, items: Reel[], onlyMissingCaption: boolean): Promise<void> {
    try {
      const stored = await browser.storage.local.get('reels');
      const rows = Array.isArray(stored.reels) ? stored.reels as Array<{ code?: unknown; caption?: unknown }> : [];
      const captioned = new Set(rows.filter(row => typeof row?.code === 'string' &&
        typeof row.caption === 'string' && row.caption.trim()).map(row => row.code as string));
      const todo = onlyMissingCaption ? items.filter(item => !captioned.has(item.code)) : items;
      progress.total = todo.length;
      for (const item of todo) {
        if (runId !== id) return;
        if (location.pathname !== path) { autoSuspended = true; progress.state = 'stopped'; return; }
        const username = path.split('/')[1];
        const link = document.querySelector<HTMLAnchorElement>(`main a[href$="/${username}/reel/${item.code}/"]`);
        if (!link) { progress.completed++; progress.failed++; continue; }
        openedCode = item.code;
        // shortcut: 依赖 Instagram 网格点击保持页面内导航；若变为整页跳转，队列需移到后台。
        link.click();
        let opened = false;
        let captured = false;
        for (let attempt = 0; attempt < 40 && runId === id; attempt++) {
          const code = currentOpenedCode();
          if (code === item.code) {
            opened = true;
            const reply = readCurrentReel();
            if (reply.status === 'ready' && reply.reel.code === item.code &&
              (reply.reel.caption || (!onlyMissingCaption && attempt >= 4 &&
                [reply.reel.publishedAt, reply.reel.likes, reply.reel.plays, reply.reel.comments].some(value => value != null)))) {
              captured = await saveCurrentReel(reply.reel);
              break;
            }
          } else if (opened || location.pathname !== path) break;
          await pause();
        }
        if (runId !== id) return;
        if (opened && currentOpenedCode() === item.code) history.back();
        openedCode = null;
        for (let attempt = 0; attempt < 20 && location.pathname !== path && runId === id; attempt++) await pause();
        if (runId !== id) return;
        if (location.pathname !== path) {
          autoSuspended = true;
          progress.state = 'stopped';
          return;
        }
        progress.completed++;
        if (!captured) progress.failed++;
      }
      if (runId === id) progress.state = settings.autoProfile && !autoSuspended ? 'scanning' : 'done';
    } catch {
      if (runId === id) {
        autoSuspended = true;
        progress.state = 'error';
        if (openedCode && currentOpenedCode() === openedCode) history.back();
        openedCode = null;
      }
    }
  }

  /** 只允许扩展记录页控制页面内的批量补全或手动采集达人。 */
  function onMessage(message: { type?: string }, sender: { id?: string; url?: string }, sendResponse: (reply: unknown) => void): void {
    if (message?.type === 'GET_REEL') {
      const reply = readCurrentReel();
      sendResponse(progress.state === 'running' ? { status: 'profile', progress: { ...progress } } : reply);
      return;
    }
    if (message?.type === 'PROFILE_COLLECTION_COMPLETE' && sender.id === browser.runtime.id) {
      const notice = message as { profile?: unknown; kind?: unknown; progress?: { completed?: unknown; total?: unknown; failed?: unknown } };
      const counts = notice.progress;
      if (typeof notice.profile === 'string' && notice.profile.toLowerCase() === workerUsername && counts &&
        [counts.completed, counts.total, counts.failed].every(value => Number.isSafeInteger(value) && Number(value) >= 0)) {
        workerTabId = null;
        workerRequested = true;
        if (notice.kind !== 'profile') progress = { state: 'done', completed: counts.completed as number, total: counts.total as number, failed: counts.failed as number };
      }
      return;
    }
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(browser.runtime.getURL('/viewer.html'))) return;
    if (message?.type === 'COLLECT_PROFILE') {
      const username = !worker && profileUsername(location.href);
      if (!username) { sendResponse({ accepted: false }); return; }
      manualProfileUsername = username.toLowerCase();
      aboutUsername = '';
      aboutAttempted = false;
      parsedScripts = new WeakSet<HTMLScriptElement>();
      document.dispatchEvent(new Event('instagram-plugin:request'));
      readCurrentReel();
      sendResponse({ accepted: true });
    } else if (message?.type === 'STOP_PROFILE_ENRICHMENT') {
      stopEnrichment();
      sendResponse({ accepted: true });
    } else if (message?.type === 'START_PROFILE_ENRICHMENT') {
      const items = readProfileReels();
      if (!items.length || progress.state === 'running') { sendResponse({ accepted: false }); return; }
      autoSuspended = false;
      scanComplete = false;
      stableScans = 0;
      nextScanAt = 0;
      startProfile(items, true);
      sendResponse({ accepted: true });
    }
  }
  browser.runtime.onMessage.addListener(onMessage);
  // 信息流地址可能不显示悬浮按钮，采集器仍需跟随视口中的视频保存记录。
  const timer = setInterval(readCurrentReel, 1500);
  /** 扩展热更新时移除旧监听器，避免旧缓存抢先回应。 */
  function stop(): void {
    stopEnrichment();
    aboutController?.abort();
    document.removeEventListener('instagram-plugin:reel', onPageReel);
    document.removeEventListener('instagram-plugin:profile', onPageProfile);
    browser.runtime.onMessage.removeListener(onMessage);
    browser.storage.onChanged.removeListener(onSettingsChanged);
    clearInterval(timer);
  }
  signal?.addEventListener('abort', stop, { once: true });
  return readCurrentReel;
}
