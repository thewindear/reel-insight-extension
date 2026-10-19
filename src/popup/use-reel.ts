import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfileProgress, Reel, ReelReply } from '../reel/types';

type PopupState =
  | { kind: 'ready'; reel: Reel; saveError: boolean }
  | { kind: 'profile'; progress: ProfileProgress; workerTabId?: number; workerHere?: true; hasReels?: boolean }
  | { kind: 'loading' | 'not-reel' | 'not-instagram' | 'unavailable' | 'needs-refresh' };

/** 校验当前标签页域名，避免将消息发给其他站点。 */
function isInstagramTab(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'www.instagram.com';
  } catch {
    return false;
  }
}

/** 抽屉从地址读取来源标签页，避免切换标签时读取到其他视频。 */
function sourceReel(): { tabId: number; code: string | null } | null {
  const params = new URLSearchParams(location.search);
  const tabId = params.get('tabId');
  const code = params.get('code');
  if (!tabId || !/^\d+$/.test(tabId) || (code && !/^[A-Za-z0-9_-]+$/.test(code))) return null;
  const id = Number(tabId);
  return Number.isSafeInteger(id) && id > 0 ? { tabId: id, code } : null;
}

/** 向来源 Instagram 标签页读取临时头像，绕过 CDN 对扩展来源的图片读取限制。 */
export async function loadAvatar(url: string): Promise<string | null> {
  try {
    const source = sourceReel();
    const [tab] = source ? [] : await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = source?.tabId ?? tab?.id;
    if (!tabId || (tab?.url && !isInstagramTab(tab.url))) return null;
    const reply: unknown = await browser.tabs.sendMessage(tabId, { type: 'GET_REEL', avatarUrl: url });
    const avatar = reply && typeof reply === 'object' && 'avatar' in reply ? reply.avatar : null;
    return typeof avatar === 'string' && avatar.length <= 710000 &&
      /^data:image\/(?:jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/.test(avatar) ? avatar : null;
  } catch { return null; }
}

/** 轮询当前 Reel，并向界面提供加载、错误和成功状态。 */
export function useReel(): { state: PopupState; refresh: () => void; controlEnrichment: (type: 'START_PROFILE_ENRICHMENT' | 'STOP_PROFILE_ENRICHMENT' | 'COLLECT_PROFILE') => Promise<void> } {
  const [state, setState] = useState<PopupState>({ kind: 'loading' });
  const started = useRef(Date.now());
  const busy = useRef(false);
  const last = useRef('');
  const source = useRef(sourceReel());
  const worker = useRef<number | null>(null);

  /** 读取当前标签页；仅在 Reel 数据变化时更新 React 状态。 */
  const update = useCallback(async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    try {
      const [tab] = source.current ? [] : await browser.tabs.query({ active: true, currentWindow: true });
      const tabId = source.current?.tabId ?? tab?.id;
      // 抽屉没有 activeTab 授权时，仍可向已注入的内容脚本发送固定消息。
      if (!tabId || (tab?.url && !isInstagramTab(tab.url))) {
        last.current = '';
        setState({ kind: 'not-instagram' });
        return;
      }
      const reply = await browser.tabs.sendMessage(tabId, { type: 'GET_REEL' }) as ReelReply;
      if (reply.status === 'ready') {
        if (source.current && reply.reel.code !== source.current.code) {
          // 来源标签页切换视频后，详情页跟随新 shortcode，避免旧地址阻止展示新数据。
          source.current.code = reply.reel.code;
          const url = new URL(location.href);
          url.searchParams.set('code', reply.reel.code);
          history.replaceState(null, '', url);
        }
        const saveError = reply.autoSave !== false && reply.saveError === true;
        const serialized = JSON.stringify({ reel: reply.reel, saveError });
        if (serialized !== last.current) setState({ kind: 'ready', reel: reply.reel, saveError });
        last.current = serialized;
        started.current = Date.now();
      } else if (reply.status === 'profile') {
        worker.current = reply.workerTabId ?? null;
        let progress = reply.progress;
        let workerReady = false;
        if (worker.current) {
          try {
            const workerReply = await browser.tabs.sendMessage(worker.current, { type: 'GET_REEL' }) as ReelReply;
            if (workerReply.status === 'profile') { progress = workerReply.progress; workerReady = true; }
            else if (workerReply.status === 'not-reel') progress = { ...progress, state: 'stopped' };
          } catch { progress = { ...progress, state: 'stopped' }; }
        }
        const serialized = JSON.stringify({ progress, workerTabId: workerReady ? worker.current : null, workerHere: reply.workerHere, hasReels: reply.hasReels });
        if (serialized !== last.current) setState({ kind: 'profile', progress, ...(workerReady && worker.current ? { workerTabId: worker.current } : {}), ...(reply.workerHere ? { workerHere: true } : {}), ...(reply.hasReels === false ? { hasReels: false } : {}) });
        last.current = serialized;
        started.current = Date.now();
      } else {
        last.current = '';
        setState({ kind: reply.status === 'not-reel' ? 'not-reel' :
          Date.now() - started.current > 15000 ? 'unavailable' : 'loading' });
      }
    } catch {
      last.current = '';
      setState({ kind: 'needs-refresh' });
    } finally {
      busy.current = false;
    }
  }, []);

  /** 立即重新读取，同时重置等待超时。 */
  const refresh = useCallback((): void => {
    started.current = Date.now();
    void update();
  }, [update]);

  /** 将手动采集或批量补全操作发送到抽屉绑定的 Instagram 标签页。 */
  const controlEnrichment = useCallback(async (type: 'START_PROFILE_ENRICHMENT' | 'STOP_PROFILE_ENRICHMENT' | 'COLLECT_PROFILE'): Promise<void> => {
    const [tab] = source.current ? [] : await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = source.current?.tabId ?? tab?.id;
    if (!tabId || (tab?.url && !isInstagramTab(tab.url))) throw new Error('No Instagram tab');
    const reply = await browser.tabs.sendMessage(type === 'COLLECT_PROFILE' ? tabId : worker.current ?? tabId, { type });
    if (reply?.accepted !== true) throw new Error('Enrichment rejected');
    await update();
  }, [update]);

  /** 抽屉关闭时清理轮询定时器。 */
  useEffect(() => {
    void update();
    const timer = setInterval(update, 1800);
    return () => clearInterval(timer);
  }, [update]);

  return { state, refresh, controlEnrichment };
}
