// Tova Runtime Bridge
// Auto-discovers the native tova_runtime addon (napi-rs) and exposes a clean API.
// Falls back gracefully when the addon is not available.

'use strict';

let _runtime = null;   // null = not yet attempted, false = failed, object = loaded
let _available = false;

function _findAndLoad() {
    const { existsSync, readdirSync } = require('fs');
    const { join, dirname } = require('path');

    const searchDirs = [
        // Relative to this file (src/stdlib/) -> project root tova_runtime/
        join(dirname(__filename), '..', '..', 'tova_runtime'),
        join(dirname(__filename), '..', '..', 'tova_runtime', 'target', 'release'),
        // System-wide install
        join(process.env.HOME || '', '.tova', 'lib'),
        // Next to the running script
        dirname(process.argv[1] || ''),
    ];

    for (const dir of searchDirs) {
        if (!existsSync(dir)) continue;

        let entries;
        try { entries = readdirSync(dir); } catch (_) { continue; }

        // Search .node files first (napi-rs convention)
        const nodeFiles = entries.filter(f => f.endsWith('.node'));
        for (const f of nodeFiles) {
            try { return require(join(dir, f)); } catch (_) { continue; }
        }

        // Fall back to .dylib files (macOS raw cargo output)
        const dylibFiles = entries.filter(f => f.endsWith('.dylib') && f.startsWith('libtova_runtime'));
        for (const f of dylibFiles) {
            try { return require(join(dir, f)); } catch (_) { continue; }
        }
    }

    return null;
}

function _init() {
    if (_runtime !== null) return _available;

    try {
        const loaded = _findAndLoad();
        if (loaded && typeof loaded.healthCheck === 'function') {
            _runtime = loaded;
            _available = true;
        } else {
            _runtime = false;
            _available = false;
        }
    } catch (_) {
        _runtime = false;
        _available = false;
    }

    return _available;
}

// --- Public API ---

function isRuntimeAvailable() {
    return _init();
}

function healthCheck() {
    if (!_init()) return null;
    return _runtime.healthCheck();
}

function channelCreate(capacity) {
    if (!_init()) throw new Error('tova_runtime not available');
    return _runtime.channelCreate(capacity);
}

function channelSend(id, value) {
    if (!_init()) throw new Error('tova_runtime not available');
    return _runtime.channelSend(id, value);
}

function channelReceive(id) {
    if (!_init()) throw new Error('tova_runtime not available');
    return _runtime.channelReceive(id);
}

function channelClose(id) {
    if (!_init()) throw new Error('tova_runtime not available');
    _runtime.channelClose(id);
}

function execWasm(bytes, func, args) {
    if (!_init()) return Promise.reject(new Error('tova_runtime not available'));
    return _runtime.execWasm(bytes, func, args);
}

function execWasmWithChannels(bytes, func, args) {
    if (!_init()) return Promise.reject(new Error('tova_runtime not available'));
    return _runtime.execWasmWithChannels(bytes, func, args);
}

function concurrentWasm(tasks) {
    if (!_init()) return Promise.reject(new Error('tova_runtime not available'));
    return _runtime.concurrentWasm(tasks);
}

function concurrentWasmWithChannels(tasks) {
    if (!_init()) return Promise.reject(new Error('tova_runtime not available'));
    return _runtime.concurrentWasmWithChannels(tasks);
}

function concurrentWasmShared(tasks) {
    if (!_init()) return Promise.reject(new Error('tova_runtime not available'));
    return _runtime.concurrentWasmShared(tasks);
}

module.exports = {
    isRuntimeAvailable,
    healthCheck,
    channelCreate,
    channelSend,
    channelReceive,
    channelClose,
    execWasm,
    execWasmWithChannels,
    concurrentWasm,
    concurrentWasmWithChannels,
    concurrentWasmShared,
};
