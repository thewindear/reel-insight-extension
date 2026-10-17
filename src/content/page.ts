import { authorFrom, profileFrom } from '../reel/extract';
import { profileUsername } from '../reel/profile-url';
import type { Author, Profile, Reel } from '../reel/types';

/** 从 Reel 详情或信息流地址中读取 shortcode。 */
function reelCode(url: string): string | null {
  return url.match(/\/(?:reel|reels)\/([A-Za-z0-9_-]+)/)?.[1] ?? null;
}

/** 将页面中的媒体地址转为绝对 HTTPS 地址。 */
function mediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, location.href);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** 只接受页面显示的完整整数，缩写数字不反推精确计数。 */
function exactCount(value: string | null | undefined): number | null {
  if (!value || !/^\d+(?:,\d{3})*$/.test(value)) return null;
  const count = Number(value.replaceAll(',', ''));
  return Number.isSafeInteger(count) ? count : null;
}

/** 只定位带当前用户名的账户简介弹窗，避免读取其他页面浮层。 */
function aboutDialog(username: string): HTMLElement | null {
  const title = [...document.querySelectorAll<HTMLElement>('h1, h2, h3, div, span')]
    .find(node => /^(?:账户简介|About this account)$/i.test(node.textContent?.trim() ?? '') &&
      ![...node.children].some(child => child.textContent?.trim() === node.textContent?.trim()));
  for (let root: HTMLElement | null = title ?? null; root && root !== document.body; root = root.parentElement) {
    const text = root.innerText;
    if (text.toLowerCase().includes(username.toLowerCase()) && /(?:加入日期|加入时间|Date joined|账户所在地|Account based in|已认证|Date verified)/i.test(text) &&
      [...root.querySelectorAll('button, [role="button"]')].some(button => /^(?:关闭|Close)$/i.test(button.textContent?.trim() || button.getAttribute('aria-label') || ''))) return root;
  }
  return null;
}

/** 读取账户简介中的明确字段，兼容标签和值分行或同一行。 */
function aboutValues(username: string): Pick<Profile, 'joinedAt' | 'basedIn' | 'verifiedAt'> {
  const lines = aboutDialog(username)?.innerText.split('\n').map(line => line.trim()).filter(Boolean) ?? [];
  /** 从弹窗行中提取标签之后的值，不把下一个字段当成当前字段。 */
  function value(label: RegExp): string | null {
    const index = lines.findIndex(line => label.test(line));
    if (index < 0) return null;
    const sameLine = lines[index]!.replace(label, '').trim();
    const result = sameLine || lines[index + 1] || '';
    return result && result.length <= 100 && !/^(?:加入日期|加入时间|账户所在地|已认证|Date joined|Account based in|Verified)$/i.test(result) ? result : null;
  }
  return {
    joinedAt: value(/^(?:加入日期|加入时间|Date joined)\s*[:：]?\s*/i),
    basedIn: value(/^(?:账户所在地|Account based in)\s*[:：]?\s*/i),
    verifiedAt: value(/^(?:已认证|认证时间|Date verified|Verified)\s*[:：]?\s*/i),
  };
}

/** 直接识别推荐页可见发布者，不依赖刷新后才完整的视频元信息或 shortcode。 */
export function readFeedAuthor(): Author | null {
  if (!/^\/reels(?:\/|$)/.test(location.pathname)) return null;
  const video = activeVideo();
  if (!video) return null;
  const rect = video.getBoundingClientRect();
  if (rect.bottom <= 0 || rect.top >= innerHeight) return null;
  let scope: Element = video;
  while (scope.parentElement && scope.parentElement.tagName !== 'MAIN' &&
    scope.parentElement.querySelectorAll('video').length === 1) scope = scope.parentElement;
  const scoped = scope.querySelector<HTMLAnchorElement>('header a[href^="/"]') ??
    scope.querySelector<HTMLAnchorElement>('a[href^="/"]');
  const links = [...(scoped ? [scoped] : []), ...document.querySelectorAll<HTMLAnchorElement>('main a[href]')];
  for (const link of links) {
    const username = profileUsername(link.href || new URL(link.getAttribute('href') || '', location.href).href);
    if (!username) continue;
    // 作者栏可能与 video 分属不同容器，此时只接受当前视频高度范围内的同名主页链接。
    if (link !== scoped) {
      const bounds = link.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0 || bounds.top < Math.max(0, rect.top) ||
        bounds.bottom > Math.min(innerHeight, rect.bottom) || link.textContent?.trim().toLowerCase() !== username.toLowerCase()) continue;
    }
    return authorFrom({ username });
  }
  return null;
}

