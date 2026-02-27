// tests/tova-modules.test.js
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { isTovModule } from '../src/config/module-path.js';
import { findEntryPoint } from '../src/config/module-entry.js';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';

const TMP = join(import.meta.dir, '.tmp-modules-test');

describe('findEntryPoint', () => {
  beforeEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });
  afterEach(() => {
    if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  });

  test('finds src/lib.tova', () => {
    mkdirSync(join(TMP, 'src'), { recursive: true });
    writeFileSync(join(TMP, 'src', 'lib.tova'), 'pub fn serve() { }');
    expect(findEntryPoint(TMP)).toBe(join(TMP, 'src', 'lib.tova'));
  });
  test('finds lib.tova at root', () => {
    writeFileSync(join(TMP, 'lib.tova'), 'pub fn serve() { }');
    expect(findEntryPoint(TMP)).toBe(join(TMP, 'lib.tova'));
  });
  test('finds index.tova at root', () => {
    writeFileSync(join(TMP, 'index.tova'), 'pub fn serve() { }');
    expect(findEntryPoint(TMP)).toBe(join(TMP, 'index.tova'));
  });
  test('prefers explicit entry from config', () => {
    writeFileSync(join(TMP, 'main.tova'), 'pub fn serve() { }');
    expect(findEntryPoint(TMP, 'main.tova')).toBe(join(TMP, 'main.tova'));
  });
  test('throws when no entry found', () => {
    expect(() => findEntryPoint(TMP)).toThrow(/no entry point/i);
  });
  test('finds sub-package entry', () => {
    mkdirSync(join(TMP, 'postgres'), { recursive: true });
    writeFileSync(join(TMP, 'postgres', 'lib.tova'), 'pub fn connect() { }');
    expect(findEntryPoint(TMP, null, 'postgres')).toBe(join(TMP, 'postgres', 'lib.tova'));
  });
});

describe('import detection in compiler', () => {
  test('github.com path detected as Tova module', () => {
    expect(isTovModule('github.com/alice/tova-http')).toBe(true);
  });
  test('zod NOT detected as Tova module', () => {
    expect(isTovModule('zod')).toBe(false);
  });
  test('./local NOT detected as Tova module', () => {
    expect(isTovModule('./local')).toBe(false);
  });
});
