import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, test, expect } from 'bun:test';

// Build outputs to .tova-out/src/src.js when building from src/ directory
const COMPILED_PATH = join(import.meta.dir, '../../tova-packages/ui/.tova-out/src/src.js');
const COMPILED = readFileSync(COMPILED_PATH, 'utf-8');

describe('tova/ui compiled output', () => {

  // Verify all 25 base components are exported
  test('exports all base components', () => {
    const expectedExports = [
      'Button', 'Input', 'Textarea', 'Label',
      'Checkbox', 'Radio', 'Switch', 'Select',
      'Badge', 'Avatar', 'Card', 'Separator',
      'Alert', 'Dialog', 'Dropdown', 'Tooltip', 'Toast',
      'Tabs', 'Accordion', 'Table', 'Pagination', 'Breadcrumb',
      'Progress', 'Spinner', 'Skeleton',
    ];
    for (const name of expectedExports) {
      expect(COMPILED).toContain(`export function ${name}(`);
    }
  });

  // Verify compound components are property assignments
  test('compound components are property assignments', () => {
    const compounds = [
      'Card.Header', 'Card.Title', 'Card.Description', 'Card.Body', 'Card.Footer',
      'Dialog.Title', 'Dialog.Description', 'Dialog.Footer',
      'Alert.Title', 'Alert.Description',
      'Tabs.List', 'Tabs.Trigger', 'Tabs.Panel',
      'Accordion.Item', 'Accordion.Trigger', 'Accordion.Content',
      'Table.Header', 'Table.Body', 'Table.Row', 'Table.Head', 'Table.Cell',
      'Dropdown.Trigger', 'Dropdown.Menu', 'Dropdown.Item', 'Dropdown.Separator',
      'Select.Option', 'Select.Group',
      'Radio.Group',
      'Toast.Provider', 'Toast.Item',
      'Pagination.Prev', 'Pagination.Next', 'Pagination.Info',
      'Breadcrumb.Item',
    ];
    for (const compound of compounds) {
      expect(COMPILED).toContain(`${compound} = function`);
    }
  });

  // Verify ARIA attributes
  test('contains ARIA attributes for accessibility', () => {
    expect(COMPILED).toContain('role:');
    expect(COMPILED).toContain('aria-');
    // Specific role checks
    expect(COMPILED).toContain('"dialog"');       // Dialog role
    expect(COMPILED).toContain('"tablist"');       // Tabs role
    expect(COMPILED).toContain('"progressbar"');   // Progress role
    expect(COMPILED).toContain('"status"');        // Toast/Spinner role
    expect(COMPILED).toContain('"separator"');     // Separator role
    expect(COMPILED).toContain('"menu"');          // Dropdown role
  });

  // Verify CSS scoping
  test('contains scoped CSS via tova_inject_css', () => {
    expect(COMPILED).toContain('tova_inject_css');
    expect(COMPILED).toContain('data-tova-');
  });

  // Verify theme token references (var(--tova-*))
  test('uses CSS custom properties for theming', () => {
    expect(COMPILED).toContain('--tova-color-primary');
    expect(COMPILED).toContain('--tova-color-border');
    expect(COMPILED).toContain('--tova-color-foreground');
    expect(COMPILED).toContain('--tova-radius-');
  });

  // Verify CSS variant classes
  test('generates CSS variant classes', () => {
    expect(COMPILED).toContain('btn--variant-primary');
    expect(COMPILED).toContain('btn--size-md');
    expect(COMPILED).toContain('badge--variant-');
    expect(COMPILED).toContain('input--variant-');
  });

  // Verify version function
  test('exports version function', () => {
    expect(COMPILED).toContain('export function version');
    expect(COMPILED).toContain('"0.1.0"');
  });

  // Verify runtime imports
  test('imports reactivity runtime', () => {
    expect(COMPILED).toContain('createSignal');
    expect(COMPILED).toContain('tova_el');
    expect(COMPILED).toContain('tova_inject_css');
  });

  // Verify responsive CSS (media queries)
  test('includes responsive breakpoints', () => {
    expect(COMPILED).toContain('@media');
  });

  // Verify animations
  test('includes CSS animations', () => {
    expect(COMPILED).toContain('@keyframes');
    expect(COMPILED).toContain('spinner-rotate');
    expect(COMPILED).toContain('skeleton-pulse');
  });

  // Verify shared behavioral primitives
  test('includes shared behavioral primitives', () => {
    expect(COMPILED).toContain('_focusTrap');
    expect(COMPILED).toContain('_dismissOnEscape');
    expect(COMPILED).toContain('_dismissOnClickOutside');
    expect(COMPILED).toContain('_arrowNavigation');
    expect(COMPILED).toContain('_typeAhead');
    expect(COMPILED).toContain('_autoId');
  });

  // Verify prefers-reduced-motion support
  test('respects prefers-reduced-motion', () => {
    expect(COMPILED).toContain('prefers-reduced-motion');
  });

  // Verify output size is reasonable (between 50KB and 200KB)
  test('compiled output size is reasonable', () => {
    const sizeKB = COMPILED.length / 1024;
    expect(sizeKB).toBeGreaterThan(50);
    expect(sizeKB).toBeLessThan(200);
  });

  // Verify focus-visible styles for keyboard accessibility
  test('includes focus-visible styles', () => {
    expect(COMPILED).toContain('focus-visible');
  });

  // Verify no duplicate exports
  test('no duplicate component exports', () => {
    const exports = [...COMPILED.matchAll(/export function (\w+)\(/g)].map(m => m[1]);
    const unique = new Set(exports);
    expect(exports.length).toBe(unique.size);
  });

  // Verify component count
  test('exports exactly 26 functions (25 components + version)', () => {
    const exports = [...COMPILED.matchAll(/export function (\w+)\(/g)].map(m => m[1]);
    expect(exports.length).toBe(26);
  });

  // Verify compound component count
  test('has all 34 compound sub-components', () => {
    const compounds = [...COMPILED.matchAll(/(\w+\.\w+) = function/g)].map(m => m[1]);
    expect(compounds.length).toBe(34);
  });

  // Verify compiled output is valid JavaScript (no reserved word bugs)
  test('compiled output is valid JavaScript', () => {
    // Must not contain `const class =` or similar reserved word declarations
    expect(COMPILED).not.toMatch(/const\s+(class|for|return|if|else|switch|default|delete|new|void|typeof)\s*=/);
    // Should contain the safe renamed versions
    expect(COMPILED).toContain('const _class = () => __props["class"]');
  });
});
