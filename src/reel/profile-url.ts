const reservedPaths = new Set(['about', 'accounts', 'api', 'challenge', 'direct', 'explore', 'p', 'reel', 'reels', 'stories', 'web']);

/** 校验 Instagram 达人主页及其 Reels 标签页地址，并返回用户名。 */
export function profileUsername(url: string): string | null {
  try {
    const page = new URL(url);
    if (page.protocol !== 'https:' || page.hostname !== 'www.instagram.com') return null;
    const username = page.pathname.match(/^\/([A-Za-z0-9._]{1,30})(?:\/reels)?\/?$/)?.[1] ?? null;
    return username && !reservedPaths.has(username.toLowerCase()) ? username : null;
  } catch {
    return null;
  }
}
