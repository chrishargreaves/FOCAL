export const WELL_KNOWN_PREFIXES = {
  'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
  'owl': 'http://www.w3.org/2002/07/owl#',
  'xsd': 'http://www.w3.org/2001/XMLSchema#',
  'sh': 'http://www.w3.org/ns/shacl#',
  'dcterms': 'http://purl.org/dc/terms/',
  'skos': 'http://www.w3.org/2004/02/skos/core#',
  'core': 'https://ontology.unifiedcyberontology.org/uco/core/',
  'observable': 'https://ontology.unifiedcyberontology.org/uco/observable/',
  'uco-core': 'https://ontology.unifiedcyberontology.org/uco/core/',
  'uco-observable': 'https://ontology.unifiedcyberontology.org/uco/observable/',
  'uco-action': 'https://ontology.unifiedcyberontology.org/uco/action/',
  'uco-identity': 'https://ontology.unifiedcyberontology.org/uco/identity/',
  'uco-location': 'https://ontology.unifiedcyberontology.org/uco/location/',
  'uco-marking': 'https://ontology.unifiedcyberontology.org/uco/marking/',
  'uco-pattern': 'https://ontology.unifiedcyberontology.org/uco/pattern/',
  'uco-role': 'https://ontology.unifiedcyberontology.org/uco/role/',
  'uco-time': 'https://ontology.unifiedcyberontology.org/uco/time/',
  'uco-tool': 'https://ontology.unifiedcyberontology.org/uco/tool/',
  'uco-types': 'https://ontology.unifiedcyberontology.org/uco/types/',
  'uco-victim': 'https://ontology.unifiedcyberontology.org/uco/victim/',
  'uco-vocabulary': 'https://ontology.unifiedcyberontology.org/uco/vocabulary/',
  'case-investigation': 'https://ontology.caseontology.org/case/investigation/',
  'investigation': 'https://ontology.caseontology.org/case/investigation/',
  'case-vocabulary': 'https://ontology.caseontology.org/case/vocabulary/',
  'vocabulary': 'https://ontology.caseontology.org/case/vocabulary/',
  'solveit': 'http://www.intavia.eu/solveit/',
};

// Build a reverse map: namespace → prefix (longest namespace first for matching)
const _reverseEntries = Object.entries(WELL_KNOWN_PREFIXES)
  .sort((a, b) => b[1].length - a[1].length);

// Merge in dynamic prefixes discovered from parsed TTL files
const _dynamicPrefixes = new Map();

export function registerPrefixes(prefixes) {
  for (const [prefix, ns] of Object.entries(prefixes)) {
    if (!WELL_KNOWN_PREFIXES[prefix]) {
      _dynamicPrefixes.set(prefix, ns);
    }
  }
}

export function compactIri(iri) {
  if (!iri || typeof iri !== 'string') return iri;

  // Check well-known prefixes first
  for (const [prefix, ns] of _reverseEntries) {
    if (iri.startsWith(ns)) {
      return `${prefix}:${iri.slice(ns.length)}`;
    }
  }

  // Check dynamic prefixes
  for (const [prefix, ns] of _dynamicPrefixes) {
    if (iri.startsWith(ns)) {
      return `${prefix}:${iri.slice(ns.length)}`;
    }
  }

  return iri;
}

export function extractLocalName(iri) {
  if (!iri || typeof iri !== 'string') return iri;
  const hashIdx = iri.lastIndexOf('#');
  if (hashIdx !== -1) return iri.slice(hashIdx + 1);
  const slashIdx = iri.lastIndexOf('/');
  if (slashIdx !== -1) return iri.slice(slashIdx + 1);
  return iri;
}
