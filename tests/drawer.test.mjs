import assert from 'node:assert/strict';
import { startDrawer } from '../src/content/drawer.ts';

/** 建立测试抽屉所需的最小 DOM 节点。 */
function element(tag) {
  return {
    tag, children: [], listeners: {},
    /** 保存抽屉内部节点。 */
    append(...children) { this.children.push(...children); },
    /** 隔离 Instagram 页面样式。 */
    attachShadow() { this.shadow = element('shadow'); return this.shadow; },
    /** 保存关闭按钮的点击事件。 */
    addEventListener(type, listener) { this.listeners[type] = listener; },
    /** 记录抽屉已关闭。 */
    remove() { this.removed = true; },
    /** 保存辅助功能名称。 */
    setAttribute(name, value) { this[name] = value; },
  };
}

const originalDocument = globalThis.document;
const originalBrowser = globalThis.browser;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const body = element('body');
let listener;
try {
  globalThis.document = {
    body,
    /** 由实现决定创建的节点类型。 */
    createElement: element,
  };
  globalThis.browser = { storage: {
    local: { /** 返回默认界面语言。 */ async get() { return {}; } },
    onChanged: { /** 测试中不切换语言。 */ addListener() {}, /** 清理语言监听器。 */ removeListener() {} },
  }, runtime: {
    id: 'extension-id',
    /** 返回扩展页面地址。 */
    getURL: path => `chrome-extension://extension-id${path}`,
    onMessage: {
      /** 保存插件图标通知的处理器。 */
      addListener(value) { listener = value; },
      /** 测试结束时停止监听。 */
      removeListener() {},
    },
  } };
  /** 避免完成提示计时器延长测试进程。 */
  globalThis.setTimeout = () => 1;
  globalThis.clearTimeout = () => {};
  const open = startDrawer();
  open(7);
  assert.equal(body.children.length, 1);
  const host = body.children[0];
  const [, drawer] = host.shadow.children;
  const [frame, close] = drawer.children;
  assert.equal(frame.src, 'chrome-extension://extension-id/viewer.html?tabId=7&view=drawer');
  assert.equal(frame.allow, 'clipboard-write', '跨域抽屉允许记录页写入剪贴板');
  open(7);
  assert.equal(body.children.length, 1, '重复点击时复用已打开的抽屉');
  close.listeners.click();
  assert.equal(host.removed, true);
  let response;
  listener({ type: 'OPEN_REEL_DRAWER', tabId: 7 }, { id: 'extension-id' }, value => { response = value; });
  assert.equal(response.opened, true);
  assert.equal(body.children.length, 2, '关闭后可以由插件图标重新打开');
  listener({ type: 'OPEN_REEL_DRAWER', tabId: 8 }, { id: 'other-extension' }, () => {});
  assert.equal(body.children.length, 2, '忽略其他扩展的打开请求');
  listener({ type: 'PROFILE_COLLECTION_COMPLETE', profile: 'creator' }, { id: 'other-extension' }, () => {});
  assert.equal(body.children.length, 2, '忽略其他扩展伪造的完成提示');
  listener({ type: 'PROFILE_COLLECTION_COMPLETE', profile: 'creator' }, { id: 'extension-id' }, () => {});
  assert.equal(body.children.length, 3);
  assert.equal(body.children[2].shadow.children[1].textContent, '@creator 的 Reels 列表已采集结束');
  assert.equal(body.children[2].shadow.children[1].role, 'status');
  listener({ type: 'PROFILE_COLLECTION_COMPLETE', profile: 'creator', kind: 'profile' }, { id: 'extension-id' }, () => {});
  assert.equal(body.children.at(-1).shadow.children[1].textContent, '@creator 的达人资料已采集结束');
  console.log('Persistent drawer open and close checks passed');
} finally {
  globalThis.document = originalDocument;
  globalThis.browser = originalBrowser;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}
