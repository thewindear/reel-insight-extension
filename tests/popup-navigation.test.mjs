import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/popup/use-reel.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const location = { href: 'chrome-extension://extension-id/viewer.html?tabId=7&view=drawer', search: '?tabId=7&view=drawer' };
let currentCode = 'SECOND';
let profile = false;
let startedEnrichment = false;
let state;
let effect;
let poll;
const react = {
  /** 保存界面状态，便于验证当前视频是否展示。 */
  useState(initial) {
    /** 模拟 React 状态更新。 */
    function setState(next) { state = next; }
    return [initial, setState];
  },
  /** 保留 hook 在轮询间共用的引用。 */
  useRef(initial) { return { current: initial }; },
  /** 在测试中直接返回回调。 */
  useCallback(callback) { return callback; },
  /** 保存初始化副作用，由测试主动启动。 */
  useEffect(callback) { effect = callback; },
};
const browser = { tabs: {
  /** 详情页应始终向原 Instagram 标签页请求当前视频。 */
  async sendMessage(tabId, message) {
    if (message.type === 'START_PROFILE_ENRICHMENT') { assert.equal(tabId, 10); startedEnrichment = true; return { accepted: true }; }
    assert.equal(message.type, 'GET_REEL');
    if (tabId === 10) return { status: 'profile', progress: { state: 'running', completed: 1, total: 3, failed: 0 } };
    assert.equal(tabId, 7);
    if (profile) return { status: 'profile', progress: { state: 'idle', completed: 0, total: 0, failed: 0 }, workerTabId: 10 };
    return { status: 'ready', reel: { code: currentCode } };
  },
  /** 来源标签页已确定时不应查询当前活动标签页。 */
  async query() { throw new Error('不应查询活动标签页'); },
} };
const history = {
  /** 模拟详情页地址随着当前视频更新。 */
  replaceState(_state, _title, next) {
    location.href = String(next);
    location.search = new URL(location.href).search;
  },
};
const context = {
  exports: {}, browser, history, location, URL, URLSearchParams, Date,
  /** 保存轮询回调，便于模拟再次切换视频。 */
  setInterval(callback) { poll = callback; return 1; },
  /** 测试无需运行定时器清理。 */
  clearInterval() {},
  /** 为 hook 提供最小 React 测试替身。 */
  require(name) {
    if (name === 'react') return react;
    throw new Error(`Unexpected import: ${name}`);
  },
};
runInNewContext(compiled, context);
const hook = context.exports.useReel();
effect();
await new Promise(setImmediate);
assert.equal(state.reel.code, 'SECOND');
assert.equal(location.search, '?tabId=7&view=drawer&code=SECOND');
currentCode = 'THIRD';
poll();
await new Promise(setImmediate);
assert.equal(state.reel.code, 'THIRD');
assert.equal(location.search, '?tabId=7&view=drawer&code=THIRD');
profile = true;
poll();
await new Promise(setImmediate);
await hook.controlEnrichment('START_PROFILE_ENRICHMENT');
assert.equal(startedEnrichment, true);
assert.equal(state.kind, 'profile');
assert.equal(state.progress.completed, 1);
console.log('Drawer Reel navigation checks passed');
