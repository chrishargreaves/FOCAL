import { DataFactory } from 'n3';
import { compactIri, extractLocalName, WELL_KNOWN_PREFIXES } from './prefixes.js';

const { namedNode } = DataFactory;

const RDF_TYPE = namedNode(WELL_KNOWN_PREFIXES.rdf + 'type');
const RDFS_SUBCLASS_OF = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'subClassOf');
const RDFS_DOMAIN = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'domain');
const RDFS_RANGE = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'range');
const OWL_CLASS = namedNode(WELL_KNOWN_PREFIXES.owl + 'Class');
const OWL_OBJECT_PROPERTY = namedNode(WELL_KNOWN_PREFIXES.owl + 'ObjectProperty');
const OWL_DATATYPE_PROPERTY = namedNode(WELL_KNOWN_PREFIXES.owl + 'DatatypeProperty');
const OWL_RESTRICTION = namedNode(WELL_KNOWN_PREFIXES.owl + 'Restriction');
const OWL_ON_PROPERTY = namedNode(WELL_KNOWN_PREFIXES.owl + 'onProperty');
const OWL_SOME_VALUES_FROM = namedNode(WELL_KNOWN_PREFIXES.owl + 'someValuesFrom');
const OWL_ALL_VALUES_FROM = namedNode(WELL_KNOWN_PREFIXES.owl + 'allValuesFrom');
const OWL_CARDINALITY = namedNode(WELL_KNOWN_PREFIXES.owl + 'cardinality');
const OWL_MIN_CARDINALITY = namedNode(WELL_KNOWN_PREFIXES.owl + 'minCardinality');
const OWL_MAX_CARDINALITY = namedNode(WELL_KNOWN_PREFIXES.owl + 'maxCardinality');
const SH_PROPERTY = namedNode(WELL_KNOWN_PREFIXES.sh + 'property');
const SH_PATH = namedNode(WELL_KNOWN_PREFIXES.sh + 'path');
const SH_DATATYPE = namedNode(WELL_KNOWN_PREFIXES.sh + 'datatype');
const SH_CLASS = namedNode(WELL_KNOWN_PREFIXES.sh + 'class');
const SH_NODE_KIND = namedNode(WELL_KNOWN_PREFIXES.sh + 'nodeKind');
const SH_MIN_COUNT = namedNode(WELL_KNOWN_PREFIXES.sh + 'minCount');
const SH_MAX_COUNT = namedNode(WELL_KNOWN_PREFIXES.sh + 'maxCount');

const FACET_IRI = WELL_KNOWN_PREFIXES.core + 'Facet';

/**
 * Find all classes that are subclasses of core:Facet (transitively).
 */
export function findFacetClasses(stores) {
  const facetClasses = new Set();
  const facetNode = namedNode(FACET_IRI);

  // BFS from core:Facet downward
  const queue = [FACET_IRI];
  const visited = new Set([FACET_IRI]);
  facetClasses.add(FACET_IRI);

  while (queue.length > 0) {
    const current = queue.shift();
    const currentNode = namedNode(current);

    for (const { store } of stores) {
      const quads = store.getQuads(null, RDFS_SUBCLASS_OF, currentNode, null);
      for (const quad of quads) {
        if (quad.subject.termType === 'NamedNode' && !visited.has(quad.subject.value)) {
          visited.add(quad.subject.value);
          facetClasses.add(quad.subject.value);
          queue.push(quad.subject.value);
        }
      }
    }
  }

  // Also check for anything that has rdfs:subClassOf pointing to a known facet
  // (handles cases where intermediate classes weren't caught)
  let changed = true;
  while (changed) {
    changed = false;
    for (const { store } of stores) {
      const allSubclass = store.getQuads(null, RDFS_SUBCLASS_OF, null, null);
      for (const quad of allSubclass) {
        if (
          quad.subject.termType === 'NamedNode' &&
          quad.object.termType === 'NamedNode' &&
          facetClasses.has(quad.object.value) &&
          !facetClasses.has(quad.subject.value)
        ) {
          facetClasses.add(quad.subject.value);
          changed = true;
        }
      }
    }
  }

  return facetClasses;
}

/**
 * Build a map from class IRI → matched facet classes.
 */
export function buildFacetMap(facetClasses, entityIndex) {
  const facetMap = new Map();

  // Build a lookup of facet localNames
  const facetByLocalName = new Map();
  for (const facetIri of facetClasses) {
    const ln = extractLocalName(facetIri);
    if (ln) facetByLocalName.set(ln, facetIri);
  }

  for (const [iri, entry] of entityIndex) {
    if (entry.type !== 'class' || facetClasses.has(iri)) continue;

    const matches = [];
    const ln = entry.localName;

    // Exact match: ClassName + "Facet"
    const exactName = ln + 'Facet';
    if (facetByLocalName.has(exactName)) {
      matches.push({ facetIri: facetByLocalName.get(exactName), matchType: 'exact' });
    }

    // Prefix match: any facet starting with className (but not exact match)
    for (const [facetLn, facetIri] of facetByLocalName) {
      if (facetLn !== exactName && facetLn.startsWith(ln) && facetLn.endsWith('Facet')) {
        matches.push({ facetIri, matchType: 'prefix' });
      }
    }

    if (matches.length > 0) {
      facetMap.set(iri, matches);
    }
  }

  return facetMap;
}

/**
 * Extract SHACL properties for a class (its NodeShape).
 * UCO/CASE define NodeShapes with the same IRI as the class.
 */
