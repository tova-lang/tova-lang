// Line-level TOML editing for tova add / tova remove.
// Operates on raw text to preserve formatting, comments, and whitespace.

import { readFileSync, writeFileSync } from 'fs';

export function addToSection(filePath, section, key, value) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const entry = `${key} = "${value}"`;

  // Find the section header
  const sectionIdx = findSectionIndex(lines, section);

  if (sectionIdx === -1) {
    // Section doesn't exist — append it at end of file
    const newLines = [...lines];
    // Ensure blank line before new section
    if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
      newLines.push('');
    }
    newLines.push(`[${section}]`);
    newLines.push(entry);
    writeFileSync(filePath, newLines.join('\n'));
    return;
  }

  // Find the end of this section (next section header or EOF)
  const endIdx = findSectionEnd(lines, sectionIdx);

  // Check if key already exists in this section — update it
  for (let i = sectionIdx + 1; i < endIdx; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const existingKey = line.slice(0, eqIdx).trim();
      if (existingKey === key) {
        lines[i] = entry;
        writeFileSync(filePath, lines.join('\n'));
        return;
      }
    }
  }

  // Key doesn't exist — insert before the end of section
  lines.splice(endIdx, 0, entry);
  writeFileSync(filePath, lines.join('\n'));
}

export function removeFromSection(filePath, section, key) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const sectionIdx = findSectionIndex(lines, section);
  if (sectionIdx === -1) return false;

  const endIdx = findSectionEnd(lines, sectionIdx);

  for (let i = sectionIdx + 1; i < endIdx; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx !== -1) {
      const existingKey = line.slice(0, eqIdx).trim();
      if (existingKey === key) {
        lines.splice(i, 1);
        writeFileSync(filePath, lines.join('\n'));
        return true;
      }
    }
  }

  return false;
}

function findSectionIndex(lines, section) {
  const pattern = `[${section}]`;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === pattern) return i;
  }
  return -1;
}

function findSectionEnd(lines, sectionIdx) {
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('[') && !line.startsWith('[[')) {
      return i;
    }
  }
  return lines.length;
}
