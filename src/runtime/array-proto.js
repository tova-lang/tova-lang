// Tova array method extensions — bridges Tova method syntax to JavaScript
// Allows: [1,2,3].sorted() instead of requiring sorted([1,2,3])

const methods = {
  sorted(key)     { const c = [...this]; if (key) c.sort((x, y) => { const kx = key(x), ky = key(y); return kx < ky ? -1 : kx > ky ? 1 : 0; }); else c.sort((x, y) => x < y ? -1 : x > y ? 1 : 0); return c; },
  reversed()      { return [...this].reverse(); },
  unique()        { return [...new Set(this)]; },
  chunk(n)        { const r = []; for (let i = 0; i < this.length; i += n) r.push(this.slice(i, i + n)); return r; },
  flatten()       { return this.flat(); },
  first()         { return this[0] ?? null; },
  last()          { return this[this.length - 1] ?? null; },
  take(n)         { return this.slice(0, n); },
  drop(n)         { return this.slice(n); },
  compact()       { return this.filter(v => v != null); },
  sum()           { return this.reduce((a, b) => a + b, 0); },
  min_val()       { if (this.length === 0) return null; let m = this[0]; for (let i = 1; i < this.length; i++) if (this[i] < m) m = this[i]; return m; },
  max_val()       { if (this.length === 0) return null; let m = this[0]; for (let i = 1; i < this.length; i++) if (this[i] > m) m = this[i]; return m; },
  group_by(fn)    { const r = {}; for (const v of this) { const k = fn(v); if (!r[k]) r[k] = []; r[k].push(v); } return r; },
  partition(fn)   { const y = [], n = []; for (const v of this) { (fn(v) ? y : n).push(v); } return [y, n]; },
  zip_with(other) { const m = Math.min(this.length, other.length); const r = []; for (let i = 0; i < m; i++) r.push([this[i], other[i]]); return r; },
  frequencies()   { const r = {}; for (const v of this) { const k = String(v); r[k] = (r[k] || 0) + 1; } return r; },
};

for (const [name, fn] of Object.entries(methods)) {
  if (!Array.prototype[name]) {
    Object.defineProperty(Array.prototype, name, {
      value: fn,
      writable: true,
      configurable: true,
    });
  }
}
