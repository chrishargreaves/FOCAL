import { Parser, Store } from 'n3';
import { registerPrefixes } from './prefixes.js';

const CACHE_PREFIX = 'focal-ttl-';

export async function fetchAndParse(url, { skipCache = false } = {}) {
  const cacheKey = CACHE_PREFIX + url;
  let ttlText = null;

  // Check sessionStorage cache (unless bypassed)
  if (!skipCache) {
    try {
      ttlText = sessionStorage.getItem(cacheKey);
    } catch {
      // sessionStorage unavailable
    }
  }

  // Fetch if not cached
  if (!ttlText) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    ttlText = await response.text();

    // Cache in sessionStorage
    try {
      sessionStorage.setItem(cacheKey, ttlText);
    } catch {
      // Quota exceeded — silently skip
    }
  }

  // Parse with N3
  const store = new Store();
  const parsedPrefixes = {};

  return new Promise((resolve, reject) => {
    const parser = new Parser({ baseIRI: url });
    parser.parse(ttlText, (error, quad, prefixes) => {
      if (error) {
        reject(error);
        return;
      }
      if (quad) {
        store.addQuad(quad);
      } else {
        // End of parsing — prefixes available
        if (prefixes) {
          Object.assign(parsedPrefixes, prefixes);
          registerPrefixes(prefixes);
        }
        resolve({
          store,
          prefixes: parsedPrefixes,
          quadCount: store.size,
        });
      }
    });
  });
}
