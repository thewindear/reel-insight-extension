import { translate } from '../reel/i18n.ts';
import { defaultSettings, settingsFrom } from '../reel/settings.ts';

/** 在 Instagram 页面挂载常驻侧边抽屉，并接受插件图标的打开请求。 */
export function startDrawer(signal?: AbortSignal): (tabId: number) => void {
  let host: HTMLDivElement | null = null;
  let language = defaultSettings.language;
  let frame: HTMLIFrameElement | null = null;
  let close: HTMLButtonElement | null = null;
  let notice: HTMLDivElement | null = null;
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  /** 同步抽屉的辅助说明文字。 */
  function onSettingsChanged(changes: Record<string, { newValue?: unknown }>, area: string): void {
    if (area !== 'local' || !('settings' in changes)) return;
    language = settingsFrom(changes.settings?.newValue).language;
    if (frame) frame.title = translate(language, 'Reel 采集记录');
    if (close) close.setAttribute('aria-label', translate(language, '关闭采集抽屉'));
  }
  browser.storage.onChanged.addListener(onSettingsChanged);
  void browser.storage.local.get('settings').then(stored => {
    onSettingsChanged({ settings: { newValue: stored.settings } }, 'local');
  }).catch(() => {});

  /** 使用扩展页面展示记录表，保持存储和详情逻辑只有一份。 */
  function open(tabId: number): void {
    if (host || !document.body || !Number.isSafeInteger(tabId) || tabId <= 0) return;
    host = document.createElement('div');
    host.id = 'instagram-plugin-drawer';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .drawer { position: fixed; top: 0; right: 0; z-index: 2147483647; width: min(448px, 100vw); height: 100vh; height: 100dvh; background: #fffafb; box-shadow: -12px 0 40px #0003; }
      iframe { width: 100%; height: 100%; border: 0; }
      button { position: absolute; top: 17px; right: 16px; z-index: 1; display: grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 8px; background: #fffafb; color: #78716c; font: 24px/1 sans-serif; cursor: pointer; }
      button:hover { background: #f8eff4; color: #262422; }
      button:focus-visible { outline: 2px solid #c13584; outline-offset: 2px; }
    `;
    const drawer = document.createElement('div');
    drawer.className = 'drawer';
    frame = document.createElement('iframe');
    frame.title = translate(language, 'Reel 采集记录');
    frame.allow = 'clipboard-write';
    const url = new URL(browser.runtime.getURL('/viewer.html'));
    url.searchParams.set('tabId', String(tabId));
    url.searchParams.set('view', 'drawer');
    frame.src = url.href;
    close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', translate(language, '关闭采集抽屉'));
    close.addEventListener('click', () => { host?.remove(); host = frame = close = null; });
    drawer.append(frame, close);
    shadow.append(style, drawer);
    document.body.append(host);
  }

  /** 在发起采集的 Instagram 页面显示对应任务的完成消息。 */
  function showCompletion(profile: string, kind?: 'profile'): void {
    if (!document.body) return;
    if (noticeTimer) clearTimeout(noticeTimer);
    notice?.remove();
    notice = document.createElement('div');
    notice.id = 'instagram-plugin-completion';
    const shadow = notice.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host { all: initial; } div { position: fixed; top: 20px; right: 20px; z-index: 2147483647; max-width: min(360px, calc(100vw - 40px)); padding: 14px 18px; border: 1px solid #ead0df; border-radius: 12px; background: #fff1f7; color: #702047; box-shadow: 0 8px 30px #0003; font: 600 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }';
    const message = document.createElement('div');
    message.setAttribute('role', 'status');
    message.textContent = `@${profile} ${translate(language, kind === 'profile' ? '的达人资料已采集结束' : '的 Reels 列表已采集结束')}`;
    shadow.append(style, message);
    document.body.append(notice);
    noticeTimer = setTimeout(() => { notice?.remove(); notice = null; noticeTimer = null; }, 10_000);
  }

  /** 只接受扩展后台的抽屉打开与采集完成通知。 */
  function onMessage(message: { type?: string; tabId?: unknown; profile?: unknown; kind?: unknown }, sender: { id?: string }, sendResponse: (reply: { opened: boolean }) => void): void {
    if (message?.type === 'OPEN_REEL_DRAWER' && sender.id === browser.runtime.id &&
      typeof message.tabId === 'number') {
      open(message.tabId);
      sendResponse({ opened: host !== null });
    } else if (message?.type === 'PROFILE_COLLECTION_COMPLETE' && sender.id === browser.runtime.id &&
      typeof message.profile === 'string' && /^[A-Za-z0-9._]{1,30}$/.test(message.profile)) {
      showCompletion(message.profile, message.kind === 'profile' ? 'profile' : undefined);
    }
  }

  /** 内容脚本退出时移除消息监听和抽屉。 */
  function stop(): void {
    browser.runtime.onMessage.removeListener(onMessage);
    browser.storage.onChanged.removeListener(onSettingsChanged);
    if (noticeTimer) clearTimeout(noticeTimer);
    notice?.remove();
    host?.remove();
    host = frame = close = notice = null;
  }

  browser.runtime.onMessage.addListener(onMessage);
  signal?.addEventListener('abort', stop, { once: true });
  return open;
}
