import type { ReelReply } from '../reel/types';
import { translate } from '../reel/i18n.ts';
import { defaultSettings, settingsFrom } from '../reel/settings.ts';
import { profileUsername } from '../reel/profile-url.ts';

type CaptureState = 'loading' | 'ready' | 'paused' | 'error' | 'profile';
type ButtonPosition = { left: number; top: number };

// 悬浮按钮位置保存在扩展本地存储中，刷新页面后仍能回到上次拖动的位置。
const buttonPositionKey = 'floatingButtonPosition';

const buttonStyle = `
  :host { all: initial; }
  button {
    all: unset; box-sizing: border-box; position: fixed; right: 20px; bottom: 24px;
    z-index: 2147483647; display: flex; align-items: center; gap: 9px;
    min-height: 44px; padding: 0 15px 0 11px; border: 1px solid #eadde4;
    border-radius: 999px; background: #fffafb; color: #262422;
    box-shadow: 0 8px 30px #0003, 0 2px 8px #0002;
    font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
    letter-spacing: .01em; cursor: grab; touch-action: none; user-select: none;
    transition: transform .15s ease, box-shadow .15s ease;
  }
  button:hover { transform: translateY(-2px); box-shadow: 0 12px 34px #0004, 0 3px 9px #0002; }
  button[data-dragging="true"] { cursor: grabbing; transform: none; }
  button:focus-visible { outline: 3px solid #c13584; outline-offset: 3px; }
  .icon { box-sizing: border-box; display: grid; place-items: center; width: 23px; height: 23px; border-radius: 50%; color: #fff; font: 700 15px/1 Arial, sans-serif; }
  button[data-state="loading"] .icon { border: 2px solid #eadde4; border-top-color: #c13584; animation: spin .8s linear infinite; }
  button[data-state="ready"] .icon { background: #c13584; }
  button[data-state="paused"] .icon { background: #78716c; }
  button[data-state="profile"] .icon { background: linear-gradient(135deg, #ffdc80, #f77737 24%, #e1306c 53%, #c13584 78%, #5851db); }
  button[data-state="error"] .icon { background: #b42318; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .icon, button { animation: none !important; transition: none; } }
`;

/** 将当前 Reel 的读取结果转换为悬浮按钮状态，异常才显示错误。 */
export function captureState(readReel: () => ReelReply, code: string): CaptureState {
  try {
    const reply = readReel();
    return reply.status === 'ready' && reply.reel.code === code ? reply.autoSave === false ? 'paused' : 'ready' : 'loading';
  } catch {
    return 'error';
  }
}

/** 校验存储中的悬浮按钮位置，非有限数字的坐标一律忽略。 */
export function buttonPositionFrom(value: unknown): ButtonPosition | null {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return typeof raw.left === 'number' && Number.isFinite(raw.left) && typeof raw.top === 'number' && Number.isFinite(raw.top)
    ? { left: raw.left, top: raw.top } : null;
}

