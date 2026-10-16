import assert from 'node:assert/strict';
import { captureState } from '../src/content/floating-button.ts';

/** 模拟当前 Reel 已取得数据。 */
function readyReader() { return { status: 'ready', reel: { code: 'ABC123' } }; }
/** 模拟当前 Reel 仍在加载。 */
function loadingReader() { return { status: 'loading' }; }
/** 模拟采集过程发生异常。 */
function failingReader() { throw new Error('capture failed'); }

assert.equal(captureState(readyReader, 'ABC123'), 'ready');
assert.equal(captureState(() => ({ status: 'ready', reel: { code: 'ABC123' }, autoSave: false }), 'ABC123'), 'paused');
assert.equal(captureState(readyReader, 'NEXT456'), 'loading');
assert.equal(captureState(loadingReader, 'ABC123'), 'loading');
assert.equal(captureState(failingReader, 'ABC123'), 'error');
console.log('Floating button status checks passed');
