// Tova standard library — validation utilities

export function is_email(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export function is_url(s) {
  try { new URL(s); return true; } catch { return false; }
}

export function is_numeric(s) {
  return typeof s === 'string' && s.length > 0 && !isNaN(Number(s));
}

export function is_alpha(s) {
  return /^[a-zA-Z]+$/.test(s);
}

export function is_alphanumeric(s) {
  return /^[a-zA-Z0-9]+$/.test(s);
}

export function is_uuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export function is_hex(s) {
  return /^[0-9a-fA-F]+$/.test(s);
}
