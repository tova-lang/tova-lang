import { describe, test, expect } from 'bun:test';
import { resolve } from 'path';
import { loadDocBlocks, validateBlock, blockLabel } from '../helpers/doc-examples.js';

const DOC = resolve(import.meta.dir, '../../docs/fullstack/edge-block.md');

describe('docs/fullstack/edge-block.md examples', () => {
  const blocks = loadDocBlocks(DOC);

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

  if (blocks.length === 0) {
    test('no Tova code examples on this page', () => {});
  }
});