/** 自动打开当前达人的账户简介并读取字段，随后关闭扩展打开的弹窗。 */
export async function collectProfileAbout(username: string, signal?: AbortSignal, feedProfile?: Profile): Promise<Profile | null> {
  const feedCode = feedProfile ? readActiveReel()?.code ?? null : null;
  /** 每次等待后重新确认账号和视频，不能把相邻推荐视频的账户简介混入。 */
  function isCurrent(): boolean {
    if (!feedProfile) return profileUsername(location.href)?.toLowerCase() === username.toLowerCase();
    const current = readActiveReel();
    return /^\/reels(?:\/|$)/.test(location.pathname) && (current?.code ?? null) === feedCode &&
      readFeedAuthor()?.username.toLowerCase() === username.toLowerCase();
  }
  if (signal?.aborted || !isCurrent()) return null;
  const base = feedProfile ?? readProfilePage();
  if (!base) return null;
  if (aboutDialog(username)) return { ...base, ...aboutValues(username) };
  if (document.querySelector('[role="dialog"]')) return null;
  let header: Element | null = feedProfile ? activeVideo() : document.querySelector('main header');
  // 推荐页右下角菜单与视频同属一个容器，不能点击预加载视频的菜单。
  if (feedProfile) {
    while (header?.parentElement && header.parentElement.tagName !== 'MAIN' &&
      header.parentElement.querySelectorAll('video').length === 1) header = header.parentElement;
  }
  if (!header) return null;
  const buttons = [...header.querySelectorAll<HTMLElement>('button, [role="button"]')];
  if (feedProfile) {
    const rect = activeVideo()?.getBoundingClientRect();
    for (const button of document.querySelectorAll<HTMLElement>('main button, main [role="button"]')) {
      const bounds = button.getBoundingClientRect();
      if (rect && bounds.width > 0 && bounds.height > 0 && bounds.top >= Math.max(0, rect.top) &&
        bounds.bottom <= Math.min(innerHeight, rect.bottom)) buttons.push(button);
    }
  }
  const option = buttons.find(button =>
    /^(?:选项|更多|更多选项|Options|More|More options)$/i.test(button.getAttribute('aria-label') || button.querySelector('svg[aria-label]')?.getAttribute('aria-label') || ''));
  if (!option) return null;
  option.click();
  let aboutButton: HTMLElement | null = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    // 开关关闭或页面切换时收起扩展打开的菜单。
    if (signal?.aborted || !isCurrent()) { option.click(); return null; }
    aboutButton = [...document.querySelectorAll<HTMLElement>('button, [role="button"]')].find(button =>
      /^(?:账户简介|About this account)$/i.test(button.textContent?.trim() ?? '') &&
      button.getBoundingClientRect().width > 0) ?? null;
    if (aboutButton) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!aboutButton) { option.click(); return null; }
  if (signal?.aborted) { option.click(); return null; }
  aboutButton.click();
  let dialog: HTMLElement | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    dialog = aboutDialog(username);
    if (!isCurrent()) break;
    if (dialog) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  // 弹窗已打开时即使采集被关闭，也要等其出现并收起，但不读取字段。
  const profile = !signal?.aborted && dialog && isCurrent() ? { ...base, ...aboutValues(username) } : null;
  const close = [...(dialog?.querySelectorAll<HTMLElement>('button, [role="button"]') ?? [])].find(button =>
    /^(?:关闭|Close)$/i.test(button.textContent?.trim() || button.getAttribute('aria-label') || ''));
  close?.click();
  return profile;
}

