// Tova documentation generator
// Walks ASTs, extracts documented declarations, generates HTML or Markdown docs

export class DocGenerator {
  constructor(modules) {
    this.modules = modules; // Array of { name, ast }
  }

  generate(format = 'html') {
    const allDocs = [];
    for (const mod of this.modules) {
      const docs = this._extractDocs(mod.ast, mod.name);
      if (docs.length > 0) allDocs.push({ module: mod.name, docs });
    }
    return format === 'markdown' ? this._renderMarkdown(allDocs) : this._renderHtml(allDocs);
  }

  _extractDocs(ast, moduleName) {
    const docs = [];
    const walk = (nodes) => {
      for (const node of nodes) {
        if (!node) continue;
        if (node.docstring) {
          const entry = this._nodeToDoc(node, moduleName);
          if (entry) docs.push(entry);
        }
        if (node.body && Array.isArray(node.body)) walk(node.body);
        if ((node.type === 'ServerBlock' || node.type === 'ClientBlock' || node.type === 'SharedBlock') && node.body) {
          walk(node.body);
        }
      }
    };
    walk(ast.body || []);
    return docs;
  }

  _nodeToDoc(node) {
    const parsed = this._parseDocstring(node.docstring);
    switch (node.type) {
      case 'FunctionDeclaration': return {
        kind: 'function',
        name: node.name,
        params: (node.params || []).map(p => ({
          name: typeof p === 'string' ? p : (p.name || ''),
          type: p.typeAnnotation ? this._typeToString(p.typeAnnotation) : null,
          default: p.defaultValue ? true : false,
        })),
        returnType: node.returnType ? this._typeToString(node.returnType) : null,
        isAsync: node.isAsync || false,
        ...parsed,
      };
      case 'TypeDeclaration': return {
        kind: 'type',
        name: node.name,
        variants: (node.variants || []).map(v => ({
          name: v.name,
          fields: v.fields ? v.fields.map(f => ({ name: f.name, type: f.typeAnnotation ? this._typeToString(f.typeAnnotation) : null })) : [],
        })),
        ...parsed,
      };
      case 'InterfaceDeclaration': return {
        kind: 'interface',
        name: node.name,
        methods: (node.methods || []).map(m => ({
          name: m.name,
          params: (m.params || []).map(p => typeof p === 'string' ? p : (p.name || '')),
          returnType: m.returnType ? this._typeToString(m.returnType) : null,
        })),
        ...parsed,
      };
      case 'TraitDeclaration': return {
        kind: 'trait',
        name: node.name,
        methods: (node.methods || []).map(m => ({
          name: m.name,
          params: (m.params || []).map(p => typeof p === 'string' ? p : (p.name || '')),
          returnType: m.returnType ? this._typeToString(m.returnType) : null,
        })),
        ...parsed,
      };
      case 'Assignment': return {
        kind: 'constant',
        name: node.targets && node.targets[0] ? (typeof node.targets[0] === 'string' ? node.targets[0] : (node.targets[0].name || '')) : '',
        ...parsed,
      };
      default: return null;
    }
  }

  _typeToString(t) {
    if (!t) return '';
    if (typeof t === 'string') return t;
    if (t.name) {
      if (t.typeParams && t.typeParams.length > 0) {
        return `${t.name}<${t.typeParams.map(p => this._typeToString(p)).join(', ')}>`;
      }
      return t.name;
    }
    if (t.type === 'ArrayTypeAnnotation') return `[${this._typeToString(t.elementType)}]`;
    if (t.type === 'FunctionTypeAnnotation') {
      const params = t.paramTypes.map(p => this._typeToString(p)).join(', ');
      const ret = t.returnType ? this._typeToString(t.returnType) : 'Void';
      return `(${params}) -> ${ret}`;
    }
    return String(t);
  }

