import assert from 'node:assert/strict';
import { paginate } from '../src/popup/pagination.ts';

const rows = Array.from({ length: 11 }, (_, index) => index + 1);
assert.deepEqual(paginate(rows, 1, 10).items, rows.slice(0, 10));
assert.deepEqual(paginate(rows, 2, 10), { items: [11], page: 2, pages: 2, start: 11, end: 11 });
assert.deepEqual(paginate(rows, 9, 5), { items: [11], page: 3, pages: 3, start: 11, end: 11 });
assert.deepEqual(paginate(rows, 1, 50).items, rows);
assert.deepEqual(paginate([], 4, 10), { items: [], page: 1, pages: 1, start: 0, end: 0 });
console.log('Saved Reel pagination checks passed');
