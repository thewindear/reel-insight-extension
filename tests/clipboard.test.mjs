import assert from 'node:assert/strict';
import { copyText } from '../src/popup/clipboard.ts';

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalDocument = globalThis.document;
const originalHTMLElement = globalThis.HTMLElement;
let copied = '';
let selected = false;
let removed = false;
let restored = false;
let commandResult = true;
let field;

/** 模拟复制完成后恢复焦点的页面元素。 */
class MockHTMLElement {
  /** 记录焦点已还给原来的控件。 */
  focus() { restored = true; }
}

try {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    clipboard: { /** 正常路径保存写入内容。 */ async writeText(value) { copied = value; } },
  } });
  globalThis.HTMLElement = MockHTMLElement;
  globalThis.document = {
    activeElement: new MockHTMLElement(),
    body: { /** 允许复制时插入临时文本框。 */ append() {} },
    /** 提供回退复制使用的临时文本框。 */
    createElement() { field = { value: '', readOnly: false, style: {},
      /** 标记文本已经选中。 */ select() { selected = true; },
      /** 标记文本框已经移除。 */ remove() { removed = true; },
    }; return field; },
    /** 模拟浏览器的选区复制命令。 */
    execCommand(command) { assert.equal(command, 'copy'); return commandResult; },
  };

  await copyText('https://example.com/one');
  assert.equal(copied, 'https://example.com/one');
  assert.equal(selected, false, '正常写入时不创建选区');

  /** 模拟嵌入抽屉的异步剪贴板请求被浏览器拒绝。 */
  navigator.clipboard.writeText = async () => { throw new Error('iframe denied'); };
  await copyText('https://example.com/two');
  assert.equal(field.value, 'https://example.com/two');
  assert.equal(selected, true, '异步剪贴板被拒绝时使用选区复制');
  assert.equal(removed, true, '复制后移除临时文本框');
  assert.equal(restored, true, '复制后恢复焦点');

  commandResult = false;
  await assert.rejects(copyText('https://example.com/three'), /Clipboard write failed/);
  console.log('Clipboard write and fallback checks passed');
} finally {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else Reflect.deleteProperty(globalThis, 'navigator');
  globalThis.document = originalDocument;
  globalThis.HTMLElement = originalHTMLElement;
}