  _parseDocstring(text) {
    const lines = text.split('\n');
    const description = [];
    const params = [];
    const returns = [];
    const examples = [];
    let inExample = false;
    let exampleBuf = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('@param')) {
        inExample = false;
        if (exampleBuf.length) { examples.push(exampleBuf.join('\n')); exampleBuf = []; }
        const rest = trimmed.slice(6).trim();
        const spaceIdx = rest.indexOf(' ');
        if (spaceIdx > 0) {
          params.push({ name: rest.slice(0, spaceIdx), description: rest.slice(spaceIdx + 1).trim() });
        } else {
          params.push({ name: rest, description: '' });
        }
      } else if (trimmed.startsWith('@returns') || trimmed.startsWith('@return')) {
        inExample = false;
        if (exampleBuf.length) { examples.push(exampleBuf.join('\n')); exampleBuf = []; }
        const rest = trimmed.replace(/^@returns?\s*/, '').trim();
        returns.push(rest);
      } else if (trimmed.startsWith('@example')) {
        inExample = true;
        if (exampleBuf.length) { examples.push(exampleBuf.join('\n')); exampleBuf = []; }
      } else if (inExample) {
        exampleBuf.push(line);
      } else {
        description.push(trimmed);
      }
    }
    if (exampleBuf.length) examples.push(exampleBuf.join('\n'));

    return {
      description: description.join(' ').trim(),
      docParams: params,
      docReturns: returns.join(' '),
      docExamples: examples,
    };
  }

  _renderHtml(allDocs) {
    const pages = {};

    // Index page
    let indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Tova API Documentation</title>
  <style>${this._getStyles()}</style>
</head>
<body>
  <div class="container">
    <h1>Tova API Documentation</h1>
    <div class="modules">`;

    for (const mod of allDocs) {
      indexHtml += `\n      <div class="module-card">
        <h2><a href="${mod.module}.html">${mod.module}</a></h2>
        <p>${mod.docs.length} documented item(s)</p>
        <ul>`;
      for (const doc of mod.docs) {
        indexHtml += `\n          <li><code>${doc.name}</code> <span class="badge">${doc.kind}</span></li>`;
      }
      indexHtml += `\n        </ul>
      </div>`;
    }

    indexHtml += `\n    </div>
  </div>
</body>
</html>`;
    pages['index.html'] = indexHtml;

    // Module pages
    for (const mod of allDocs) {
      let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${mod.module} — Tova Docs</title>
  <style>${this._getStyles()}</style>
</head>
<body>
  <div class="container">
    <p><a href="index.html">&larr; Back to index</a></p>
    <h1>${mod.module}</h1>`;

      for (const doc of mod.docs) {
        html += this._renderDocEntry(doc);
      }

      html += `\n  </div>
</body>
</html>`;
      pages[`${mod.module}.html`] = html;
    }

    return pages;
  }

  _renderDocEntry(doc) {
    let html = `\n    <div class="doc-entry" id="${doc.name}">
      <h3><span class="badge">${doc.kind}</span> ${doc.name}`;

    if (doc.kind === 'function') {
      const paramStr = (doc.params || []).map(p => {
        let s = p.name;
        if (p.type) s += ': ' + p.type;
        return s;
      }).join(', ');
      html += `(${paramStr})`;
      if (doc.returnType) html += ` -&gt; ${doc.returnType}`;
      if (doc.isAsync) html = html.replace(`${doc.name}`, `async ${doc.name}`);
    }

    html += `</h3>`;
    if (doc.description) html += `\n      <p>${this._escapeHtml(doc.description)}</p>`;

    if (doc.docParams && doc.docParams.length > 0) {
      html += `\n      <h4>Parameters</h4>\n      <table><tr><th>Name</th><th>Description</th></tr>`;
      for (const p of doc.docParams) {
        html += `\n        <tr><td><code>${p.name}</code></td><td>${this._escapeHtml(p.description)}</td></tr>`;
      }
      html += `\n      </table>`;
    }

    if (doc.docReturns) {
      html += `\n      <h4>Returns</h4>\n      <p>${this._escapeHtml(doc.docReturns)}</p>`;
    }

    if (doc.docExamples && doc.docExamples.length > 0) {
      html += `\n      <h4>Examples</h4>`;
      for (const ex of doc.docExamples) {
        html += `\n      <pre><code>${this._escapeHtml(ex.trim())}</code></pre>`;
      }
    }

    // Type variants
    if (doc.kind === 'type' && doc.variants) {
      html += `\n      <h4>Variants</h4>\n      <ul>`;
      for (const v of doc.variants) {
        const fields = v.fields.map(f => f.type ? `${f.name}: ${f.type}` : f.name).join(', ');
        html += `\n        <li><code>${v.name}${fields ? '(' + fields + ')' : ''}</code></li>`;
      }
      html += `\n      </ul>`;
    }

    // Interface/trait methods
    if ((doc.kind === 'interface' || doc.kind === 'trait') && doc.methods) {
      html += `\n      <h4>Methods</h4>\n      <ul>`;
      for (const m of doc.methods) {
        html += `\n        <li><code>fn ${m.name}(${m.params.join(', ')})${m.returnType ? ' -> ' + m.returnType : ''}</code></li>`;
      }
      html += `\n      </ul>`;
    }

    html += `\n    </div>`;
    return html;
  }

  _renderMarkdown(allDocs) {
    const pages = {};

    let index = `# Tova API Documentation\n\n`;
    for (const mod of allDocs) {
      index += `## [${mod.module}](${mod.module}.md)\n\n`;
      for (const doc of mod.docs) {
        index += `- \`${doc.name}\` _(${doc.kind})_\n`;
      }
      index += '\n';
    }
    pages['index.md'] = index;

    for (const mod of allDocs) {
      let md = `# ${mod.module}\n\n`;
      for (const doc of mod.docs) {
        md += this._renderDocEntryMd(doc);
      }
      pages[`${mod.module}.md`] = md;
    }

    return pages;
  }

  _renderDocEntryMd(doc) {
    let md = `## ${doc.name}\n\n`;
    md += `**Kind:** ${doc.kind}\n\n`;

    if (doc.kind === 'function') {
      const paramStr = (doc.params || []).map(p => {
        let s = p.name;
        if (p.type) s += ': ' + p.type;
        return s;
      }).join(', ');
      md += `\`\`\`tova\n${doc.isAsync ? 'async ' : ''}fn ${doc.name}(${paramStr})${doc.returnType ? ' -> ' + doc.returnType : ''}\n\`\`\`\n\n`;
    }

    if (doc.description) md += `${doc.description}\n\n`;

    if (doc.docParams && doc.docParams.length > 0) {
      md += `### Parameters\n\n| Name | Description |\n|------|-------------|\n`;
      for (const p of doc.docParams) {
        md += `| \`${p.name}\` | ${p.description} |\n`;
      }
      md += '\n';
    }

    if (doc.docReturns) md += `### Returns\n\n${doc.docReturns}\n\n`;

    if (doc.docExamples && doc.docExamples.length > 0) {
      md += `### Examples\n\n`;
      for (const ex of doc.docExamples) {
        md += `\`\`\`tova\n${ex.trim()}\n\`\`\`\n\n`;
      }
    }

    if (doc.kind === 'type' && doc.variants) {
      md += `### Variants\n\n`;
      for (const v of doc.variants) {
        const fields = v.fields.map(f => f.type ? `${f.name}: ${f.type}` : f.name).join(', ');
        md += `- \`${v.name}${fields ? '(' + fields + ')' : ''}\`\n`;
      }
      md += '\n';
    }

    if ((doc.kind === 'interface' || doc.kind === 'trait') && doc.methods) {
      md += `### Methods\n\n`;
      for (const m of doc.methods) {
        md += `- \`fn ${m.name}(${m.params.join(', ')})${m.returnType ? ' -> ' + m.returnType : ''}\`\n`;
      }
      md += '\n';
    }

    md += '---\n\n';
    return md;
  }

  _escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _getStyles() {
    return `
    :root {
      --ctp-base: #1e1e2e;
      --ctp-surface0: #313244;
      --ctp-surface1: #45475a;
      --ctp-text: #cdd6f4;
      --ctp-subtext: #a6adc8;
      --ctp-mauve: #cba6f7;
      --ctp-blue: #89b4fa;
      --ctp-green: #a6e3a1;
      --ctp-peach: #fab387;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--ctp-base); color: var(--ctp-text); line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; padding: 2rem; }
    h1 { color: var(--ctp-mauve); margin-bottom: 1.5rem; }
    h2 { color: var(--ctp-blue); margin: 1rem 0; }
    h3 { color: var(--ctp-text); font-family: monospace; margin-top: 1.5rem; }
    h4 { color: var(--ctp-subtext); margin: 0.8rem 0 0.3rem; font-size: 0.9rem; text-transform: uppercase; }
    a { color: var(--ctp-blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: var(--ctp-surface0); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; }
    pre { background: var(--ctp-surface0); padding: 1rem; border-radius: 8px; overflow-x: auto; margin: 0.5rem 0; }
    pre code { background: none; padding: 0; }
    .badge { display: inline-block; background: var(--ctp-surface1); color: var(--ctp-mauve); font-size: 0.75rem; padding: 0.1em 0.5em; border-radius: 4px; font-family: sans-serif; vertical-align: middle; }
    .doc-entry { border-left: 3px solid var(--ctp-surface1); padding-left: 1rem; margin: 1.5rem 0; }
    .module-card { background: var(--ctp-surface0); border-radius: 8px; padding: 1rem 1.5rem; margin: 1rem 0; }
    .module-card ul { list-style: none; padding-left: 0; }
    .module-card li { margin: 0.3rem 0; }
    table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; }
    th, td { border: 1px solid var(--ctp-surface1); padding: 0.4rem 0.8rem; text-align: left; }
    th { background: var(--ctp-surface0); }
    `;
  }
}
