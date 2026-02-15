// Tova standard library — math functions

export const PI = Math.PI;
export const E = Math.E;
export const INF = Infinity;

export function sin(n) { return Math.sin(n); }
export function cos(n) { return Math.cos(n); }
export function tan(n) { return Math.tan(n); }
export function asin(n) { return Math.asin(n); }
export function acos(n) { return Math.acos(n); }
export function atan(n) { return Math.atan(n); }
export function atan2(y, x) { return Math.atan2(y, x); }

export function log(n) { return Math.log(n); }
export function log2(n) { return Math.log2(n); }
export function log10(n) { return Math.log10(n); }
export function exp(n) { return Math.exp(n); }

export function sign(n) { return Math.sign(n); }
export function trunc(n) { return Math.trunc(n); }
export function is_nan(n) { return Number.isNaN(n); }
export function is_finite(n) { return Number.isFinite(n); }
export function is_close(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 1e-9 : tol); }
export function to_radians(deg) { return deg * Math.PI / 180; }
export function to_degrees(rad) { return rad * 180 / Math.PI; }

export function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
export function lcm(a, b) {
  if (a === 0 && b === 0) return 0;
  let x = Math.abs(a), y = Math.abs(b);
  while (y) { const t = y; y = x % y; x = t; }
  return Math.abs(a * b) / x;
}
export function factorial(n) { if (n < 0) return null; if (n <= 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
