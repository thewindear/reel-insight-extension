import type { Author, Profile, Reel } from './types';

type RecordValue = Record<string, unknown>;

/** 将未知值收窄为普通对象，避免直接相信页面响应。 */
const record = (value: unknown): RecordValue | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
/** 读取非空字符串。 */
const string = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
/** 将数字或字符串 ID 统一成字符串。 */
const identifier = (value: unknown): string | null =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : string(value);
/** 只接受非负的有限计数。 */
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
/** 从嵌套对象安全读取字段。 */
const path = (value: unknown, ...keys: string[]): unknown => keys.reduce<unknown>((part, key) => record(part)?.[key], value);
/** 选取第一个有效字符串。 */
const first = (...values: unknown[]): string | null => values.map(string).find(Boolean) ?? null;
/** 选取第一个有效计数，保留合法的零值。 */
const number = (...values: unknown[]): number | null => values.map(count).find(value => value !== null) ?? null;
/** 只保留可安全打开的 HTTPS 资源地址。 */
const mediaUrl = (value: unknown): string | null => {
  const url = string(value);
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

/**
 * 还原 Instagram 的 bio 外链跳转：l.instagram.com 只是中转页，真实地址放在 u 参数里。
 * 直接从原始地址截取 u 参数并逐层解码；无法还原或目标不是 HTTPS 时保留原链接。
 */
export function bioUrl(value: unknown): string | null {
  const input = string(value);
  if (!input) return null;
  let url: string = input;
  // 跳转可能嵌套，限制次数避免被构造出的循环链接反复展开。
  for (let depth = 0; depth < 3; depth += 1) {
    const parsed = safeUrl(url);
    if (!parsed || !isWebProtocol(parsed.protocol)) return depth === 0 ? null : url;
    if (!isRedirectHost(parsed.hostname)) return url;
    // 优先从原始字符串截取 u 参数，避免参数顺序或重复编码影响解析。
    const target: string | null = rawRedirectTarget(url) ?? parsed.searchParams.get('u');
    if (!target) return url;
    const resolved: string | null = resolveRedirectTarget(target);
    if (!resolved) return url;
    url = resolved;
  }
  return url;
}

/** 判断是否为 Instagram 的外链跳转域名。 */
function isRedirectHost(hostname: string): boolean {
  return hostname === 'l.instagram.com' || hostname.endsWith('.l.instagram.com');
}

/** 只接受可正常打开的 HTTP/HTTPS 协议。 */
function isWebProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

/** 从原始地址中截取 u 参数（可能不在参数首位），保留原始百分号编码。 */
function rawRedirectTarget(raw: string): string | null {
  return raw.match(/[?&]u=([^&#]*)/i)?.[1] ?? null;
}

/** 对跳转目标反复做 URL 解码，直到得到合法的 HTTP/HTTPS 地址。 */
function resolveRedirectTarget(value: string): string | null {
  let candidate = value;
  for (let depth = 0; depth < 3; depth += 1) {
    // 目标可能是协议相对地址，补上 HTTPS 后再校验。
    const resolved = webUrl(candidate.startsWith('//') ? `https:${candidate}` : candidate);
    if (resolved) return resolved;
    if (!candidate.includes('%')) return null;
    const decoded = decodePercent(candidate);
    if (decoded === candidate) return null;
    candidate = decoded;
  }
  return null;
}

/** 返回规范化的 HTTP/HTTPS 地址，其它协议或非法地址返回 null。 */
function webUrl(value: string): string | null {
  const url = safeUrl(value);
  return url && isWebProtocol(url.protocol) ? url.href : null;
}

/** 安全解析地址，非法字符串返回 null。 */
function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** 执行一次 URL 解码，非法转义序列保持原样。 */
function decodePercent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 将接口的 Unix 秒或跨世界传递的 ISO 时间规范化为 UTC。 */
function publicationTime(value: unknown): string | null {
  const seconds = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : null;
  if (seconds !== null && (!Number.isSafeInteger(seconds) || seconds < 0)) return null;
  const millis = seconds !== null ? seconds * 1000 :
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  const date = new Date(millis);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** 将 Instagram 作者对象规范化为展示所需的资料。 */
export function authorFrom(value: unknown): Author | null {
  const user = record(value);
  const username = string(user?.username);
  if (!username) return null;
  return {
    id: identifier(user?.pk) ?? identifier(user?.id) ?? identifier(user?.fbid_v2),
    username,
    name: first(user?.full_name, user?.name),
    avatar: mediaUrl(first(user?.profile_pic_url, user?.profile_pic_url_hd, user?.profile_picture_url)),
    verified: typeof user?.is_verified === 'boolean' ? user.is_verified : null,
    biography: first(user?.biography, user?.bio),
    followers: number(user?.follower_count, path(user, 'edge_followed_by', 'count')),
    following: number(user?.following_count, path(user, 'edge_follow', 'count')),
    posts: number(user?.media_count, path(user, 'edge_owner_to_timeline_media', 'count')),
    private: typeof user?.is_private === 'boolean' ? user.is_private : null,
    externalUrl: bioUrl(user?.external_url),
    profileUrl: `https://www.instagram.com/${encodeURIComponent(username)}/`,
  };
}

/** 从公开的用户对象读取达人字段，不推测未提供的账户资料。 */
export function profileFrom(value: unknown): Profile | null {
  const user = record(value);
  const author = authorFrom(user);
  if (!user || !author || !/^[A-Za-z0-9._]{1,30}$/.test(author.username)) return null;
  const about = record(user.about_this_account) ?? record(user.account_info);
  const links = Array.isArray(user.bio_links) ? user.bio_links.slice(0, 20) : [];
  const bioLinks = [user.external_url, ...links.map(link => record(link)?.url)].map(bioUrl)
    .filter((url): url is string => url !== null);
  return {
    ...author,
    category: first(user.category_name, user.category, user.business_category_name) ?? '',
    bioLinks: [...new Set(bioLinks)],
    bioLinksComplete: Array.isArray(user.bio_links),
    joinedAt: first(about?.date_joined, user.date_joined),
    basedIn: first(about?.account_based_in, about?.based_in, user.account_based_in),
    verifiedAt: first(about?.date_verified, about?.verified_at, user.date_verified),
  };
}

/** 合并分批取得的达人字段，完整链接列表替换旧值，缺失链接字段时保留已知结果。 */
export function mergeProfiles(existing: Profile | undefined, incoming: Profile): Profile {
  if (!existing) return { ...incoming, category: incoming.category ?? '' };
  return {
    ...existing,
    ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== null)),
    // 局部响应或 DOM 兜底可能缺少分类，不能清空已采集的分类。
    category: incoming.category || existing.category || '',
    bioLinks: incoming.bioLinksComplete === true || (existing.bioLinksComplete !== true && incoming.bioLinks.length > 0) ?
      incoming.bioLinks : existing.bioLinks,
    bioLinksComplete: incoming.bioLinksComplete === true || existing.bioLinksComplete === true,
  } as Profile;
}

/** 只提取指定用户名的资料，避免预加载的其他达人混入当前记录。 */
export function findProfile(payload: unknown, username: string): Profile | null {
  const seen = new WeakSet<object>();
  let found: Profile | null = null;
  /** 遍历有限的已解析 JSON，并合并同一账号的非空字段。 */
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const profile = profileFrom(value);
    if (profile?.username.toLowerCase() === username.toLowerCase()) {
      found = mergeProfiles(found ?? undefined, profile);
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  }
  visit(payload);
  return found;
}

/** 校验跨世界达人事件，只重建允许传递的公开字段。 */
export function profileFromPageEvent(value: unknown): Profile | null {
  const item = record(value);
  if (!item) return null;
  return profileFrom({
    username: item.username, pk: item.id, full_name: item.name,
    profile_pic_url: item.avatar, is_verified: item.verified,
    category_name: item.category,
    biography: item.biography, follower_count: item.followers,
    following_count: item.following, media_count: item.posts,
    is_private: item.private, external_url: item.externalUrl,
    bio_links: item.bioLinksComplete !== false && Array.isArray(item.bioLinks) ? item.bioLinks.map(url => ({ url })) : undefined,
    about_this_account: { date_joined: item.joinedAt, account_based_in: item.basedIn, date_verified: item.verifiedAt },
  });
}

/** 将 Instagram 的两类 Reel 响应格式统一为 Reel。 */
export function reelFrom(value: unknown): Reel | null {
  const item = record(value);
  if (!item) return null;
  const code = first(item.code, item.shortcode);
  const owner = authorFrom(item.owner ?? item.user);
  if (!code || !owner || item.is_video === false || item.media_type === 1) return null;
  const coauthors = Array.isArray(item.coauthor_producers) ? item.coauthor_producers :
    Array.isArray(item.collaborators) ? item.collaborators : [];
  const authors = [owner, ...coauthors.map(candidate => authorFrom(record(candidate)?.user ?? candidate))]
    .filter((author): author is Author => author !== null)
    .filter((author, index, all) => all.findIndex(other => other.username === author.username) === index);
  // Instagram 接口有 REST 的 usertags.in 与 GraphQL 的 tagged_user.edges 两种结构。
  const tagNodes = [path(item, 'usertags', 'in'), item.tagged_users,
    path(item, 'edge_media_to_tagged_user', 'edges')]
    .flatMap(value => Array.isArray(value) ? value : []);
  const taggedUsers = tagNodes
    .map(candidate => authorFrom(path(candidate, 'node', 'user') ?? record(candidate)?.user ?? candidate))
    .filter((author): author is Author => author !== null)
    .filter((author, index, all) => all.findIndex(other => other.username === author.username) === index);
  // 两类接口都提供明确的 sponsor 关联，不能从普通标记或文案推断赞助关系。
  const sponsors = [item.sponsor_tags, path(item, 'edge_media_to_sponsor_user', 'edges')]
    .flatMap(value => Array.isArray(value) ? value.slice(0, 20) : [])
    .map(candidate => authorFrom(path(candidate, 'node', 'sponsor') ?? record(candidate)?.sponsor))
    .filter((author): author is Author => author !== null && /^[A-Za-z0-9._]{1,30}$/.test(author.username))
    .filter((author, index, all) => all.findIndex(other => other.username.toLowerCase() === author.username.toLowerCase()) === index);
  const captionNode = path(item, 'edge_media_to_caption', 'edges');
  const caption = first(
    path(item, 'caption', 'text'),
    item.caption,
    Array.isArray(captionNode) ? path(captionNode[0], 'node', 'text') : null,
  );
  const videoVersions = path(item, 'video_versions');
  const images = path(item, 'image_versions2', 'candidates');
  return {
    code,
    url: `https://www.instagram.com/reel/${encodeURIComponent(code)}/`,
    mediaId: identifier(item.pk) ?? identifier(item.id),
    publishedAt: publicationTime(item.taken_at) ?? publicationTime(item.taken_at_timestamp),
    authors,
    taggedUsers,
    sponsors,
    caption,
    videoUrl: mediaUrl(first(item.video_url, Array.isArray(videoVersions) ? record(videoVersions[0])?.url : null)),
    coverUrl: mediaUrl(first(item.display_url, item.thumbnail_src, item.cover_url,
      Array.isArray(images) ? record(images[0])?.url : null)),
    plays: number(item.play_count, item.ig_play_count, item.video_view_count, item.view_count,
      item.content_views_count, item.video_views),
    likes: number(item.like_count, path(item, 'edge_media_preview_like', 'count'), path(item, 'edge_liked_by', 'count')),
    comments: number(item.comment_count, path(item, 'edge_media_to_comment', 'count'), path(item, 'edge_media_preview_comment', 'count')),
    reposts: number(item.repost_count, item.media_repost_count, item.reshare_count),
  };
}

/** 遍历嵌套响应，收集并合并相同 shortcode 的 Reel。 */
export function findReels(payload: unknown): Reel[] {
  const found = new Map<string, Reel>();
  const seen = new WeakSet<object>();
  /** 用 WeakSet 避免循环引用，并只继续遍历对象节点。 */
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    const reel = reelFrom(value);
    if (reel) found.set(reel.code, mergeReels(found.get(reel.code), reel));
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') visit(child);
    }
  }
  visit(payload);
  return [...found.values()];
}

/** 合并页面与接口信息，保留先前已经取得的非空字段。 */
export function mergeReels(existing: Reel | undefined, incoming: Reel): Reel {
  if (!existing) return incoming;
  /** 按 username 合并账号，同时保留之前读到的非空资料。 */
  function mergeUsers(previous: Author[], next: Author[]): Author[] {
    const users = [...previous];
    for (const user of next) {
      const index = users.findIndex(other => other.username === user.username);
      if (index < 0) users.push(user);
      else users[index] = {
        ...users[index]!,
        ...Object.fromEntries(Object.entries(user).filter(([, value]) => value !== null)),
      } as Author;
    }
    return users;
  }
  return {
    ...existing,
    ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value !== null)),
    authors: mergeUsers(existing.authors, incoming.authors),
    taggedUsers: mergeUsers(existing.taggedUsers, incoming.taggedUsers),
    sponsors: mergeUsers(existing.sponsors ?? [], incoming.sponsors ?? []),
  } as Reel;
}

