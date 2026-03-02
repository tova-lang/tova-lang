// Theme-specific AST Node definitions for the Tova language
// Extracted for lazy loading — only loaded when theme { } blocks are used.

export class ThemeBlock {
  constructor(sections, darkOverrides, loc) {
    this.type = 'ThemeBlock';
    this.sections = sections;           // Array of ThemeSection
    this.darkOverrides = darkOverrides; // Array of ThemeToken (flat dark mode overrides)
    this.loc = loc;
  }
}

export class ThemeSection {
  constructor(name, tokens, loc) {
    this.type = 'ThemeSection';
    this.name = name;       // string — section name, e.g. "colors", "spacing", "font"
    this.tokens = tokens;   // Array of ThemeToken
    this.loc = loc;
  }
}

export class ThemeToken {
  constructor(name, value, loc) {
    this.type = 'ThemeToken';
    this.name = name;   // string — dot-separated name, e.g. "primary.hover"
    this.value = value;  // string or number — token value
    this.loc = loc;
  }
}
