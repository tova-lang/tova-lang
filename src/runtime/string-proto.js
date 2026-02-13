// Tova string method extensions — bridges Tova method syntax to JavaScript
// Allows: "hello".upper() instead of requiring upper("hello")

const methods = {
  upper()       { return this.toUpperCase(); },
  lower()       { return this.toLowerCase(); },
  contains(s)   { return this.includes(s); },
  starts_with(s){ return this.startsWith(s); },
  ends_with(s)  { return this.endsWith(s); },
  chars()       { return [...this]; },
  words()       { return this.split(/\s+/).filter(Boolean); },
  lines()       { return this.split('\n'); },
  capitalize()  { return this.length ? this.charAt(0).toUpperCase() + this.slice(1) : this; },
  title_case()  { return this.replace(/\b\w/g, c => c.toUpperCase()); },
  snake_case()  { return this.replace(/[-\s]+/g, '_').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().replace(/^_/, ''); },
  camel_case()  { return this.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '').replace(/^[A-Z]/, c => c.toLowerCase()); },
};

for (const [name, fn] of Object.entries(methods)) {
  if (!String.prototype[name]) {
    Object.defineProperty(String.prototype, name, {
      value: fn,
      writable: true,
      configurable: true,
    });
  }
}
