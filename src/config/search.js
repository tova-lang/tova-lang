// src/config/search.js

export function formatSearchResults(items) {
  if (items.length === 0) return '  No packages found.\n';
  const lines = [];
  for (const item of items) {
    const modulePath = `github.com/${item.full_name}`;
    const stars = item.stargazers_count || 0;
    const desc = item.description || '(no description)';
    const updated = item.updated_at ? item.updated_at.slice(0, 10) : 'unknown';
    lines.push(`  ${modulePath}`);
    lines.push(`    ${desc}`);
    lines.push(`    Stars: ${stars}  Updated: ${updated}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function searchPackages(query) {
  const searchQuery = encodeURIComponent(`${query} topic:tova-package`);
  const url = `https://api.github.com/search/repositories?q=${searchQuery}&sort=stars&per_page=20`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/vnd.github.v3+json' },
  });
  if (!res.ok) throw new Error(`GitHub search failed: ${res.statusText}`);
  const data = await res.json();
  return data.items || [];
}
