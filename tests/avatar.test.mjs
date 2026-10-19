import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/content/page.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
let calls = 0;
let response;
const context = {
  exports: {}, URL, AbortSignal, Blob,
  /** 模拟浏览器将受限图片转换为可跨扩展消息传递的数据。 */
  FileReader: class {
    /** 按 Blob 的真实字节生成图片数据地址。 */
    async readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
      this.onload();
    }
  },
  /** 确保头像读取不携带登录凭据、不跟随重定向且具有超时。 */
  async fetch(url, options) {
    calls++;
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    if (response instanceof Error) throw response;
    return response;
  },
  /** 本例不执行页面资料解析。 */
  require() { return {}; },
};
runInNewContext(compiled, context);
const { readAvatar } = context.exports;
const url = 'https://scontent.example.cdninstagram.com/v/avatar.jpg?signature=abc';
for (const invalid of [null, {}, 'https://example.com/avatar.jpg', 'https://cdninstagram.com.evil.test/avatar.jpg',
  'http://scontent.example.cdninstagram.com/avatar.jpg', 'https://user:pass@scontent.example.cdninstagram.com/avatar.jpg',
  'https://scontent.example.cdninstagram.com/avatar.svg']) {
  assert.equal(await readAvatar(invalid), null);
}
assert.equal(calls, 0, '无效来源不得发起请求');
response = new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } });
assert.equal(await readAvatar(url), 'data:image/jpeg;base64,AQID');
response = new Response('no image', { status: 403 });
assert.equal(await readAvatar(url), null);
response = new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } });
assert.equal(await readAvatar(url), null);
response = new Response(new Uint8Array(512 * 1024 + 1), { headers: { 'Content-Type': 'image/png' } });
assert.equal(await readAvatar(url), null, '超过大小限制的头像不得传入抽屉');
response = new Error('Network failed');
assert.equal(await readAvatar(url), null);
console.log('Avatar source, size and image relay checks passed');
