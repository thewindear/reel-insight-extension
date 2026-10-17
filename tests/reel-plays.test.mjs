import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { defaultSettings, settingsFrom } from '../src/reel/settings.ts';
import { mergeReels } from '../src/reel/extract.ts';
import { profileUsername } from '../src/reel/profile-url.ts';

const source = readFileSync(new URL('../src/content/reel-reader.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
/** 模拟专用补播放数窗口，真实执行列表匹配、等待和完成消息。 */
async function collect(pages, settings = {}, fail = false) {
  let poll;
  let page = 0;
  let waited = 0;
  let scrolls = 0;
  const messages = [];
  const location = { pathname: '/creator/reels/', search: '?ig_plugin_worker=1&ig_plugin_plays=TARGET', href: 'https://www.instagram.com/creator/reels/?ig_plugin_worker=1&ig_plugin_plays=TARGET' };
  const context = {
    exports: {}, location, URLSearchParams, Event, AbortController, Date,
    document: { readyState: 'complete', documentElement: { scrollHeight: 4000 },
      /** 本例不含内嵌响应。 */ querySelectorAll() { return []; },
      /** 接受页面事件注册。 */ addEventListener() {},
      /** 接受缓存请求。 */ dispatchEvent() {} },
    window: { /** 滚动后模拟加载下一页。 */ scrollTo() { page++; scrolls++; } },
    /** 记录间隔，但不使用真实等待。 */ setTimeout(callback, delay) { waited += delay; callback(); },
    /** 保留读取回调供主动触发。 */ setInterval(callback) { poll = callback; return 1; },
    browser: {
      storage: { local: { /** 即使关闭达人任务，推荐页补播放数仍可以工作。 */ async get() { return { settings: { autoFeed: true, autoProfile: false, autoProfileData: false, profilePages: 2, profileDelay: 2, profileDelayUnit: 's', ...settings } }; } }, onChanged: { /** 本例不改变配置。 */ addListener() {} } },
      runtime: { onMessage: { /** 接受消息监听。 */ addListener() {} },
        /** 只允许报告补全状态，禁止批量保存列表和读取账户简介。 */ async sendMessage(message) {
          assert.ok(['PROFILE_WORKER_STARTED', 'PROFILE_WORKER_DONE'].includes(message.type));
          messages.push(message); return { accepted: true };
        } },
    },
    /** 复用真实配置校验和合并，模拟每页网格内容。 */ require(name) {
      if (name === '../reel/settings') return { defaultSettings, settingsFrom };
      if (name === '../reel/profile-url') return { profileUsername };
      if (name === '../reel/extract') return { mergeReels, findReels: () => [] };
      if (name === './page') return { readProfileReels: () => { if (fail) throw new Error('Grid changed'); return pages[page] ?? []; } };
      throw new Error(name);
    },
  };
  runInNewContext(compiled, context);
  context.exports.startReelReader();
  await new Promise(setImmediate);
  poll();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  return { done: messages.find(message => message.type === 'PROFILE_WORKER_DONE'), scrolls, waited };
}
const first = { code: 'OTHER', plays: 999, authors: [{ username: 'creator' }] };
const target = { code: 'TARGET', plays: 12345, authors: [{ username: 'creator' }] };
const found = await collect([[first], [target]]);
assert.equal(found.done.plays, 12345, '第二页按 shortcode 匹配，不能拿第一条视频的播放数');
assert.equal(found.scrolls, 1);
assert.ok(found.waited >= 12000, '翻页前应使用配置的秒级间隔');
assert.equal(found.done.kind, 'plays');
const zero = await collect([[{ ...target, plays: 0 }]]);
assert.equal(zero.done.plays, 0, '零播放不能当作缺失');
assert.equal(zero.scrolls, 0);
const absent = await collect([[first], [target]], { profilePages: 1 });
assert.equal(absent.done.plays, null);
assert.equal(absent.scrolls, 0, '不能超出配置的查找页数');
const abbreviated = await collect([[{ ...target, plays: null }]], { profilePages: 1 });
assert.equal(abbreviated.done.plays, null, '没有明确计数时不得估算');
const failed = await collect([], {}, true);
assert.equal(failed.done.plays, null, '页面解析异常也应通知完成并清理窗口');
console.log('Targeted Reel plays collection checks passed');
