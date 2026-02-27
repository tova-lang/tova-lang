import { describe, test, expect } from 'bun:test';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';

// Load the napi-rs addon
function loadRuntime() {
    const searchDirs = [
        join(__dirname, '..', 'tova_runtime'),
        join(__dirname, '..', 'tova_runtime', 'target', 'release'),
    ];
    for (const dir of searchDirs) {
        if (!existsSync(dir)) continue;
        const files = readdirSync(dir).filter(f => f.endsWith('.node'));
        for (const f of files) {
            try { return require(join(dir, f)); } catch (e) { continue; }
        }
    }
    throw new Error('Could not load tova_runtime native addon');
}

describe('tova_runtime foundation', () => {
    let runtime;

    test('loads native addon', () => {
        runtime = loadRuntime();
        expect(runtime).toBeDefined();
    });

    test('health check', () => {
        runtime = loadRuntime();
        expect(runtime.healthCheck()).toBe('tova_runtime ok');
    });
});
