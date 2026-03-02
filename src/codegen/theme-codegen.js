// Theme codegen: converts ThemeBlock AST to CSS custom properties

const PX_SECTIONS = new Set(['spacing', 'radius']);
const PX_FONT_PREFIXES = ['size.'];

const CATEGORY_MAP = {
  colors: 'color',
  spacing: 'spacing',
  radius: 'radius',
  shadow: 'shadow',
  font: 'font',
  breakpoints: 'breakpoint',
  transition: 'transition',
};

export class ThemeCodegen {
  static mergeThemeBlocks(themeBlocks) {
    const sections = new Map();
    const darkOverrides = [];
    for (const block of themeBlocks) {
      for (const section of block.sections) {
        if (!sections.has(section.name)) sections.set(section.name, []);
        sections.get(section.name).push(...section.tokens);
      }
      darkOverrides.push(...block.darkOverrides);
    }
    return { sections, darkOverrides };
  }

  static generateCSS(themeConfig) {
    const { sections, darkOverrides } = themeConfig;
    const rootProps = [];
    const darkProps = [];

    for (const [sectionName, tokens] of sections) {
      const prefix = CATEGORY_MAP[sectionName] || sectionName;
      for (const token of tokens) {
        const cssName = `--tova-${prefix}-${token.name.replace(/\./g, '-')}`;
        const cssValue = ThemeCodegen._formatValue(sectionName, token.name, token.value);
        rootProps.push(`  ${cssName}: ${cssValue};`);
      }
    }

    for (const override of darkOverrides) {
      const dotIdx = override.name.indexOf('.');
      const sectionName = override.name.slice(0, dotIdx);
      const tokenName = override.name.slice(dotIdx + 1);
      const prefix = CATEGORY_MAP[sectionName] || sectionName;
      const cssName = `--tova-${prefix}-${tokenName.replace(/\./g, '-')}`;
      const cssValue = ThemeCodegen._formatValue(sectionName, tokenName, override.value);
      darkProps.push(`    ${cssName}: ${cssValue};`);
    }

    let css = `:root {\n${rootProps.join('\n')}\n}`;
    if (darkProps.length > 0) {
      css += `\n@media (prefers-color-scheme: dark) {\n  :root {\n${darkProps.join('\n')}\n  }\n}`;
    }
    return css;
  }

  static _formatValue(sectionName, tokenName, value) {
    if (typeof value === 'number') {
      if (PX_SECTIONS.has(sectionName)) return value + 'px';
      if (sectionName === 'font' && PX_FONT_PREFIXES.some(p => tokenName.startsWith(p))) return value + 'px';
      return String(value);
    }
    return value;
  }
}
