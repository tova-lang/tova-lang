// Tova standard library — functional utilities

export function compose(...fns) {
  return (x) => fns.reduceRight((v, fn) => fn(v), x);
}

export function pipe_fn(...fns) {
  return (x) => fns.reduce((v, fn) => fn(v), x);
}

export function identity(x) {
  return x;
}

export function memoize(fn) {
  const cache = new Map();
  return function(...args) {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    const result = fn.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

export function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function throttle(fn, ms) {
  let last = 0;
  return function(...args) {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      return fn.apply(this, args);
    }
  };
}

export function once(fn) {
  let called = false, result;
  return function(...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}

export function negate(fn) {
  return function(...args) {
    return !fn.apply(this, args);
  };
}

// ── Extended Functional ───────────────────────────────────

export function partial(fn, ...bound) {
  return function(...args) {
    return fn(...bound, ...args);
  };
}

export function curry(fn, arity) {
  const n = arity || fn.length;
  return function curried(...args) {
    if (args.length >= n) return fn(...args);
    return function(...more) { return curried(...args, ...more); };
  };
}

export function flip(fn) {
  return function(a, b, ...rest) {
    return fn(b, a, ...rest);
  };
}