/** 在 Reel 详情与达人主页显示悬浮按钮，并允许点击打开常驻抽屉。 */
export function startFloatingButton(readReel: () => ReelReply, openDrawer: (tabId: number) => void, signal?: AbortSignal): void {
  let host: HTMLDivElement | null = null;
  let button: HTMLButtonElement | null = null;
  let icon: HTMLSpanElement | null = null;
  let label: HTMLSpanElement | null = null;
  let activeCode: string | null = null;
  let position: { left: number; top: number } | null = null;
  let drag: { pointerId: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  let suppressClick = false;
  let errorSince: number | null = null;
  let language = defaultSettings.language;

  /** 抽屉切换语言后同步更新悬浮按钮。 */
  function onSettingsChanged(changes: Record<string, { newValue?: unknown }>, area: string): void {
    if (area === 'local' && 'settings' in changes) {
      language = settingsFrom(changes.settings?.newValue).language;
      update();
    }
  }
  browser.storage.onChanged.addListener(onSettingsChanged);
  void browser.storage.local.get('settings').then(stored => {
    language = settingsFrom(stored.settings).language;
    update();
  }).catch(() => {});
  // 读取上次拖动后保存的位置，按钮未挂载时先记下，挂载时再应用。
  void browser.storage.local.get(buttonPositionKey).then(stored => {
    const saved = buttonPositionFrom(stored[buttonPositionKey]);
    if (!saved) return;
    position = saved;
    if (button) place(saved.left, saved.top);
  }).catch(() => {});

  /** 只在 Reel 详情地址上读取 shortcode。 */
  function currentCode(): string | null {
    return location.pathname.match(/^\/(?:[A-Za-z0-9._]+\/)?reels?\/([A-Za-z0-9_-]+)\/?$/)?.[1] ?? null;
  }

  /** 将拖动位置限制在视口内，并保留页面内切换时的位置。 */
  function place(left: number, top: number): void {
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const nextLeft = Math.max(0, Math.min(left, innerWidth - rect.width));
    const nextTop = Math.max(0, Math.min(top, innerHeight - rect.height));
    position = { left: nextLeft, top: nextTop };
    button.style.left = `${nextLeft}px`;
    button.style.top = `${nextTop}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
  }

  /** 记录按下时的指针与按钮位置，供后续计算拖动距离。 */
  function onPointerDown(event: PointerEvent): void {
    if (!button || event.button !== 0) return;
    const rect = button.getBoundingClientRect();
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      left: rect.left, top: rect.top, moved: false };
    button.setPointerCapture(event.pointerId);
  }

  /** 超过小幅移动阈值后才拖动，保留普通点击行为。 */
  function onPointerMove(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    if (button) button.dataset.dragging = 'true';
    place(drag.left + dx, drag.top + dy);
  }

  /** 拖动结束后屏蔽这一次由指针释放产生的点击。 */
  function onPointerEnd(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const moved = drag.moved;
    if (moved && event.type === 'pointerup') {
      suppressClick = true;
      /** 没有生成 click 时也要恢复下次正常点击。 */
      function resetClick(): void { suppressClick = false; }
      setTimeout(resetClick, 0);
    }
    drag = null;
    if (button) delete button.dataset.dragging;
    // 只在真正拖动后写入，避免点击时反复覆盖正确位置。
    if (moved && position) void browser.storage.local.set({ [buttonPositionKey]: position }).catch(() => {});
  }

  /** 拖动后的合成点击只负责结束拖动，其余点击打开抽屉。 */
  function onClick(event: MouseEvent): void {
    event.stopPropagation();
    if (suppressClick) {
      event.preventDefault();
      suppressClick = false;
      return;
    }
    openDetails();
  }

  /** 视口大小变化后避免按钮停留在屏幕外。 */
  function onResize(): void {
    if (position) place(position.left, position.top);
  }

  /** 用 Shadow DOM 隔离 Instagram 样式，并建立可点击的状态按钮。 */
  function mount(): void {
    if (host || !document.body) return;
    host = document.createElement('div');
    host.id = 'instagram-plugin-floating-button';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = buttonStyle;
    button = document.createElement('button');
    button.type = 'button';
    icon = document.createElement('span');
    icon.className = 'icon';
    icon.setAttribute('aria-hidden', 'true');
    label = document.createElement('span');
    button.append(icon, label);
    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('pointermove', onPointerMove);
    button.addEventListener('pointerup', onPointerEnd);
    button.addEventListener('pointercancel', onPointerEnd);
    button.addEventListener('click', onClick);
    shadow.append(style, button);
    document.body.append(host);
    if (position) place(position.left, position.top);
  }

  /** 更新图标、文案和辅助功能提示。 */
  function show(state: CaptureState, errorText = '采集错误 · 查看详情'): void {
    if (!button || !icon || !label) return;
    const text = translate(language, state === 'ready' ? '已采集 · 查看数据' : state === 'paused' ?
      '自动采集已关闭 · 查看数据' : state === 'profile' ? '查看采集记录' : state === 'error' ? errorText : '采集中 · 查看详情');
    button.dataset.state = state;
    icon.textContent = state === 'ready' ? '✓' : state === 'paused' ? '–' : state === 'profile' ? '↗' : state === 'error' ? '!' : '';
    label.textContent = text;
    button.title = text;
    button.setAttribute('aria-label', text);
    if (position) place(position.left, position.top);
  }

  /** 根据当前 URL 切换视频状态或达人页入口，页面内导航时不沿用旧视频。 */
  function update(): void {
    const code = currentCode();
    const profile = profileUsername(location.href);
    if (!code && !profile) {
      host?.remove();
      host = button = icon = label = null;
      activeCode = null;
      drag = null;
      errorSince = null;
      return;
    }
    if (!code && profile) {
      activeCode = null;
      errorSince = null;
      mount();
      show('profile');
      return;
    }
    if (code !== activeCode) {
      activeCode = code;
      errorSince = null;
    }
    mount();
    if (!host) return;
    const state = captureState(readReel, code!);
    if (state === 'error') errorSince ??= Date.now();
    else errorSince = null;
    // 页面内切换时 DOM 会短暂不完整，持续失败后才报告采集错误。
    show(state === 'error' && Date.now() - errorSince! < 3000 ? 'loading' : state);
  }

  /** 校验当前视频或达人页后取得来源标签页，并打开页面内的采集抽屉。 */
  function openDetails(): void {
    const code = currentCode();
    const profile = profileUsername(location.href);
    if (!code && !profile) return;
    // 用户可在轮询刷新前点击，必须使用当前地址而不是上一条视频的 activeCode。
    if (code !== activeCode) update();
    void browser.runtime.sendMessage({ type: 'OPEN_REEL_DRAWER', ...(code ? { code } : { profile }), url: location.href }).then(
      (reply: { tabId?: number } | undefined) => { if (typeof reply?.tabId === 'number') openDrawer(reply.tabId); else show('error', '打开失败 · 点击重试'); },
      () => show('error', '打开失败 · 点击重试'),
    );
  }

  /** 扩展热更新时移除旧按钮和定时器。 */
  function stop(): void {
    document.removeEventListener('DOMContentLoaded', update);
    document.removeEventListener('instagram-plugin:reel', update);
    browser.storage.onChanged.removeListener(onSettingsChanged);
    window.removeEventListener('resize', onResize);
    clearInterval(timer);
    host?.remove();
  }

  document.addEventListener('DOMContentLoaded', update, { once: true });
  document.addEventListener('instagram-plugin:reel', update);
  window.addEventListener('resize', onResize);
  const timer = setInterval(update, 1200);
  signal?.addEventListener('abort', stop, { once: true });
  update();
}
