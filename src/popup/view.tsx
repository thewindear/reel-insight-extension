import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, AtSign, BadgeCheck, Clapperboard, Copy, Download, ExternalLink, Hash, Heart, MessageCircle, Play, RefreshCw, Repeat2, Settings2, Square, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { captionEntities } from '../reel/caption';
import { withoutShares, type SavedProfile, type SavedReel } from '../reel/records';
import { defaultSettings, settingsFrom, type Settings } from '../reel/settings';
import type { Author, Reel } from '../reel/types';
import { downloadExcel, downloadProfilesExcel } from './export';
import { translate, type Language } from '../reel/i18n';
import { paginate } from './pagination';
import { useReel } from './use-reel';
import { copyText } from './clipboard';

const LanguageContext = createContext<Language>('zh');

/** 让各层详情组件读取抽屉当前选择的语言。 */
function useText(): (chinese: string) => string {
  const language = useContext(LanguageContext);
  return (chinese: string) => translate(language, chinese);
}

/** 按中文数字格式显示计数，缺失值保持可辨认。 */
function formatCount(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('zh-CN').format(value);
}

/** 按浏览器本地时区显示已校验的发布时间。 */
function formatPublishedAt(value: string, language: Language): string {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

/** 限制外链为 HTTPS，避免页面数据注入不安全协议。 */
function safeHref(value: string | null): string | null {
  if (!value) return null;
  try { return new URL(value).protocol === 'https:' ? value : null; }
  catch { return null; }
}

/** 渲染包含可选数量提示的分区标题。 */
function SectionTitle({ title, count }: { title: string; count?: string }): React.ReactNode {
  const t = useText();
  return <div className="mb-3 flex items-baseline justify-between">
    <h2 className="text-[13px] font-semibold tracking-tight text-foreground">{t(title)}</h2>
    {count && <span className="text-[11px] text-muted-foreground">{count}</span>}
  </div>;
}

/** 在概览中展示一项互动数据。 */
function MetricTile({ label, value, icon: Icon }: { label: string; value: number | null; icon: typeof Play }): React.ReactNode {
  const t = useText();
  return <div className="flex h-full min-w-0 flex-col justify-between bg-card p-2.5">
    <Icon aria-hidden="true" className="size-4 text-primary" strokeWidth={1.8} />
    <div>
      <div className="truncate text-[20px] font-semibold tracking-[-0.045em] tabular-nums text-foreground">{formatCount(value)}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{t(label)}</div>
    </div>
  </div>;
}

/** 展示作者或标记用户的头像、身份和页面可提供的账号资料。 */
function AuthorRow({ author, role }: { author: Author; role: '发布者' | '合作者' | '已标记' }): React.ReactNode {
  const t = useText();
  const profile = `https://www.instagram.com/${encodeURIComponent(author.username)}/`;
  return <div className="py-3">
    <div className="flex items-center gap-3">
      <Avatar size="lg" className="rounded-[13px] ring-1 ring-border">
        {author.avatar && <AvatarImage src={author.avatar} alt={`${author.username} ${t('头像')}`} className="object-cover" />}
        <AvatarFallback className="rounded-[13px] bg-secondary font-semibold text-foreground">
          {author.username[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <a href={profile} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 truncate text-[13px] font-semibold text-foreground hover:text-primary">
          <span className="truncate">{author.name || author.username}</span>
          {author.verified && <BadgeCheck aria-label={t('已认证')} className="size-3.5 shrink-0 fill-sky-500 text-white" />}
        </a>
        <p className="truncate text-[11px] text-muted-foreground">@{author.username}</p>
      </div>
      <Badge variant={role === '发布者' ? 'secondary' : 'outline'} className="shrink-0 rounded-md text-[10px]">
        {t(role)}
      </Badge>
    </div>
    <div className="ml-[52px] mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span>ID <span className="font-mono text-foreground/80">{author.id ?? '—'}</span></span>
      {author.followers !== null && <span>{t('粉丝')} <span className="tabular-nums text-foreground/80">{formatCount(author.followers)}</span></span>}
      {author.following !== null && <span>{t('关注')} <span className="tabular-nums text-foreground/80">{formatCount(author.following)}</span></span>}
      {author.posts !== null && <span>{t('帖子')} <span className="tabular-nums text-foreground/80">{formatCount(author.posts)}</span></span>}
      {author.private !== null && <span>{t(author.private ? '私密账号' : '公开账号')}</span>}
    </div>
    {author.biography && <p className="ml-[52px] mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{author.biography}</p>}
    {safeHref(author.externalUrl) && <a href={author.externalUrl!} target="_blank" rel="noopener noreferrer" className="ml-[52px] mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline">{t('作者链接')} <ExternalLink className="size-3" /></a>}
  </div>;
}

/** 按标签、提及或网址展示 caption 的解析结果。 */
function EntityGroup({ title, values, kind }: { title: string; values: string[]; kind: 'tag' | 'mention' | 'link' }): React.ReactNode {
  const t = useText();
  return <div className="space-y-2">
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
      {kind === 'tag' ? <Hash className="size-3.5" /> : kind === 'mention' ? <AtSign className="size-3.5" /> : <ExternalLink className="size-3.5" />}
      {t(title)} <span className="font-mono text-muted-foreground/70">{values.length}</span>
    </div>
    <div className="flex flex-wrap gap-1.5">
      {values.length ? values.map(value => {
        const href = kind === 'tag' ? `https://www.instagram.com/explore/tags/${encodeURIComponent(value)}/` :
          kind === 'mention' ? `https://www.instagram.com/${encodeURIComponent(value)}/` : safeHref(value);
        const label = `${kind === 'tag' ? '#' : kind === 'mention' ? '@' : ''}${value}`;
        return href ? <Badge asChild variant="secondary" key={value} className="max-w-full rounded-md px-2 py-1 text-[11px] font-normal hover:bg-accent">
          <a href={href} target="_blank" rel="noopener noreferrer" className="truncate">{label}</a>
        </Badge> : <Badge variant="outline" key={value} className="max-w-full truncate rounded-md px-2 py-1 text-[11px] font-normal">{label}</Badge>;
      }) : <span className="text-[11px] text-muted-foreground/70">{t('未发现')}</span>}
    </div>
  </div>;
}

/** 为视频页、原视频及封面显示安全的外链行。 */
function ResourceRow({ label, url }: { label: string; url: string | null }): React.ReactNode {
  const t = useText();
  const href = safeHref(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className="group flex items-center justify-between gap-3 py-2.5 text-[12px] text-foreground hover:text-primary">
    <span>{t(label)}</span><ExternalLink aria-hidden="true" className="size-3.5 text-muted-foreground group-hover:text-primary" />
  </a> : <div className="flex justify-between py-2.5 text-[12px] text-muted-foreground/70"><span>{t(label)}</span><span>{t('未提供')}</span></div>;
}

/** 将完整的 Reel 数据按阅读顺序展示。 */
function ReelDetails({ reel }: { reel: Reel }): React.ReactNode {
  const t = useText();
  const language = useContext(LanguageContext);
  const entities = captionEntities(reel.caption ?? '');
  // 扩展刚更新但 Instagram 尚未刷新时，旧内容脚本可能不包含新字段。
  const taggedUsers = reel.taggedUsers ?? [];
  return <div className="space-y-6 pb-5">
    <section>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">REEL DETAILS</p>
          <h1 className="text-[23px] font-semibold tracking-[-0.055em] text-foreground">{t('视频详情')}</h1>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('发布时间')} · {reel.publishedAt ?
            <time dateTime={reel.publishedAt} className="tabular-nums text-foreground/80">{formatPublishedAt(reel.publishedAt, language)}</time> : '—'}</p>
        </div>
        <Badge variant="outline" className="max-w-[145px] truncate rounded-md font-mono text-[10px] text-muted-foreground">{reel.code}</Badge>
      </div>
      <div className="grid grid-cols-[136px_1fr] gap-2.5">
        <div className="relative h-[240px] overflow-hidden rounded-xl bg-secondary">
          {safeHref(reel.coverUrl) ? <img src={reel.coverUrl!} alt={t('Reel 封面')} className="size-full object-cover" /> :
            <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground"><Clapperboard className="size-6" strokeWidth={1.5} /><span className="text-[11px]">{t('封面未提供')}</span></div>}
          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-black/65 px-2 py-1 text-[9px] font-semibold tracking-[0.14em] text-white">REEL</span>
        </div>
        <div className="grid grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
          <MetricTile label="播放量" value={reel.plays} icon={Play} />
          <MetricTile label="赞数" value={reel.likes} icon={Heart} />
          <MetricTile label="评论数" value={reel.comments} icon={MessageCircle} />
          <MetricTile label="转发数" value={reel.reposts} icon={Repeat2} />
        </div>
      </div>
    </section>

    <section>
      <SectionTitle title="作者信息" count={`${reel.authors.length} ${t('位')}`} />
      <div className="rounded-xl border border-border bg-card px-3.5">
        {reel.authors.map((author, index) => <div key={author.username}>
          {index > 0 && <Separator />}
          <AuthorRow author={author} role={index === 0 ? '发布者' : '合作者'} />
        </div>)}
      </div>
    </section>

    <section>
      <SectionTitle title="标记的用户" count={`${taggedUsers.length} ${t('位')}`} />
      {taggedUsers.length ? <div className="rounded-xl border border-border bg-card px-3.5">
        {taggedUsers.map((user, index) => <div key={user.username}>
          {index > 0 && <Separator />}
          <AuthorRow author={user} role="已标记" />
        </div>)}
      </div> : <p className="rounded-xl bg-secondary/70 px-3.5 py-3 text-[12px] text-muted-foreground">{t('当前页面未提供标记用户')}</p>}
    </section>

    <section>
      <SectionTitle title="Caption" />
      <p className="rounded-xl bg-secondary/70 px-3.5 py-3 text-[12px] leading-[1.7] whitespace-pre-wrap break-words text-foreground/90">
        {reel.caption || <span className="text-muted-foreground">{t('当前页面未提供文案')}</span>}
      </p>
    </section>

    <section>
      <SectionTitle title="文案解析" />
      <div className="space-y-4">
        <EntityGroup title="Tags" values={entities.tags} kind="tag" />
        <EntityGroup title="提及的人" values={entities.mentions} kind="mention" />
        <EntityGroup title="链接" values={entities.links} kind="link" />
      </div>
    </section>

    <section>
      <SectionTitle title="原始资源" />
      <div className="divide-y divide-border rounded-xl border border-border bg-card px-3.5">
        <ResourceRow label="Reel 原页" url={reel.url} />
        <ResourceRow label="视频原地址" url={reel.videoUrl} />
        <ResourceRow label="视频封面" url={reel.coverUrl} />
      </div>
      <p className="mt-2 font-mono text-[10px] text-muted-foreground">{t('视频 ID')} · {reel.mediaId ?? '—'}</p>
    </section>
  </div>;
}

/** 页面和视频还在加载时展示与最终布局接近的骨架屏。 */
function LoadingState(): React.ReactNode {
  const t = useText();
  return <div className="space-y-5" aria-label={t('正在读取视频')}>
    <div className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-28" /></div>
    <div className="grid grid-cols-[136px_1fr] gap-2.5"><Skeleton className="h-[240px] rounded-xl" /><Skeleton className="h-[240px] rounded-xl" /></div>
    <div className="space-y-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div>
  </div>;
}

/** 用清楚的下一步操作说明替代空白 popup。 */
function EmptyState({ kind, onRefresh }: { kind: 'not-reel' | 'not-instagram' | 'unavailable' | 'needs-refresh'; onRefresh: () => void }): React.ReactNode {
  const t = useText();
  const message = {
    'not-instagram': ['打开 Instagram', '请在 Instagram 的 Reel 视频页面打开此插件。'],
    'not-reel': ['等待 Reel 数据', '打开一条 Reel，或进入用户的 Reels 标签页。'],
    unavailable: ['暂未读到数据', '请确认视频已加载，必要时刷新 Instagram 页面。'],
    'needs-refresh': ['需要刷新页面', '扩展刚安装或更新时，请刷新 Instagram 页面。'],
  }[kind] as [string, string];
  return <div className="flex min-h-[370px] flex-col items-center justify-center text-center">
    <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-secondary text-primary"><Clapperboard className="size-6" strokeWidth={1.6} /></div>
    <h1 className="text-[18px] font-semibold tracking-tight">{t(message[0])}</h1>
    <p className="mt-2 max-w-[235px] text-[12px] leading-relaxed text-muted-foreground">{t(message[1])}</p>
    <Button variant="outline" size="sm" className="mt-5" onClick={onRefresh}><RefreshCw className="size-3.5" />{t('重新读取')}</Button>
  </div>;
}

/** 在记录表展示封面、简短文案和主作者，点击记录行查看完整字段。 */
function SavedTable({ records, currentCode, onSelect }: { records: SavedReel[]; currentCode: string | null; onSelect: (code: string) => void }): React.ReactNode {
  const t = useText();
  const language = useContext(LanguageContext);
  return <div className="overflow-x-auto rounded-xl border border-border bg-card">
    <table className="w-full min-w-[1324px] table-fixed border-collapse text-left text-[11px]">
      <thead className="bg-secondary text-muted-foreground"><tr>
        <th scope="col" className="w-[76px] border-b border-border px-3 py-2.5 font-medium">{t('视频封面')}</th>
        <th scope="col" className="w-[230px] border-b border-border px-3 py-2.5 font-medium">Caption</th>
        <th scope="col" className="w-[190px] border-b border-border px-3 py-2.5 font-medium">{t('主作者')}</th>
        <th scope="col" className="w-[116px] border-b border-border px-3 py-2.5 font-medium">shortcode</th>
        <th scope="col" className="w-[200px] border-b border-border px-3 py-2.5 font-medium">reels_id</th>
        <th scope="col" className="w-[132px] border-b border-border px-3 py-2.5 font-medium">{t('发布时间')}</th>
        {['播放量', '赞数', '评论数', '转发数'].map(label =>
          <th key={label} scope="col" className="w-[76px] whitespace-nowrap border-b border-border px-3 py-2.5 text-right font-medium">{t(label)}</th>)}
      </tr></thead>
      <tbody>{records.map(reel => {
        const author = reel.authors[0];
        const cover = safeHref(reel.coverUrl);
        const avatar = safeHref(author?.avatar ?? null);
        const url = safeHref(reel.url);
        return <tr key={reel.code} onClick={() => onSelect(reel.code)} className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-secondary/60">
        <td className="px-3 py-2">{cover ? <img src={cover} alt={`${reel.code} ${t('视频封面')}`} className="h-[64px] w-[44px] rounded-md object-cover" /> : <span className="flex h-[64px] w-[44px] items-center justify-center rounded-md bg-secondary text-muted-foreground"><Clapperboard className="size-4" aria-label={t('无封面')} /></span>}</td>
        <td className="px-3 py-3"><span title={reel.caption ?? undefined} className="line-clamp-2 break-words whitespace-pre-wrap leading-4">{reel.caption || '—'}</span></td>
        <td className="px-3 py-3"><div className="flex items-center gap-2">
          <Avatar className="ring-1 ring-border">
            {avatar && <AvatarImage src={avatar} alt={`${author?.username ?? t('主作者')} ${t('头像')}`} className="object-cover" />}
            <AvatarFallback>{author?.username?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0"><div className="break-words font-medium">{author?.name || author?.username || '—'}</div><div className="break-all text-muted-foreground">{author ? `@${author.username}` : '—'}</div></div>
        </div></td>
        <td className="break-all px-3 py-3 font-mono">{url ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()} title={url} aria-label={`${t('打开 Reel')} ${reel.code}`} className="text-primary underline-offset-2 hover:underline">{reel.code}</a> : reel.code}</td>
        <td className="break-all px-3 py-3 align-middle"><button type="button" onClick={event => { event.stopPropagation(); onSelect(reel.code); }} className="font-mono font-semibold text-primary underline-offset-2 hover:underline focus-visible:underline">{reel.mediaId ?? reel.code}</button>{reel.code === currentCode && <span className="ml-1.5 text-[9px] text-primary">{t('当前')}</span>}</td>
        <td className="px-3 py-3">{reel.publishedAt ? formatPublishedAt(reel.publishedAt, language) : '—'}</td>
        {[reel.plays, reel.likes, reel.comments, reel.reposts].map((value, index) =>
          <td key={index} className="px-3 py-3 text-right tabular-nums">{formatCount(value)}</td>)}
      </tr>;
      })}</tbody>
    </table>
  </div>;
}

/** 默认将 bio 限制为两行，仅在文字实际溢出时显示展开按钮。 */
function BioText({ text }: { text: string | null }): React.ReactNode {
  const t = useText();
  const content = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    // 临时移除截断后测量真实高度，避免浏览器对 line-clamp 的 scrollHeight 实现不同。
    const original = element.style.webkitLineClamp;
    element.style.webkitLineClamp = 'unset';
    const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
    setOverflow(element.scrollHeight > lineHeight * 2 + 1);
    element.style.webkitLineClamp = original;
  }, [text]);

  if (text === null) return '—';
  return <div>
    <p ref={content} className={`whitespace-pre-wrap break-words leading-4 ${expanded ? '' : 'line-clamp-2'}`}>{text}</p>
    {overflow && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="mt-1 text-primary hover:underline">{t(expanded ? '收起' : '显示更多')}</button>}
  </div>;
}

/** 以域名展示 bio 链接，超过三个时允许展开，点击复制图标复制完整 HTTPS 地址。 */
function BioLinks({ links }: { links: string[] }): React.ReactNode {
  const t = useText();
  const [copyStatus, setCopyStatus] = useState<{ url: string; error: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const validLinks = links.map(safeHref).filter((url): url is string => url !== null);

  /** 将完整链接写入剪贴板，并在当前链接旁反馈结果。 */
  async function copyLink(url: string): Promise<void> {
    try { await copyText(url); setCopyStatus({ url, error: false }); }
    catch { setCopyStatus({ url, error: true }); }
    setTimeout(() => setCopyStatus(null), 1800);
  }

  return validLinks.length ? <div className="space-y-1.5">{(expanded ? validLinks : validLinks.slice(0, 3)).map(url => {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    return <div key={url}>
      <div className="flex min-w-0 items-center gap-1">
        <a href={url} title={url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-primary hover:underline">{domain}</a>
        <Button type="button" size="icon-xs" variant="ghost" aria-label={`${t('复制链接')} ${domain}`} title={t('复制链接')} onClick={() => void copyLink(url)}><Copy className="size-3" /></Button>
      </div>
      {copyStatus?.url === url && <span role="status" className={copyStatus.error ? 'text-destructive' : 'text-muted-foreground'}>{t(copyStatus.error ? '复制失败，请重试' : '已复制链接')}</span>}
    </div>;
  })}{validLinks.length > 3 && <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="text-primary hover:underline">{t(expanded ? '收起' : '显示更多')}</button>}</div> : '—';
}

/** 在独立列表中展示达人资料，未公开的值统一显示为破折号。 */
function ProfilesTable({ records }: { records: SavedProfile[] }): React.ReactNode {
  const t = useText();
  return <div className="overflow-x-auto rounded-xl border border-border bg-card">
    <table className="w-full min-w-[1700px] table-fixed border-collapse text-left text-[11px]">
      <thead className="bg-secondary text-muted-foreground"><tr>
        {['头像', '昵称', 'ins id', 'username', '帖子数', '粉丝数', '关注数', 'bio', 'bio 里的链接', '是否认证', '加入时间', '账户所在地', '认证时间'].map((label, index) =>
          <th key={label} scope="col" className="border-b border-border px-3 py-2.5 font-medium" style={{ width: index === 7 || index === 8 ? 230 : index === 0 ? 68 : 120 }}>{t(label)}</th>)}
      </tr></thead>
      <tbody>{records.map(profile => <tr key={profile.username} className="border-b border-border/70 align-top last:border-0">
        <td className="px-3 py-3"><Avatar className="ring-1 ring-border">{safeHref(profile.avatar) && <AvatarImage src={profile.avatar!} alt={`${profile.username} ${t('头像')}`} />}<AvatarFallback>{profile.username[0]?.toUpperCase()}</AvatarFallback></Avatar></td>
        <td className="break-words px-3 py-3">{profile.name ?? '—'}</td>
        <td className="break-all px-3 py-3 font-mono">{profile.id ?? '—'}</td>
        <td className="break-all px-3 py-3"><a href={profile.profileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@{profile.username}</a></td>
        {[profile.posts, profile.followers, profile.following].map((value, index) => <td key={index} className="px-3 py-3 tabular-nums">{formatCount(value)}</td>)}
        <td className="px-3 py-3"><BioText text={profile.biography} /></td>
        <td className="px-3 py-3"><BioLinks links={profile.bioLinks} /></td>
        <td className="px-3 py-3">{profile.verified === null ? '—' : t(profile.verified ? '是' : '否')}</td>
        <td className="px-3 py-3">{profile.joinedAt ?? '—'}</td>
        <td className="break-words px-3 py-3">{profile.basedIn ?? '—'}</td>
        <td className="px-3 py-3">{profile.verifiedAt ?? '—'}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

/** 组合采集状态、记录表、详情和导出操作。 */
export function Popup(): React.ReactNode {
  const { state, refresh, controlEnrichment } = useReel();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [records, setRecords] = useState<SavedReel[]>([]);
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [tab, setTab] = useState<'reels' | 'profiles'>('reels');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<'export' | 'clear' | 'confirm-clear'>('export');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copyLabel, setCopyLabel] = useState<'idle' | 'copied' | 'error'>('idle');
  const dialog = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);
  const currentCode = state.kind === 'ready' ? state.reel.code : null;
  const reel = selected ? records.find(row => row.code === selected) ?? null : null;
  const reelListing = paginate(records, page, pageSize);
  const profileListing = paginate(profiles, page, pageSize);
  const listing = tab === 'reels' ? reelListing : profileListing;
  const activeCount = tab === 'reels' ? records.length : profiles.length;
  /** 将当前语言用于抽屉自身的静态文案。 */
  const t = (chinese: string): string => translate(settings.language, chinese);

  /** 保存配置并立即更新界面，其他标签页会通过存储变更同步。 */
  async function changeSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setError('');
    try { await browser.storage.local.set({ settings: next }); }
    catch { setSettings(settings); setError('保存设置失败，请重试。'); }
  }

  /** 读取配置，并跟随其他抽屉中的修改。 */
  useEffect(() => {
    let changed = false;
    /** 只响应配置键，记录更新交给原有监听器。 */
    function onChanged(changes: Record<string, { newValue?: unknown }>, area: string): void {
      if (area === 'local' && 'settings' in changes) { changed = true; setSettings(settingsFrom(changes.settings?.newValue)); }
    }
    browser.storage.onChanged.addListener(onChanged);
    void browser.storage.local.get('settings').then(stored => { if (!changed) setSettings(settingsFrom(stored.settings)); })
      .catch(() => setError('保存设置失败，请重试。'));
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  /** 监听独立的达人记录，不影响已有视频记录。 */
  useEffect(() => {
    let revision = 0;
    /** 只同步本地达人记录。 */
    function onChanged(changes: Record<string, { newValue?: unknown }>, area: string): void {
      if (area === 'local' && 'profiles' in changes) {
        revision++;
        setProfiles(Array.isArray(changes.profiles?.newValue) ? changes.profiles.newValue as SavedProfile[] : []);
      }
    }
    browser.storage.onChanged.addListener(onChanged);
    void browser.storage.local.get('profiles').then(value => {
      if (revision === 0) setProfiles(Array.isArray(value.profiles) ? value.profiles as SavedProfile[] : []);
    }).catch(() => setError('读取保存记录失败，请重新打开插件。'));
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  /** 切换页码后把记录表带回视口顶部。 */
  function goToPage(next: number): void {
    setPage(next);
    main.current?.scrollTo({ top: 0 });
  }

  /** 切换记录类别并返回列表第一页。 */
  function switchTab(next: 'reels' | 'profiles'): void {
    setTab(next);
    setSelected(null);
    goToPage(1);
  }

  /** 允许用方向键在两个标签间切换。 */
  function onTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = tab === 'reels' ? 'profiles' : 'reels';
    switchTab(next);
    document.getElementById(`${next}-tab`)?.focus();
  }

  /** 删除记录导致最后一页消失时，将页码同步到仍有效的末页。 */
  useEffect(() => { if (page !== listing.page) setPage(listing.page); }, [page, listing.page]);

  /** 从扩展本地存储读取记录，并在其他页面保存新视频时同步列表。 */
  useEffect(() => {
    let revision = 0;
    /** 只响应本地 Reel 记录变化。 */
    function onChanged(changes: Record<string, { newValue?: unknown }>, area: string): void {
      if (area === 'local' && 'reels' in changes) {
        revision++;
        setRecords(Array.isArray(changes.reels?.newValue) ? withoutShares(changes.reels.newValue as SavedReel[]) : []);
      }
    }
    browser.storage.onChanged.addListener(onChanged);
    void browser.storage.local.get('reels').then(value => {
      if (revision === 0) setRecords(Array.isArray(value.reels) ? withoutShares(value.reels as SavedReel[]) : []);
    }).catch(() => setError('读取保存记录失败，请重新打开插件。'));
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  /** 打开导出或清空确认弹窗。 */
  function openDialog(nextMode: 'export' | 'clear'): void {
    setMode(nextMode);
    setError('');
    dialog.current?.showModal();
  }

  /** 下载触发后等待用户确认文件已保存，再执行清空。 */
  async function finishAction(clearAfterExport: boolean): Promise<void> {
    setBusy(true);
    setError('');
    try {
      if (mode === 'export') {
        if (tab === 'reels') await downloadExcel(records, settings.language);
        else await downloadProfilesExcel(profiles, settings.language);
        if (clearAfterExport) { setMode('confirm-clear'); return; }
      }
      if (mode === 'clear' || mode === 'confirm-clear') {
        const reply = await browser.runtime.sendMessage({ type: tab === 'reels' ? 'CLEAR_REELS' : 'CLEAR_PROFILES' });
        if (reply?.saved !== true) throw new Error('clear failed');
        if (tab === 'reels') setRecords([]);
        else setProfiles([]);
        setSelected(null);
      }
      dialog.current?.close();
    } catch { setError(mode === 'export' ? '导出或清空失败，记录已保留，请重试。' : '清空失败，请重试。'); }
    finally { setBusy(false); }
  }

  /** 复制详情中的完整字段及文案解析结果。 */
  async function copyJson(): Promise<void> {
    if (!reel) return;
    try {
      await copyText(JSON.stringify({ ...reel, ...captionEntities(reel.caption ?? '') }, null, 2));
      setCopyLabel('copied');
    } catch { setCopyLabel('error'); }
    setTimeout(() => setCopyLabel('idle'), 1800);
  }

  /** 在当前用户 Reels 网格启动或停止逐条打开详情的补全任务。 */
  async function toggleEnrichment(): Promise<void> {
    setError('');
    try {
      await controlEnrichment(state.kind === 'profile' && (state.progress.state === 'running' || state.progress.state === 'scanning') ?
        'STOP_PROFILE_ENRICHMENT' : 'START_PROFILE_ENRICHMENT');
    } catch { setError('补全操作失败，请确认仍在用户的 Reels 列表页并刷新重试。'); }
  }

  /** 在当前 Instagram 达人页手动采集一次资料。 */
  async function collectProfile(): Promise<void> {
    setError('');
    try { await controlEnrichment('COLLECT_PROFILE'); }
    catch { setError('采集达人失败，请确认仍在达人主页并刷新重试。'); }
  }

  return <LanguageContext.Provider value={settings.language}><div className="flex h-[640px] w-[448px] flex-col overflow-hidden bg-background text-foreground">
    <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-border px-5">
      <div className="flex items-center gap-2.5">
        <img src={browser.runtime.getURL('/icon-128.png')} alt="" className="size-8 shrink-0" />
        <div className="leading-tight"><div className="text-[13px] font-semibold tracking-[-0.02em]">Reel Insight</div><div className="mt-0.5 text-[10px] text-muted-foreground">{t('已保存')} {records.length} {t('条 Reel')} · {profiles.length} {t('位达人')}</div></div>
      </div>
      <div className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={t('设置')} aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)} className="text-muted-foreground"><Settings2 className="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={t('重新读取')} onClick={refresh} className="text-muted-foreground"><RefreshCw className="size-4" /></Button></div>
    </header>
    <main ref={main} className="min-h-0 flex-1 overflow-y-auto px-5 pt-5" aria-live="polite">
      {settingsOpen && <section aria-label={t('设置')} className="mb-4 space-y-3 rounded-xl border border-border bg-secondary/50 p-3">
        <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold">{t('设置')}</h2>
          <label className="flex items-center gap-2 text-[11px]">{t('语言')}
            <select value={settings.language} onChange={event => void changeSetting('language', event.target.value === 'en' ? 'en' : 'zh')} className="h-8 rounded-md border border-border bg-background px-2 text-foreground">
              <option value="zh">{t('中文')}</option><option value="en">{t('英文')}</option>
            </select>
          </label>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3"><div><p className="text-[12px] font-medium">{t('自动采集 Reels 推荐页')}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{t('上下切换视频时自动保存')}</p></div>
          <Button size="xs" variant={settings.autoFeed ? 'default' : 'outline'} aria-label={`${t('自动采集 Reels 推荐页')}: ${t(settings.autoFeed ? '开启' : '关闭')}`} aria-pressed={settings.autoFeed} onClick={() => void changeSetting('autoFeed', !settings.autoFeed)}>{t(settings.autoFeed ? '开启' : '关闭')}</Button>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3"><div><p className="text-[12px] font-medium">{t('自动采集达人资料')}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{t('进入达人主页时保存资料与账户简介')}</p></div>
          <Button size="xs" variant={settings.autoProfileData ? 'default' : 'outline'} aria-label={`${t('自动采集达人资料')}: ${t(settings.autoProfileData ? '开启' : '关闭')}`} aria-pressed={settings.autoProfileData} onClick={() => void changeSetting('autoProfileData', !settings.autoProfileData)}>{t(settings.autoProfileData ? '开启' : '关闭')}</Button>
        </div>
        <div className="flex items-center justify-between gap-3"><label htmlFor="profile-data-mode" className="text-[12px]">{t('达人资料采集位置')}</label>
          <select id="profile-data-mode" value={settings.profileDataMode} onChange={event => void changeSetting('profileDataMode', event.target.value === 'current-tab' ? 'current-tab' : 'new-tab')} className="h-8 rounded-md border border-border bg-background px-2 text-[11px] text-foreground">
            <option value="new-tab">{t('独立采集窗口')}</option><option value="current-tab">{t('当前页')}</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3"><div><p className="text-[12px] font-medium">{t('自动采集达人 Reels 列表')}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{t('保存列表并逐条打开详情')}</p></div>
          <Button size="xs" variant={settings.autoProfile ? 'default' : 'outline'} aria-label={`${t('自动采集达人 Reels 列表')}: ${t(settings.autoProfile ? '开启' : '关闭')}`} aria-pressed={settings.autoProfile} onClick={() => void changeSetting('autoProfile', !settings.autoProfile)}>{t(settings.autoProfile ? '开启' : '关闭')}</Button>
        </div>
        <div className="flex items-center justify-between gap-3"><label htmlFor="profile-mode" className="text-[12px]">{t('Reels 列表采集位置')}</label>
          <select id="profile-mode" value={settings.profileMode} onChange={event => void changeSetting('profileMode', event.target.value === 'current-tab' ? 'current-tab' : 'new-tab')} className="h-8 rounded-md border border-border bg-background px-2 text-[11px] text-foreground">
            <option value="new-tab">{t('独立采集窗口')}</option><option value="current-tab">{t('当前页')}</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-3"><label htmlFor="profile-pages" className="text-[12px]">{t('采集前几页')}</label>
          <input id="profile-pages" type="number" min="1" max="100" step="1" value={settings.profilePages} onChange={event => void changeSetting('profilePages', Math.max(1, Math.min(100, Number(event.target.value) || 1)))} className="h-8 w-16 rounded-md border border-border bg-background px-2 text-center text-[11px] text-foreground" />
        </div>
        <p className="text-[10px] text-muted-foreground">{t('首次显示的列表为第 1 页；每次下拉后新加载的一批算下一页。')}</p>
      </section>}
      {error && !dialog.current?.open && <p role="alert" className="mb-3 rounded-md bg-destructive/10 p-3 text-[12px] text-destructive">{t(error)}</p>}
      {state.kind === 'ready' && state.saveError && <p role="alert" className="mb-3 rounded-md bg-destructive/10 p-3 text-[12px] text-destructive">{t('当前 Reel 保存失败，请检查扩展存储空间。')}</p>}
      {reel && tab === 'reels' ? <><Button variant="ghost" size="sm" onClick={() => setSelected(null)} className="mb-3 px-0"><ArrowLeft className="size-4" />{t('返回记录表')}</Button><ReelDetails reel={reel} /></> : <div className="space-y-4 pb-5">
        <div className="flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{tab === 'reels' ? 'SAVED REELS' : 'SAVED PROFILES'}</p><h1 className="mt-1 text-[23px] font-semibold tracking-[-0.055em]">{t('采集记录')}</h1></div><span className="text-right text-[11px] text-muted-foreground">{tab === 'reels' && <>{t('点击记录行查看详情')}<br /></>}{t('表格可横向滚动')}</span></div>
        <div role="tablist" aria-label={t('采集记录')} className="flex gap-2 border-b border-border pb-2">
          <Button id="reels-tab" role="tab" aria-controls="saved-records-panel" aria-selected={tab === 'reels'} tabIndex={tab === 'reels' ? 0 : -1} variant={tab === 'reels' ? 'default' : 'ghost'} size="sm" onKeyDown={onTabKeyDown} onClick={() => switchTab('reels')}>{t('视频')} · {records.length}</Button>
          <Button id="profiles-tab" role="tab" aria-controls="saved-records-panel" aria-selected={tab === 'profiles'} tabIndex={tab === 'profiles' ? 0 : -1} variant={tab === 'profiles' ? 'default' : 'ghost'} size="sm" onKeyDown={onTabKeyDown} onClick={() => switchTab('profiles')}>{t('达人')} · {profiles.length}</Button>
        </div>
        <div id="saved-records-panel" role="tabpanel" aria-labelledby={tab === 'reels' ? 'reels-tab' : 'profiles-tab'}>
        {state.kind === 'profile' && tab === 'reels' && state.hasReels !== false && <div className="mb-4 rounded-xl border border-border bg-secondary/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div><p className="text-[12px] font-medium">{t('补全列表 Caption')}</p><p className="mt-1 text-[11px] text-muted-foreground">{t('逐条打开已加载的 Reel 详情并返回列表')}</p></div>
            <Button size="sm" variant={state.progress.state === 'running' || state.progress.state === 'scanning' ? 'outline' : 'default'} disabled={settings.autoProfile && settings.profileMode === 'new-tab' && !state.workerTabId && !state.workerHere} onClick={() => void toggleEnrichment()}>
              {state.progress.state === 'running' || state.progress.state === 'scanning' ? <><Square className="size-3.5" />{t('停止')}</> : t('开始补全')}
            </Button>
          </div>
          {settings.autoProfile && settings.profileMode === 'new-tab' && !state.workerTabId && !state.workerHere && state.progress.state === 'idle' ? <p className="mt-2 text-[11px] text-muted-foreground" role="status">{t('正在打开采集窗口')}</p> :
            state.progress.state !== 'idle' && <p className="mt-2 text-[11px] text-muted-foreground" role="status">{t(state.progress.state === 'running' ? '正在补全' : state.progress.state === 'scanning' ? '正在加载更多 Reel' : state.progress.state === 'done' ? '补全结束' : state.progress.state === 'stopped' ? '已停止' : '补全中断')} · {t('已处理')} {state.progress.completed} / {state.progress.total}{state.progress.failed ? ` · ${t('未取得')} ${state.progress.failed}` : ''}</p>}
        </div>}
        {state.kind === 'profile' && tab === 'profiles' && <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-border bg-secondary/50 p-3">
          <div><p className="text-[12px] font-medium">{t('采集达人')}</p><p className="mt-1 text-[11px] text-muted-foreground">{t('采集当前达人的资料与账户简介')}</p></div>
          <Button size="sm" onClick={() => void collectProfile()}>{t('采集达人')}</Button>
        </div>}
        {activeCount > 0 ? <>
          {tab === 'reels' ? <SavedTable records={reelListing.items} currentCode={currentCode} onSelect={setSelected} /> : <ProfilesTable records={profileListing.items} />}
          <nav aria-label={t('采集记录')} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <label className="flex items-center gap-1.5">{t('每页显示')}
              <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); goToPage(1); }} className="h-8 rounded-md border border-border bg-background px-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                {[5, 10, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
              </select>{t('条')}
            </label>
            <span>{listing.start}–{listing.end} / {activeCount} {t('条')}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="xs" disabled={listing.page === 1} onClick={() => goToPage(listing.page - 1)}>{t('上一页')}</Button>
              <span className="min-w-12 text-center">{listing.page} / {listing.pages} {t('页')}</span>
              <Button variant="outline" size="xs" disabled={listing.page === listing.pages} onClick={() => goToPage(listing.page + 1)}>{t('下一页')}</Button>
            </div>
          </nav>
        </> : tab === 'profiles' ? <p className="rounded-xl bg-secondary/70 p-4 text-[12px] text-muted-foreground">{t('进入达人主页后，资料会显示在这里。')}</p> : state.kind === 'loading' ? <LoadingState /> : state.kind === 'ready' ? <p className="rounded-xl bg-secondary/70 p-4 text-[12px] text-muted-foreground">{t('当前 Reel 已读取；可在设置中控制自动采集。')}</p> : state.kind === 'profile' ? <p className="rounded-xl bg-secondary/70 p-4 text-[12px] text-muted-foreground">{t('当前列表已识别，记录保存后会显示在这里。')}</p> : <EmptyState kind={state.kind} onRefresh={refresh} />}
        {activeCount > 0 && state.kind !== 'ready' && state.kind !== 'loading' && <p className="text-[11px] text-muted-foreground">{t('可继续查看已保存记录；自动采集行为可在设置中调整。')}</p>}
        </div>
      </div>}
    </main>
    <footer className="shrink-0 border-t border-border bg-background px-5 py-3">
      <div className="flex gap-2">
        {reel && tab === 'reels' ? <Button className="flex-1" size="sm" onClick={copyJson}><Copy className="size-3.5" />{t(copyLabel === 'copied' ? '已复制 JSON' : copyLabel === 'error' ? '复制失败，请重试' : '复制 JSON 数据')}</Button> : <><Button className="flex-1" size="sm" disabled={!activeCount} onClick={() => openDialog('export')}><Download className="size-3.5" />{t('导出 Excel')}</Button><Button variant="outline" size="sm" disabled={!activeCount} onClick={() => openDialog('clear')}><Trash2 className="size-3.5" />{t('清空')}</Button></>}
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">{t('仅保存页面实际提供的数据 · — 表示未公开或未加载')}</p>
    </footer>
    <dialog ref={dialog} className="m-auto w-[min(390px,calc(100vw-32px))] rounded-xl border border-border bg-background p-5 text-foreground shadow-2xl backdrop:bg-black/35" onCancel={event => { if (busy) event.preventDefault(); }}>
      <h2 className="text-[17px] font-semibold">{t(mode === 'export' ? '导出采集记录' : mode === 'confirm-clear' ? '确认文件已保存' : '清空采集记录')}</h2>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{mode === 'export' ? settings.language === 'en' ? `Export ${activeCount} ${tab === 'reels' ? 'Reels' : 'profiles'} to Excel. Clear them afterward?` : `将 ${activeCount} 条${t(tab === 'reels' ? '视频' : '达人')}记录导出为 Excel。导出后是否清空？` : mode === 'confirm-clear' ? t('请确认 Excel 文件已经保存到电脑，再清空本地记录。') : settings.language === 'en' ? `Permanently delete ${activeCount} saved ${tab === 'reels' ? 'Reels' : 'profiles'}.` : `将永久删除本地保存的 ${activeCount} 条${t(tab === 'reels' ? '视频' : '达人')}记录。`}</p>
      {error && <p role="alert" className="mt-3 text-[12px] text-destructive">{t(error)}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => dialog.current?.close()}>{t(mode === 'confirm-clear' ? '保留记录' : '取消')}</Button>
        {mode === 'export' && <Button variant="outline" size="sm" disabled={busy} onClick={() => void finishAction(false)}>{t('仅导出')}</Button>}
        <Button size="sm" disabled={busy} onClick={() => void finishAction(mode === 'export')}>{t(mode === 'export' ? '导出后清空' : mode === 'confirm-clear' ? '已保存，清空' : '确认清空')}</Button>
      </div>
    </dialog>
  </div></LanguageContext.Provider>;
}
