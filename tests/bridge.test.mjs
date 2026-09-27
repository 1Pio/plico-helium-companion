import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommit, destination } from '../extension/model.mjs';
const tabs = [{ id: 1 }, { id: 2 }];
const m = { loose: [1], stacks: [[2], ...Array.from({ length: 9 }, () => [])], activate: 2 };
test('commit accepts exact tab permutation including singleton stack', () =>
  assert.deepEqual(validateCommit(m, tabs), [1, 2]));
test('commit rejects duplicate, missing, stale and unknown tabs', () => {
  for (const loose of [[1, 1], [1, 3], [], [1, 2]])
    assert.throws(() => validateCommit({ ...m, loose }, tabs));
  assert.throws(() => validateCommit({ ...m, activate: 8 }, tabs));
});
test('destinations preserve default search and reject empty input', () => {
  assert.deepEqual(destination('words to find'), { query: 'words to find' });
  assert.deepEqual(destination('localhost:4300'), { url: 'http://localhost:4300' });
  assert.deepEqual(destination('example.org/path'), { url: 'https://example.org/path' });
  assert.deepEqual(destination('javascript:alert(1)'), { query: 'javascript:alert(1)' });
  assert.throws(() => destination(' '));
});
