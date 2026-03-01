/**
 * Search/filter entities from the entity index.
 *
 * @param {Map<string, object>} entityIndex
 * @param {string} query - search string
 * @param {Set<string>} enabledSourceIds - only include entities from these sources
 * @param {string|null} typeFilter - 'class', 'property', 'individual', or null for all
 * @returns {object[]} sorted array of matching EntityEntry objects
 */
export function searchEntities(entityIndex, query, enabledSourceIds, typeFilter = null) {
  const results = [];
  const q = query.toLowerCase().trim();

  for (const [iri, entry] of entityIndex) {
    if (!enabledSourceIds.has(entry.sourceId)) continue;
    if (typeFilter && entry.type !== typeFilter) continue;

    if (!q) {
      results.push(entry);
      continue;
    }

    const localNameLower = entry.localName.toLowerCase();
    const compactLower = entry.compactIri.toLowerCase();
    const labelLower = (entry.label || '').toLowerCase();
    const commentLower = (entry.comment || '').toLowerCase();

    if (
      localNameLower.includes(q) ||
      compactLower.includes(q) ||
      labelLower.includes(q) ||
      commentLower.includes(q) ||
      iri.toLowerCase().includes(q)
    ) {
      // Score: prefix match on localName is best
      let score = 3;
      if (localNameLower.startsWith(q)) score = 0;
      else if (localNameLower.includes(q)) score = 1;
      else if (labelLower.includes(q)) score = 2;

      results.push({ ...entry, _score: score });
    }
  }

  results.sort((a, b) => {
    const scoreA = a._score ?? 3;
    const scoreB = b._score ?? 3;
    if (scoreA !== scoreB) return scoreA - scoreB;
    return a.localName.localeCompare(b.localName);
  });

  return results;
}