/** 只从与当前地址一致的主页头部读取公开资料，避免页面内导航时保存旧账号。 */
export function readProfilePage(): Profile | null {
  const username = profileUsername(location.href);
  const header = document.querySelector('main header');
  if (!username || !header || ![...header.querySelectorAll('h1, h2, a')].some(node => node.textContent?.trim().toLowerCase() === username.toLowerCase())) return null;
  const links = [...header.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')]
    .map(link => link.href).filter(url => url.startsWith('https://'));
  const followers = header.querySelector<HTMLAnchorElement>('a[href$="/followers/"]');
  const following = header.querySelector<HTMLAnchorElement>('a[href$="/following/"]');
  const name = header.querySelector('h1')?.textContent?.trim();
  const about = aboutValues(username);
  const profile = profileFrom({
    username,
    full_name: name?.toLowerCase() === username.toLowerCase() ? null : name,
    profile_pic_url: header.querySelector<HTMLImageElement>('img')?.src,
    media_count: exactCount(header.querySelector('ul li')?.querySelector('[title]')?.getAttribute('title') ?? header.querySelector('ul li')?.textContent?.trim()),
    follower_count: exactCount(followers?.querySelector('[title]')?.getAttribute('title') ?? followers?.textContent?.trim()),
    following_count: exactCount(following?.querySelector('[title]')?.getAttribute('title') ?? following?.textContent?.trim()),
    is_verified: header.querySelector('svg[aria-label="Verified"], svg[aria-label="已认证"]') ? true : null,
    external_url: links[0], ...(links.length ? { bio_links: links.map(url => ({ url })) } : {}),
    about_this_account: {
      date_joined: about.joinedAt,
      account_based_in: about.basedIn,
      date_verified: about.verifiedAt,
    },
  });
  // 主页可能折叠多个 Bio 链接，DOM 结果不能覆盖接口提供的完整列表。
  return profile ? { ...profile, bioLinksComplete: false } : null;
}

/** 只在当前视频的可见区域读取带名称的互动按钮计数。 */
function visibleCount(video: HTMLVideoElement | null, names: string[]): number | null {
  if (!video) return null;
  const videoRect = video.getBoundingClientRect();
  for (const button of document.querySelectorAll<HTMLElement>('main button, main [role="button"]')) {
    const rect = button.getBoundingClientRect();
    const center = (rect.top + rect.bottom) / 2;
    if (rect.width <= 0 || rect.height <= 0 || center < videoRect.top || center > videoRect.bottom) continue;
    const label = button.getAttribute('aria-label') ?? button.querySelector('svg[aria-label]')?.getAttribute('aria-label');
    if (!label || !names.some(name => label.toLowerCase() === name.toLowerCase() ||
      label.toLowerCase().startsWith(`${name.toLowerCase()} `))) continue;
    const text = button.textContent?.trim() ?? '';
    const value = exactCount(text) ?? exactCount(text.replace(label, '').trim()) ??
      exactCount(label.match(/(?:^|\s)(\d[\d,]*)$/)?.[1]);
    if (value !== null) return value;
  }
  return null;
}

/** 多个视频同时存在时，选取当前视口内可见高度最大的一个。 */
function activeVideo(): HTMLVideoElement | null {
  return [...document.querySelectorAll('video')]
    .map(video => ({ video, rect: video.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => {
      // Reels 信息流会预加载相邻视频，不能简单取第一个 video。
      /** 计算视频落在视口内的高度。 */
      const visible = (rect: DOMRect) => Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
      return visible(b.rect) - visible(a.rect);
    })[0]?.video ?? null;
}

/** 在视频附近寻找 Reel 链接，避免误取侧栏里的推荐视频。 */
function videoReelLink(video: HTMLVideoElement | null): HTMLAnchorElement | null {
  let parent = video?.parentElement;
  // 只沿着包含当前一条视频的祖先查找，进入多视频容器后链接可能属于相邻 Reel。
  while (parent && parent.tagName !== 'MAIN' && parent.querySelectorAll('video').length === 1) {
    const link = parent.querySelector<HTMLAnchorElement>('a[href*="/reel/"]') ??
      parent.querySelector<HTMLAnchorElement>('a[href*="/reels/"]');
    if (link) return link;
    parent = parent.parentElement;
  }
  return null;
}

/** 从当前视频的标记控件读取页面可见的用户名，不把 caption 提及误认成标记。 */
function visibleTaggedUsers(video: HTMLVideoElement | null): Reel['taggedUsers'] {
  if (!video) return [];
  let scope: Element | null = video.closest('article');
  if (!scope) {
    // Reels 信息流没有 article 时，停在只包含当前 video 的最外层容器，避免读到相邻视频。
    scope = video;
    for (let parent = scope.parentElement; parent && parent.tagName !== 'MAIN' &&
      parent.querySelectorAll('video').length === 1; parent = parent.parentElement) scope = parent;
  }
  const users = new Map<string, NonNullable<ReturnType<typeof authorFrom>>>();
  const prefix = /^(?:已标记的用户|标记的用户|标记用户|被标记的用户|Tagged (?:people|users)|People tagged)[:：\s]*/i;
  for (const control of scope.querySelectorAll<HTMLElement>('a, button, [role="button"]')) {
    const label = control.getAttribute('aria-label') ?? control.querySelector('[aria-label]')?.getAttribute('aria-label') ?? '';
    const text = control.textContent?.trim() ?? '';
    const names = [label, text].filter(value => prefix.test(value))
      .map(value => value.replace(prefix, '').trim()).filter(Boolean).join(',');
    // 控件可能只显示第一位及“其他人”，仅接受每段开头的合法 username。
    for (const segment of names.split(/[,，、]+/)) {
      const username = segment.trim().match(/^@?([A-Za-z0-9._]{1,30})(?:\s|$)/)?.[1];
      const user = username ? authorFrom({ username }) : null;
      if (user) users.set(user.username, user);
    }
  }
  return Array.from(users.values());
}

/** 页面响应缺失时，从当前 Reel 的 DOM 与元信息补齐可见字段。 */
function pageReel(code: string, video: HTMLVideoElement | null): Reel | null {
  let root: Element | null = video?.closest('article') ?? null;
  // 推荐页通常没有 article，作者必须从当前视频自己的容器读取。
  if (!root && video) {
    for (let parent = video.parentElement; parent && parent.tagName !== 'MAIN' &&
      parent.querySelectorAll('video').length === 1; parent = parent.parentElement) root = parent;
  }
  if (!video) root = document.querySelector('main article');
  const profile = root?.querySelector<HTMLAnchorElement>('header a[href^="/"]') ??
    root?.querySelector<HTMLAnchorElement>('a[href^="/"]');
  const direct = reelCode(location.href) === code;
  const canonical = document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content ?? '';
  // 页面内切换 Reel 时，旧的 meta 可能尚未更新，只有 shortcode 一致才使用它。
  const currentMeta = direct && reelCode(canonical) === code;
  const videoCode = reelCode(videoReelLink(video)?.href ?? '');
  // 旧视频仍在视口时，不能把它的作者或标记用户归到新地址。
  if (videoCode ? videoCode !== code : !currentMeta) return null;
  const profileUsername = profile?.getAttribute('href')?.match(/^\/([A-Za-z0-9._]+)\/?$/)?.[1];
  const username = (currentMeta ? canonical.match(/^https:\/\/www\.instagram\.com\/([A-Za-z0-9._]+)\/reels?\//)?.[1] : undefined) ??
    profileUsername;
  const avatar = profileUsername === username ? root?.querySelector<HTMLImageElement>('header img')?.src : null;
  const title = currentMeta ? document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content : null;
  const author = authorFrom(username ? {
    username,
    pk: currentMeta ? document.querySelector<HTMLMetaElement>('meta[property="instapp:owner_user_id"]')?.content : null,
    full_name: title?.match(/^(.+?) \(@[A-Za-z0-9._]+\) • Instagram reel$/u)?.[1],
    profile_pic_url: avatar,
  } : null);
  if (!author) return null;
  const description = currentMeta ? document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content : null;
  const summary = currentMeta ? document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content : null;
  const counts = summary?.match(/^(\d[\d,]*) likes?, (\d[\d,]*) comments? - /i);
  const caption = description?.match(/:\s*[“"]([\s\S]*)[”"](?:\.\s*)?$/u)?.[1] ||
    root?.querySelector('h1')?.textContent?.trim() || null;
  const mediaId = currentMeta ? document.querySelector<HTMLMetaElement>('meta[property="al:ios:url"]')?.content.match(/^instagram:\/\/media\?id=(\d+)$/)?.[1] : null;
  return {
    code,
    url: `https://www.instagram.com/reel/${encodeURIComponent(code)}/`,
    mediaId: mediaId ?? null,
    publishedAt: null,
    authors: [author],
    taggedUsers: visibleTaggedUsers(video),
    caption,
    videoUrl: mediaUrl(video?.currentSrc || video?.src),
    coverUrl: mediaUrl(video?.poster || (currentMeta ? document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content : null)),
    // 页面切换时旧视频可能仍可见；只有元信息与当前 shortcode 一致才读取 DOM 计数。
    plays: currentMeta ? visibleCount(video, ['播放量', '播放次数', 'Plays', 'Views']) : null,
    likes: exactCount(counts?.[1]) ?? (currentMeta ? visibleCount(video, ['赞', 'Like']) : null),
    comments: exactCount(counts?.[2]) ?? (currentMeta ? visibleCount(video, ['评论', 'Comment']) : null),
    reposts: currentMeta ? visibleCount(video, ['转发', 'Repost']) : null,
  };
}

/** 返回当前可见视频的 shortcode 和 DOM 兜底数据。 */
export function readActiveReel(): { code: string; reel: Reel | null } | null {
  // 用户主页的网格可能包含预览视频，不能把其中一条当作当前详情视频。
  if (/^\/[A-Za-z0-9._]+\/reels\/?$/.test(location.pathname)) return null;
  const video = activeVideo();
  const visibleCode = reelCode(videoReelLink(video)?.href ?? '');
  // 滚动推荐视频后地址栏和 meta 可能仍是上一条，优先使用可见视频的链接。
  const code = /^\/reels(?:\/|$)/.test(location.pathname) ? visibleCode ?? reelCode(location.href) :
    reelCode(location.href) ?? visibleCode;
  return code ? { code, reel: pageReel(code, video) } : null;
}

/** 仅在推荐信息流中滚动到当前视频之后的一条，不操作达人列表或详情页。 */
export function advanceFeedReel(): boolean {
  if (!/^\/reels(?:\/|$)/.test(location.pathname)) return false;
  const current = activeVideo();
  if (!current) return false;
  const rect = current.getBoundingClientRect();
  if (rect.bottom <= 0 || rect.top >= innerHeight) return false;
  const next = [...document.querySelectorAll('video')]
    .filter(video => video !== current && video.getBoundingClientRect().width > 0 && video.getBoundingClientRect().top >= rect.bottom)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
  if (next) {
    next.scrollIntoView({ block: 'center', behavior: 'instant' });
    return true;
  }
  // 尚未加载下一条时只滚动当前视频所在的容器，避免误动评论或抽屉。
  for (let parent = current.parentElement; parent; parent = parent.parentElement) {
    if (parent.scrollHeight > parent.clientHeight && parent.clientHeight >= rect.height) {
      parent.scrollBy({ top: parent.clientHeight, behavior: 'instant' });
      return true;
    }
  }
  return false;
}

/** 读取用户 Reels 网格中已经加载的链接与封面，未展示的字段留空。 */
export function readProfileReels(): Reel[] {
  const username = location.pathname.match(/^\/([A-Za-z0-9._]+)\/reels\/?$/)?.[1];
  if (!username) return [];
  const main = document.querySelector('main');
  if (!main) return [];
  const avatar = main.querySelector<HTMLImageElement>('header img')?.src ??
    document.querySelector<HTMLImageElement>(`img[alt^="${username}"]`)?.src;
  const author = authorFrom({ username, profile_pic_url: avatar });
  if (!author) return [];
  const found = new Map<string, Reel>();
  for (const link of main.querySelectorAll<HTMLAnchorElement>('a[href*="/reel/"]')) {
    try {
      const target = new URL(link.href, location.href);
      const match = target.pathname.match(/^\/([A-Za-z0-9._]+)\/reel\/([A-Za-z0-9_-]+)\/?$/);
      // 只接收当前作者网格的 Reel；推荐链接与其他站点的链接不能混入。
      if (target.protocol !== 'https:' || target.hostname !== location.hostname ||
        match?.[1]?.toLowerCase() !== username.toLowerCase()) continue;
      const code = match[2]!;
      const image = link.querySelector<HTMLImageElement>('img');
      found.set(code, {
        code, url: `https://www.instagram.com/reel/${encodeURIComponent(code)}/`,
        mediaId: null, publishedAt: null, authors: [author], taggedUsers: [],
        caption: null, videoUrl: null, coverUrl: mediaUrl(image?.currentSrc || image?.src),
        plays: exactCount(link.textContent?.trim()), likes: null, comments: null, reposts: null,
      });
    } catch { /* 页面注入的无效链接不影响其余网格条目。 */ }
  }
  return Array.from(found.values());
}
