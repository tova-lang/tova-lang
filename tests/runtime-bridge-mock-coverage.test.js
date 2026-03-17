import { describe, test, expect, afterEach, mock } from 'bun:test';
import fs from 'fs';
import { join } from 'path';

const MODULE_PATH = '../src/stdlib/runtime-bridge.js';
const originalExistsSync = fs.existsSync;
const originalReaddirSync = fs.readdirSync;

function loadFreshRuntimeBridge() {
  const resolved = require.resolve(MODULE_PATH);
  delete require.cache[resolved];
  return require(MODULE_PATH);
}

const originalArgv1 = process.argv[1];
const originalHome = process.env.HOME;

afterEach(() => {
  process.argv[1] = originalArgv1;
  process.env.HOME = originalHome;
  fs.existsSync = originalExistsSync;
  fs.readdirSync = originalReaddirSync;
  mock.restore();
  mock.clearAllMocks();
  delete require.cache[require.resolve(MODULE_PATH)];
});

describe('runtime bridge mocked coverage', () => {
  test('failed .node and .dylib loads fall through to unavailable runtime', async () => {
    const fakeDir = '/tmp/tova-runtime-bridge-fail';
    process.argv[1] = join(fakeDir, 'script.js');
    process.env.HOME = '/tmp/tova-runtime-bridge-home';

    fs.existsSync = (dir) => dir === fakeDir;
    fs.readdirSync = (dir) => dir === fakeDir ? ['bad.node', 'libtova_runtime_bad.dylib'] : [];

    const bridge = loadFreshRuntimeBridge();

    expect(bridge.isRuntimeAvailable()).toBe(false);
    expect(bridge.healthCheck()).toBeNull();
    expect(() => bridge.channelCreate(4)).toThrow('tova_runtime not available');
    expect(() => bridge.channelSend(1, 'x')).toThrow('tova_runtime not available');
    expect(() => bridge.channelReceive(1)).toThrow('tova_runtime not available');
    expect(() => bridge.channelClose(1)).toThrow('tova_runtime not available');
    await expect(bridge.execWasm(new Uint8Array([]), 'fn', [])).rejects.toThrow('tova_runtime not available');
    await expect(bridge.execWasmWithChannels(new Uint8Array([]), 'fn', [])).rejects.toThrow('tova_runtime not available');
    await expect(bridge.concurrentWasm([])).rejects.toThrow('tova_runtime not available');
    await expect(bridge.concurrentWasmWithChannels([])).rejects.toThrow('tova_runtime not available');
    await expect(bridge.concurrentWasmShared([])).rejects.toThrow('tova_runtime not available');
    await expect(bridge.concurrentWasmFirst([])).rejects.toThrow('tova_runtime not available');
    await expect(bridge.concurrentWasmTimeout([], 100)).rejects.toThrow('tova_runtime not available');
    await expect(bridge.concurrentWasmCancelOnError([])).rejects.toThrow('tova_runtime not available');
  });

  test('init handles unexpected loader exceptions and marks runtime unavailable', async () => {
    fs.existsSync = () => {
      throw new Error('fs exploded');
    };
    fs.readdirSync = () => [];

    const bridge = loadFreshRuntimeBridge();

    expect(bridge.isRuntimeAvailable()).toBe(false);
    expect(bridge.healthCheck()).toBeNull();
    await expect(bridge.execWasm(new Uint8Array([]), 'fn', [])).rejects.toThrow('tova_runtime not available');
  });
});