/** 检查跨世界事件并重新构造数据，避免直接信任页面派发的对象。 */
export function reelFromPageEvent(value: unknown): Reel | null {
  const item = record(value);
  const code = string(item?.code);
  if (!code || !/^[A-Za-z0-9_-]+$/.test(code) || !Array.isArray(item?.authors)) return null;
  /** 将跨世界账号对象重新构造成受控字段，拒绝无效 username。 */
  function eventUsers(values: unknown[]): Author[] {
    return values.map(value => {
      const author = record(value);
      return authorFrom({
        username: author?.username, pk: author?.id, full_name: author?.name,
        profile_pic_url: author?.avatar, is_verified: author?.verified,
        biography: author?.biography, follower_count: author?.followers,
        following_count: author?.following, media_count: author?.posts,
        is_private: author?.private, external_url: author?.externalUrl,
      });
    }).filter((author): author is Author => author !== null);
  }
  const authors = eventUsers(item.authors);
  if (!authors.length) return null;
  return {
    code,
    url: `https://www.instagram.com/reel/${encodeURIComponent(code)}/`,
    mediaId: identifier(item.mediaId),
    publishedAt: publicationTime(item.publishedAt),
    authors,
    taggedUsers: eventUsers(Array.isArray(item.taggedUsers) ? item.taggedUsers : []),
    sponsors: eventUsers(Array.isArray(item.sponsors) ? item.sponsors.slice(0, 20) : [])
      .filter(author => /^[A-Za-z0-9._]{1,30}$/.test(author.username)),
    caption: string(item.caption),
    videoUrl: mediaUrl(item.videoUrl),
    coverUrl: mediaUrl(item.coverUrl),
    plays: count(item.plays), likes: count(item.likes),
    comments: count(item.comments),
    reposts: count(item.reposts),
  };
}
