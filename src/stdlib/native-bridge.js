// Tova Native FFI Bridge
// Provides high-performance Rust-backed operations via Bun FFI
// Falls back gracefully to pure JS when native library is unavailable

let _lib = null;
let _available = false;

function _findLibrary() {
  const { existsSync } = require('fs');
  const { join, dirname } = require('path');

  // Search paths for the native library
  const names = process.platform === 'darwin'
    ? ['libtova_native.dylib']
    : process.platform === 'win32'
      ? ['tova_native.dll']
      : ['libtova_native.so'];

  const searchDirs = [
    // Relative to this file (src/stdlib/)
    join(dirname(__filename), '..', '..', 'native', 'target', 'release'),
    // Relative to bin/tova.js
    join(dirname(__filename), '..', 'native', 'target', 'release'),
    // System-wide install
    join(process.env.HOME || '', '.tova', 'lib'),
    // Next to the binary
    dirname(process.argv[1] || ''),
  ];

  for (const dir of searchDirs) {
    for (const name of names) {
      const path = join(dir, name);
      if (existsSync(path)) return path;
    }
  }
  return null;
}

function _init() {
  if (_lib !== null) return _available;

  try {
    const libPath = _findLibrary();
    if (!libPath) {
      _lib = false;
      _available = false;
      return false;
    }

    const { dlopen, FFIType } = require('bun:ffi');
    _lib = dlopen(libPath, {
      tova_sort_f64: {
        args: [FFIType.ptr, FFIType.u64],
        returns: FFIType.void,
      },
      tova_sort_i64: {
        args: [FFIType.ptr, FFIType.u64],
        returns: FFIType.void,
      },
      tova_unique_sorted_i64: {
        args: [FFIType.ptr, FFIType.u64],
        returns: FFIType.u64,
      },
      tova_unique_sorted_f64: {
        args: [FFIType.ptr, FFIType.u64],
        returns: FFIType.u64,
      },
      tova_sum_f64: {
        args: [FFIType.ptr, FFIType.u64],
        returns: FFIType.f64,
      },
      tova_min_f64: {
        args: [FFIType.ptr, FFIType.u64],
        returns: FFIType.f64,
      },
      tova_max_f64: {
        args: [FFIType.ptr, FFIType.u64],
        returns: FFIType.f64,
      },
    });
    _available = true;
    return true;
  } catch (e) {
    _lib = false;
    _available = false;
    return false;
  }
}

/**
 * Sort an array of numbers using Rust radix sort.
 * Returns a new sorted array. Falls back to JS sort if native unavailable.
 * Only used for arrays above the threshold (overhead of copying to/from TypedArray).
 */
export function nativeSortNumbers(arr) {
  if (!_init()) return null; // fallback signal

  const len = arr.length;
  const buf = new Float64Array(len);
  for (let i = 0; i < len; i++) buf[i] = arr[i];

  _lib.symbols.tova_sort_f64(buf, len);

  const result = new Array(len);
  for (let i = 0; i < len; i++) result[i] = buf[i];
  return result;
}

/**
 * Sort a Float64Array in-place using Rust radix sort.
 */
export function nativeSortF64(buf) {
  if (!_init()) return false;
  _lib.symbols.tova_sort_f64(buf, buf.length);
  return true;
}

/**
 * Sum an array of numbers using Rust Kahan summation.
 */
export function nativeSum(arr) {
  if (!_init()) return null;
  const buf = new Float64Array(arr);
  return _lib.symbols.tova_sum_f64(buf, buf.length);
}

/**
 * Find min of numeric array using Rust.
 */
export function nativeMin(arr) {
  if (!_init()) return null;
  const buf = new Float64Array(arr);
  return _lib.symbols.tova_min_f64(buf, buf.length);
}

/**
 * Find max of numeric array using Rust.
 */
export function nativeMax(arr) {
  if (!_init()) return null;
  const buf = new Float64Array(arr);
  return _lib.symbols.tova_max_f64(buf, buf.length);
}

/**
 * Check if native library is available.
 */
export function isNativeAvailable() {
  return _init();
}
