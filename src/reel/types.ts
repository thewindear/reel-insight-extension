/** 页面可提供的作者资料；未公开的字段以 null 表示。 */
export type Author = {
  id: string | null;
  username: string;
  name: string | null;
  avatar: string | null;
  verified: boolean | null;
  biography: string | null;
  followers: number | null;
  following: number | null;
  posts: number | null;
  private: boolean | null;
  externalUrl: string | null;
  profileUrl: string;
};

/** 单独保存的达人资料；账户简介未提供的字段以 null 表示。 */
export type Profile = Author & {
  bioLinks: string[];
  /** 页面明确提供完整链接列表时为 true；旧记录可能没有此字段。 */
  bioLinksComplete?: boolean;
  joinedAt: string | null;
  basedIn: string | null;
  verifiedAt: string | null;
};

/** 内容脚本与 popup 共用的 Reel 数据结构。 */
export type Reel = {
  code: string;
  url: string;
  mediaId: string | null;
  /** 发布时间，使用 UTC ISO 8601 格式；未取得时为 null。 */
  publishedAt: string | null;
  authors: Author[];
  taggedUsers: Author[];
  caption: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  plays: number | null;
  likes: number | null;
  comments: number | null;
  reposts: number | null;
};

/** 用户主页逐条补全详情时的进度。 */
export type ProfileProgress = {
  state: 'idle' | 'running' | 'scanning' | 'done' | 'stopped' | 'error';
  completed: number;
  total: number;
  failed: number;
};

/** popup 向当前标签页请求 Reel 数据时的有限状态。 */
export type ReelReply = { status: 'ready'; reel: Reel; saveError?: boolean; autoSave?: boolean } |
  { status: 'profile'; progress: ProfileProgress; workerTabId?: number; workerHere?: true; hasReels?: boolean } | { status: 'loading' | 'not-reel' };
