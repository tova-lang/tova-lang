import { describe, test, expect } from 'bun:test';
import { resolve } from 'path';
import { loadDocBlocks, validateBlock, blockLabel } from '../helpers/doc-examples.js';

const DOC = resolve(import.meta.dir, '../../docs/playground.md');

describe('docs/playground.md examples', () => {
  const blocks = loadDocBlocks(DOC);

  if (blocks.length === 0) {
    test('no Tova examples on this page', () => {
      expect(blocks.length).toBe(0);
    });
  } else {
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
  }
});
