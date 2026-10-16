import assert from 'node:assert/strict';
import { startFloatingButton } from '../src/content/floating-button.ts';

class Element {
  /** 保存测试所需的按钮属性和事件监听器。 */
  constructor(tag) {
    this.tag = tag;
    this.style = {};
    this.dataset = {};
    this.listeners = new Map();
  }

  /** 保存子节点以模拟 Shadow DOM 挂载。 */
  append(...children) { this.children = children; }
  /** 保存 Shadow DOM，供测试读取按钮状态。 */
  attachShadow() { return new Element('shadow'); }
  /** 记录事件处理器。 */
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  /** 模拟当前按钮在视口中的位置。 */
  getBoundingClientRect() {
    return { left: Number.parseFloat(this.style.left) || 620,
      top: Number.parseFloat(this.style.top) || 532, width: 160, height: 44 };
  }
  /** 模拟指针捕获。 */
  setPointerCapture() {}
  /** 模拟 HTML 属性写入。 */
  setAttribute(name, value) { this[name] = value; }
  /** 模拟卸载页面按钮。 */
  remove() { this.removed = true; }
  /** 触发指定的按钮事件。 */
  fire(name, event = {}) { this.listeners.get(name)?.(event); }
}

const previous = {
  document: globalThis.document, window: globalThis.window, location: globalThis.location,
  browser: globalThis.browser, innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight,
  setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
  setTimeout: globalThis.setTimeout, now: Date.now,
};
let button;
let update;
let now = 0;
let readerState = 'ready';
let code = 'ABC123';
const messages = [];
const opened = [];
const saved = [];
const body = new Element('body');
const clickEvent = {
  /** 模拟取消拖动后的合成点击。 */
  preventDefault() {},
  /** 模拟阻止页面收到扩展按钮点击。 */
  stopPropagation() {},
};

try {
  globalThis.document = {
    body,
    /** 创建悬浮按钮所需的简化元素。 */
    createElement(tag) { const element = new Element(tag); if (tag === 'button') button = element; return element; },
    /** 模拟文档监听器注册。 */
    addEventListener() {},
    /** 模拟文档监听器清理。 */
    removeEventListener() {},
  };
  globalThis.window = {
    /** 模拟窗口监听器注册。 */
    addEventListener() {},
    /** 模拟窗口监听器清理。 */
    removeEventListener() {},
  };
  globalThis.location = {
    pathname: '/reels/ABC123/',
    /** 根据当前页面路径返回完整地址。 */
    get href() { return `https://www.instagram.com${this.pathname}`; },
  };
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;
  globalThis.browser = { storage: {
    local: {
      /** 返回上次保存的悬浮按钮位置。 */
      async get() { return { floatingButtonPosition: { left: 620, top: 532 } }; },
      /** 记录拖动后写入的位置。 */
      async set(value) { saved.push(value); },
    },
    onChanged: { /** 测试中不切换语言。 */ addListener() {}, /** 清理语言监听器。 */ removeListener() {} },
  }, runtime: {
    /** 记录打开详情的请求。 */
    sendMessage(message) { messages.push(message); return Promise.resolve({ tabId: 7 }); },
  } };
  /** 保存轮询回调以模拟视频切换。 */
  globalThis.setInterval = callback => { update = callback; return 1; };
  /** 模拟清除轮询。 */
  globalThis.clearInterval = () => {};
  /** 保留拖动后合成点击的屏蔽状态，直到测试触发 click。 */
  globalThis.setTimeout = () => 1;
  /** 控制持续异常的模拟时间。 */
  Date.now = () => now;

  /** 按当前测试状态返回采集结果。 */
  function readReel() {
    if (readerState === 'error') throw new Error('temporary failure');
    return { status: 'ready', reel: { code } };
  }
  startFloatingButton(readReel, tabId => opened.push(tabId));
  assert.equal(button.dataset.state, 'ready');
  await new Promise(setImmediate);
  assert.equal(button.style.left, '620px', '启动后应用上次保存的位置');
  assert.equal(button.style.top, '532px', '启动后应用上次保存的位置');

  button.fire('pointerdown', { button: 0, pointerId: 1, clientX: 700, clientY: 550 });
  button.fire('pointermove', { pointerId: 1, clientX: 500, clientY: 300 });
  button.fire('pointerup', { pointerId: 1, type: 'pointerup' });
  button.fire('click', clickEvent);
  assert.equal(button.style.left, '420px');
  assert.equal(button.style.top, '282px');
  assert.deepEqual(saved.at(-1), { floatingButtonPosition: { left: 420, top: 282 } }, '拖动结束后保存位置');
  assert.equal(messages.length, 0, '拖动结束不能误打开详情');

  button.fire('click', clickEvent);
  assert.deepEqual(messages, [{ type: 'OPEN_REEL_DRAWER', code: 'ABC123', url: 'https://www.instagram.com/reels/ABC123/' }]);

  globalThis.location.pathname = '/reels/NEXT456/';
  readerState = 'error';
  button.fire('click', clickEvent);
  assert.deepEqual(messages.at(-1), { type: 'OPEN_REEL_DRAWER', code: 'NEXT456', url: 'https://www.instagram.com/reels/NEXT456/' },
    '轮询刷新前点击也必须打开当前视频');
  assert.equal(button.dataset.state, 'loading', '切换时短暂读取异常应保持加载');
  assert.equal(button.style.left, '420px', '切换视频后保留拖动位置');
  now = 3001;
  update();
  assert.equal(button.dataset.state, 'error', '持续异常才显示错误');
  readerState = 'ready';
  code = 'NEXT456';
  update();
  assert.equal(button.dataset.state, 'ready');
  button.fire('click', clickEvent);
  assert.deepEqual(messages.at(-1), { type: 'OPEN_REEL_DRAWER', code: 'NEXT456', url: 'https://www.instagram.com/reels/NEXT456/' });
  globalThis.location.pathname = '/creator/';
  readerState = 'error';
  update();
  assert.equal(button.dataset.state, 'profile', '达人主页应显示查看记录入口');
  button.fire('click', clickEvent);
  assert.deepEqual(messages.at(-1), { type: 'OPEN_REEL_DRAWER', profile: 'creator', url: 'https://www.instagram.com/creator/' });
  globalThis.location.pathname = '/creator/reels/';
  update();
  assert.equal(button.dataset.state, 'profile', '达人 Reels 标签页应保留悬浮按钮');
  button.fire('click', clickEvent);
  assert.deepEqual(messages.at(-1), { type: 'OPEN_REEL_DRAWER', profile: 'creator', url: 'https://www.instagram.com/creator/reels/' });
  globalThis.location.pathname = '/explore/';
  update();
  assert.equal(body.children.at(-1).removed, true, '其他 Instagram 页面不显示悬浮按钮');
  await new Promise(setImmediate);
  assert.deepEqual(opened, [7, 7, 7, 7, 7]);
  console.log('Floating button drag, switch and profile checks passed');
} finally {
  Object.assign(globalThis, previous);
  Date.now = previous.now;
}
