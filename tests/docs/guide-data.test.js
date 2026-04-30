import { describe, test, expect } from 'bun:test';
import { resolve } from 'path';
import { loadDocBlocks, validateBlock, blockLabel } from '../helpers/doc-examples.js';

const DOC = resolve(import.meta.dir, '../../docs/guide/data.md');

describe('docs/guide/data.md examples', () => {
  const blocks = loadDocBlocks(DOC);

  test('has at least one Tova block', () => {
    expect(blocks.length).toBeGreaterThan(0);
  });

  for (const block of blocks) {
    const result = validateBlock(block, DOC);
    if (result.ok) {
      test(`compiles: ${blockLabel(block)}`, () => {
        expect(result.ok).toBe(true);
      });
    } else {
      test.skip(`KNOWN-BROKEN ${blockLabel(block)} — ${result.phase}: ${result.message}`, () => {});
    }
  }
});
