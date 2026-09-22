import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTaskBrief } from './parse-brief.js';

test('parseTaskBrief uses JSON query', () => {
  const input = parseTaskBrief('Title', '{"query":"Ada","limit":3}', 10);
  assert.equal(input.query, 'Ada');
  assert.equal(input.limit, 3);
});

test('parseTaskBrief falls back to name and description', () => {
  const input = parseTaskBrief('Cardano news', '', 10);
  assert.equal(input.query, 'Cardano news');
  assert.equal(input.limit, 10);
});

test('parseTaskBrief reads query line', () => {
  const input = parseTaskBrief(
    'Research',
    'query: Masumi network\nlimit: 2',
    10,
  );
  assert.equal(input.query, 'Masumi network');
  assert.equal(input.limit, 2);
});