export function extractShaclProperties(stores, classIri) {
  const properties = [];
  const classNode = namedNode(classIri);

  for (const { store } of stores) {
    const propQuads = store.getQuads(classNode, SH_PROPERTY, null, null);
    for (const propQuad of propQuads) {
      const blankNode = propQuad.object;

      const pathQuads = store.getQuads(blankNode, SH_PATH, null, null);
      if (pathQuads.length === 0) continue;

      const path = pathQuads[0].object.value;
      const datatype = getFirst(store, blankNode, SH_DATATYPE);
      const shClass = getFirst(store, blankNode, SH_CLASS);
      const nodeKind = getFirst(store, blankNode, SH_NODE_KIND);
      const minCount = getFirst(store, blankNode, SH_MIN_COUNT);
      const maxCount = getFirst(store, blankNode, SH_MAX_COUNT);

      properties.push({
        path,
        pathLocalName: extractLocalName(path),
        pathCompactIri: compactIri(path),
        datatype: datatype || null,
        class: shClass || null,
        nodeKind: nodeKind || null,
        minCount: minCount ? parseInt(minCount, 10) : null,
        maxCount: maxCount ? parseInt(maxCount, 10) : null,
      });
    }
  }

  properties.sort((a, b) => a.pathLocalName.localeCompare(b.pathLocalName));
  return properties;
}

function getFirst(store, subject, predicate) {
  const quads = store.getQuads(subject, predicate, null, null);
  return quads.length > 0 ? quads[0].object.value : null;
}

/**
 * Get OWL-style properties with rdfs:domain pointing to classIri.
 */
export function getOwlProperties(stores, classIri) {
  const properties = [];
  const classNode = namedNode(classIri);

  for (const { store } of stores) {
    const domainQuads = store.getQuads(null, RDFS_DOMAIN, classNode, null);
    for (const quad of domainQuads) {
      if (quad.subject.termType !== 'NamedNode') continue;

      const propIri = quad.subject.value;
      const rangeQuads = store.getQuads(quad.subject, RDFS_RANGE, null, null);
      const range = rangeQuads.length > 0 ? rangeQuads[0].object.value : null;

      // Determine if object or datatype property
      const typeQuads = store.getQuads(quad.subject, RDF_TYPE, null, null);
      let propType = 'object';
      for (const tq of typeQuads) {
        if (tq.object.value === OWL_DATATYPE_PROPERTY.value) {
          propType = 'datatype';
          break;
        }
      }

      properties.push({
        propertyIri: propIri,
        localName: extractLocalName(propIri),
        compactIri: compactIri(propIri),
        type: propType,
        range: range || null,
      });
    }
  }

  properties.sort((a, b) => a.localName.localeCompare(b.localName));
  return properties;
}

/**
 * Get class hierarchy: superclasses (chain) and direct subclasses.
 */
export function getClassHierarchy(stores, classIri) {
  const superClasses = [];
  const subClasses = [];

  // Walk UP superclass chain (BFS)
  const visited = new Set([classIri]);
  const queue = [classIri];
  while (queue.length > 0) {
    const current = queue.shift();
    const currentNode = namedNode(current);

    for (const { store } of stores) {
      const quads = store.getQuads(currentNode, RDFS_SUBCLASS_OF, null, null);
      for (const quad of quads) {
        if (quad.object.termType === 'NamedNode' && !visited.has(quad.object.value)) {
          visited.add(quad.object.value);
          superClasses.push(quad.object.value);
          queue.push(quad.object.value);
        }
      }
    }
  }

  // Direct subclasses (one level down)
  const classNode = namedNode(classIri);
  const subVisited = new Set();
  for (const { store } of stores) {
    const quads = store.getQuads(null, RDFS_SUBCLASS_OF, classNode, null);
    for (const quad of quads) {
      if (quad.subject.termType === 'NamedNode' && !subVisited.has(quad.subject.value)) {
        subVisited.add(quad.subject.value);
        subClasses.push(quad.subject.value);
      }
    }
  }

  subClasses.sort((a, b) => extractLocalName(a).localeCompare(extractLocalName(b)));

  return { superClasses, subClasses };
}

/**
 * Extract OWL restrictions from rdfs:subClassOf blank nodes.
 */
export function getOwlRestrictions(stores, classIri) {
  const restrictions = [];
  const classNode = namedNode(classIri);

  for (const { store } of stores) {
    const subClassQuads = store.getQuads(classNode, RDFS_SUBCLASS_OF, null, null);
    for (const quad of subClassQuads) {
      if (quad.object.termType !== 'BlankNode') continue;

      const bn = quad.object;
      const typeQuads = store.getQuads(bn, RDF_TYPE, OWL_RESTRICTION, null);
      if (typeQuads.length === 0) continue;

      const onPropQuads = store.getQuads(bn, OWL_ON_PROPERTY, null, null);
      if (onPropQuads.length === 0) continue;

      const onProperty = onPropQuads[0].object.value;

      const restriction = {
        onProperty,
        onPropertyLocalName: extractLocalName(onProperty),
        onPropertyCompactIri: compactIri(onProperty),
      };

      const someValues = getFirst(store, bn, OWL_SOME_VALUES_FROM);
      if (someValues) restriction.someValuesFrom = someValues;

      const allValues = getFirst(store, bn, OWL_ALL_VALUES_FROM);
      if (allValues) restriction.allValuesFrom = allValues;

      const card = getFirst(store, bn, OWL_CARDINALITY);
      if (card) restriction.cardinality = parseInt(card, 10);

      const minCard = getFirst(store, bn, OWL_MIN_CARDINALITY);
      if (minCard) restriction.minCardinality = parseInt(minCard, 10);

      const maxCard = getFirst(store, bn, OWL_MAX_CARDINALITY);
      if (maxCard) restriction.maxCardinality = parseInt(maxCard, 10);

      restrictions.push(restriction);
    }
  }

  restrictions.sort((a, b) => a.onPropertyLocalName.localeCompare(b.onPropertyLocalName));
  return restrictions;
}
