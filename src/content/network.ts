import { findProfile, findReels, mergeProfiles, mergeReels } from '../reel/extract';
import { profileUsername } from '../reel/profile-url';
import type { Profile, Reel } from '../reel/types';

/** 仅检查可能包含 Reel 信息的 Instagram 接口响应。 */
function isRelevant(url: string): boolean {
  return /\/(?:graphql|api\/v1|reels|feed)\b/i.test(url);
}

/** 在 MAIN world 监听页面已有响应，只向隔离脚本传递规范化后的字段。 */
export function startNetworkCapture(): void {
  const reels = new Map<string, Reel>();
  const profiles = new Map<string, Profile>();

  /** 解析响应，并限制缓存条数以免长期浏览时持续增长。 */
  function capture(payload: unknown): void {
    const username = profileUsername(location.href);
    const profile = username ? findProfile(payload, username) : null;
    if (profile) {
      const previous = profiles.get(username!.toLowerCase());
      const merged = mergeProfiles(previous, profile);
      profiles.set(username!.toLowerCase(), merged);
      if (profiles.size > 40) profiles.delete(profiles.keys().next().value!);
      document.dispatchEvent(new CustomEvent('instagram-plugin:profile', { detail: merged }));
    }
    for (const reel of findReels(payload)) {
      // 后续的精简响应可能缺少计数，合并以保留已采集的数据。
      const merged = mergeReels(reels.get(reel.code), reel);
      reels.set(reel.code, merged);
      if (reels.size > 40) reels.delete(reels.keys().next().value!);
      document.dispatchEvent(new CustomEvent('instagram-plugin:reel', { detail: merged }));
    }
  }

  /** 隔离脚本晚于请求启动时，重放当前页面已捕获的数据。 */
  function replayCachedReels(): void {
    for (const reel of reels.values()) {
      document.dispatchEvent(new CustomEvent('instagram-plugin:reel', { detail: reel }));
    }
    const username = profileUsername(location.href);
    const profile = username ? profiles.get(username.toLowerCase()) : null;
    if (profile) document.dispatchEvent(new CustomEvent('instagram-plugin:profile', { detail: profile }));
  }
  document.addEventListener('instagram-plugin:request', replayCachedReels);

  const originalFetch = window.fetch;
  /** 不改变页面请求结果；异步读取克隆响应用于提取数据。 */
  window.fetch = function (...args) {
    const response = originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : '';
    if (isRelevant(url)) {
      void response.then(async result => {
        const length = Number(result.headers.get('content-length'));
        if (length > 5_000_000 || !result.headers.get('content-type')?.includes('json')) return;
        try { capture(await result.clone().json()); } catch { /* 部分接口会返回非 JSON。 */ }
      }).catch(() => {});
    }
    return response;
  };

  const originalSend = XMLHttpRequest.prototype.send;
  /** 保留原生 XHR 行为，仅在响应完成后读取相关 JSON。 */
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', () => {
      if (!isRelevant(this.responseURL) || Number(this.getResponseHeader('content-length')) > 5_000_000) return;
      try {
        if (this.responseType === 'json') capture(this.response);
        else if ((this.responseType === '' || this.responseType === 'text') && this.responseText.length <= 5_000_000) {
          capture(JSON.parse(this.responseText));
        }
      } catch { /* 非 JSON 或浏览器限制读取响应时忽略。 */ }
    }, { once: true });
    return originalSend.apply(this, args);
  };
}
