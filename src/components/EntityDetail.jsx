import { useMemo, useState, useCallback } from 'react';
import { DataFactory } from 'n3';
import { useOntologyStore, getFilteredStores } from '../store/ontologyStore.js';
import { extractShaclProperties, getOwlProperties, getOwlRestrictions, getClassHierarchy } from '../utils/facetResolver.js';
import { compactIri, extractLocalName, WELL_KNOWN_PREFIXES } from '../utils/prefixes.js';
import { BADGE_ABBREVIATIONS } from '../store/config.js';
import ClassHierarchy from './ClassHierarchy.jsx';
import HierarchyDiagram from './HierarchyDiagram.jsx';
import FacetProperties from './FacetProperties.jsx';
import PropertyTable from './PropertyTable.jsx';

const { namedNode } = DataFactory;

// Linkify URLs and IRIs in text — makes them clickable hyperlinks,
// or navigates internally if the IRI is in our entity index.
function LinkifiedText({ text, entityIndex, selectEntity }) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s,)<>"]+)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[1];
    if (entityIndex.has(url)) {
      parts.push(
        <span key={match.index} className="clickable-iri" onClick={() => selectEntity(url)}>
          {url}
        </span>
      );
    } else {
      parts.push(
        <a key={match.index} href={url} target="_blank" rel="noopener noreferrer">{url}</a>
      );
    }
    lastIndex = urlRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return <>{parts}</>;
}

function getIssueUrl(source, entry) {
  if (!source) return null;
  // Use explicit issuesUrl if provided (e.g. repos with issue templates)
  if (source.issuesUrl) return source.issuesUrl;
  // Otherwise derive from raw GitHub URL
  const match = source.url?.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\//);
  if (!match) return null;
  const [, owner, repo] = match;
  const title = encodeURIComponent(`Issue with ${entry.compactIri}`);
  const body = encodeURIComponent(`**Entity:** ${entry.compactIri}\n**IRI:** ${entry.iri}\n**Type:** ${entry.type}\n\n**Description of issue:**\n\n`);
  return `https://github.com/${owner}/${repo}/issues/new?title=${title}&body=${body}`;
}

const ANNOTATION_PREDICATES = [
  { iri: WELL_KNOWN_PREFIXES.rdfs + 'label', label: 'rdfs:label' },
  { iri: WELL_KNOWN_PREFIXES.rdfs + 'comment', label: 'rdfs:comment' },
  { iri: WELL_KNOWN_PREFIXES.rdfs + 'seeAlso', label: 'rdfs:seeAlso' },
  { iri: 'http://purl.org/dc/terms/description', label: 'dcterms:description' },
  { iri: WELL_KNOWN_PREFIXES.owl + 'versionInfo', label: 'owl:versionInfo' },
  { iri: 'http://www.w3.org/2004/02/skos/core#definition', label: 'skos:definition' },
  { iri: 'http://www.w3.org/2004/02/skos/core#example', label: 'skos:example' },
];

function CollapsibleSection({ title, count, defaultOpen = true, forceState, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [lastForce, setLastForce] = useState(forceState);

  // React to external expand/collapse all
  if (forceState !== lastForce) {
    setLastForce(forceState);
    if (forceState?.startsWith('open')) setOpen(true);
    else if (forceState?.startsWith('closed')) setOpen(false);
  }

  return (
    <div className="collapsible-section">
      <button className="collapsible-header" onClick={() => setOpen(!open)}>
        <span className={`collapsible-arrow ${open ? 'open' : ''}`}>&#9654;</span>
        {title}
        {count != null && <span className="collapsible-count">{count}</span>}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

export default function EntityDetail() {
  const selectedEntityIri = useOntologyStore(s => s.selectedEntityIri);
  const entityIndex = useOntologyStore(s => s.entityIndex);
  const ontologyState = useOntologyStore(s => s.ontologyState);
  const sources = useOntologyStore(s => s.sources);
  const selectEntity = useOntologyStore(s => s.selectEntity);
  const facetMap = useOntologyStore(s => s.facetMap);
  const restrictionFacetMap = useOntologyStore(s => s.restrictionFacetMap);
  const viewGroups = useOntologyStore(s => s.viewGroups);

  const entry = entityIndex.get(selectedEntityIri);

  const stores = useMemo(
    () => getFilteredStores(ontologyState, sources, viewGroups),
    [ontologyState, sources, viewGroups]
  );

  // Direct SHACL properties on this entity
  const shaclProps = useMemo(
    () => entry?.type === 'class' ? extractShaclProperties(stores, selectedEntityIri) : [],
    [stores, selectedEntityIri, entry?.type]
  );

  // OWL domain properties
  const owlProps = useMemo(
    () => entry?.type === 'class' ? getOwlProperties(stores, selectedEntityIri) : [],
    [stores, selectedEntityIri, entry?.type]
  );

  // OWL restrictions
  const restrictions = useMemo(
    () => entry?.type === 'class' ? getOwlRestrictions(stores, selectedEntityIri) : [],
    [stores, selectedEntityIri, entry?.type]
  );

  // Inherited properties from superclasses
  const inheritedGroups = useMemo(() => {
    if (entry?.type !== 'class') return [];
    const { superClasses } = getClassHierarchy(stores, selectedEntityIri);
    const directShaclPaths = new Set(shaclProps.map(p => p.path));
    const directOwlIris = new Set(owlProps.map(p => p.propertyIri));
    const seenPaths = new Set([...directShaclPaths, ...directOwlIris]);
    const groups = [];

    for (const ancestorIri of superClasses) {
      const ancestorShacl = extractShaclProperties(stores, ancestorIri)
        .filter(p => !seenPaths.has(p.path));
      const ancestorOwl = getOwlProperties(stores, ancestorIri)
        .filter(p => !seenPaths.has(p.propertyIri));

      // Track seen to avoid duplicates from higher ancestors
      for (const p of ancestorShacl) seenPaths.add(p.path);
      for (const p of ancestorOwl) seenPaths.add(p.propertyIri);

      if (ancestorShacl.length > 0 || ancestorOwl.length > 0) {
        groups.push({ ancestorIri, shaclProps: ancestorShacl, owlProps: ancestorOwl });
      }
    }
    return groups;
  }, [stores, selectedEntityIri, entry?.type, shaclProps, owlProps]);

  // Annotations
  const annotations = useMemo(() => {
    if (!selectedEntityIri) return [];
    const node = namedNode(selectedEntityIri);
    const result = [];
    for (const { iri, label } of ANNOTATION_PREDICATES) {
      const pred = namedNode(iri);
      for (const { store } of stores) {
        const quads = store.getQuads(node, pred, null, null);
        for (const q of quads) {
          result.push({ key: label, value: q.object.value });
        }
      }
    }
    return result;
  }, [stores, selectedEntityIri]);

  // For properties: find classes that use this property
  // via rdfs:domain, sh:path (SHACL), or owl:onProperty (restrictions)
  const usedByClasses = useMemo(() => {
    if (entry?.type !== 'property') return [];
    const propNode = namedNode(selectedEntityIri);
    const classIris = new Set();

    const SH_PROPERTY = namedNode(WELL_KNOWN_PREFIXES.sh + 'property');
    const SH_PATH = namedNode(WELL_KNOWN_PREFIXES.sh + 'path');
    const RDFS_DOMAIN = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'domain');
    const OWL_ON_PROPERTY = namedNode(WELL_KNOWN_PREFIXES.owl + 'onProperty');
    const RDFS_SUBCLASS_OF = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'subClassOf');

    for (const { store } of stores) {
      // rdfs:domain
      const domainQuads = store.getQuads(propNode, RDFS_DOMAIN, null, null);
      for (const q of domainQuads) {
        if (q.object.termType === 'NamedNode') classIris.add(q.object.value);
      }

      // sh:path — find blank nodes with sh:path pointing to this property,
      // then find the class that has sh:property pointing to that blank node
      const pathQuads = store.getQuads(null, SH_PATH, propNode, null);
      for (const pq of pathQuads) {
        const shPropQuads = store.getQuads(null, SH_PROPERTY, pq.subject, null);
        for (const spq of shPropQuads) {
          if (spq.subject.termType === 'NamedNode') classIris.add(spq.subject.value);
        }
      }

      // owl:onProperty — find restriction blank nodes, then the class via rdfs:subClassOf
      const onPropQuads = store.getQuads(null, OWL_ON_PROPERTY, propNode, null);
      for (const opq of onPropQuads) {
        const subClassQuads = store.getQuads(null, RDFS_SUBCLASS_OF, opq.subject, null);
        for (const scq of subClassQuads) {
          if (scq.subject.termType === 'NamedNode') classIris.add(scq.subject.value);
        }
      }
    }

    return [...classIris]
      .filter(iri => entityIndex.has(iri))
      .sort((a, b) => extractLocalName(a).localeCompare(extractLocalName(b)));
  }, [stores, selectedEntityIri, entry?.type, entityIndex]);

  // For properties: gather rdfs:range, rdfs:domain, and per-class SHACL usage
  const propertyDetails = useMemo(() => {
    if (entry?.type !== 'property') return null;
    const propNode = namedNode(selectedEntityIri);
    const RDFS_RANGE = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'range');
    const RDFS_DOMAIN = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'domain');
    const SH_PATH = namedNode(WELL_KNOWN_PREFIXES.sh + 'path');
    const SH_PROPERTY = namedNode(WELL_KNOWN_PREFIXES.sh + 'property');
    const SH_CLASS = namedNode(WELL_KNOWN_PREFIXES.sh + 'class');
    const SH_DATATYPE = namedNode(WELL_KNOWN_PREFIXES.sh + 'datatype');
    const SH_NODE_KIND = namedNode(WELL_KNOWN_PREFIXES.sh + 'nodeKind');
    const SH_MIN_COUNT = namedNode(WELL_KNOWN_PREFIXES.sh + 'minCount');
    const SH_MAX_COUNT = namedNode(WELL_KNOWN_PREFIXES.sh + 'maxCount');

    const ranges = new Set();
    const domains = new Set();
    const usages = []; // { classIri, type, cardinality }

    for (const { store } of stores) {
      for (const q of store.getQuads(propNode, RDFS_RANGE, null, null)) {
        if (q.object.termType === 'NamedNode') ranges.add(q.object.value);
      }
      for (const q of store.getQuads(propNode, RDFS_DOMAIN, null, null)) {
        if (q.object.termType === 'NamedNode') domains.add(q.object.value);
      }

      // SHACL: find property shapes that use sh:path to this property
      for (const pq of store.getQuads(null, SH_PATH, propNode, null)) {
        const shapeNode = pq.subject;
        // Find the class that owns this shape via sh:property
        for (const spq of store.getQuads(null, SH_PROPERTY, shapeNode, null)) {
          if (spq.subject.termType !== 'NamedNode') continue;
          const classIri = spq.subject.value;

          // Get type/range from the shape
          const shClassQ = store.getQuads(shapeNode, SH_CLASS, null, null);
          const shDtQ = store.getQuads(shapeNode, SH_DATATYPE, null, null);
          const shNkQ = store.getQuads(shapeNode, SH_NODE_KIND, null, null);
          const type = shClassQ.length > 0 ? shClassQ[0].object.value
            : shDtQ.length > 0 ? shDtQ[0].object.value
            : shNkQ.length > 0 ? shNkQ[0].object.value
            : null;

          const minQ = store.getQuads(shapeNode, SH_MIN_COUNT, null, null);
          const maxQ = store.getQuads(shapeNode, SH_MAX_COUNT, null, null);
          const minCount = minQ.length > 0 ? parseInt(minQ[0].object.value, 10) : null;
          const maxCount = maxQ.length > 0 ? parseInt(maxQ[0].object.value, 10) : null;

          usages.push({
            classIri,
            type: type ? compactIri(type) : '',
            typeIri: type,
            cardinality: formatCardinality(minCount, maxCount),
          });
        }
      }
    }

    return {
      ranges: [...ranges],
      domains: [...domains],
      usages: usages.sort((a, b) => extractLocalName(a.classIri).localeCompare(extractLocalName(b.classIri))),
    };
  }, [stores, selectedEntityIri, entry?.type]);

  // For classes: find properties/shapes that reference this class
  // via rdfs:range, sh:class, owl:someValuesFrom, owl:allValuesFrom
  const referencedBy = useMemo(() => {
    if (entry?.type !== 'class') return [];
    const classNode = namedNode(selectedEntityIri);
    const refs = [];
    const seen = new Set();

    const RDFS_RANGE = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'range');
    const SH_CLASS = namedNode(WELL_KNOWN_PREFIXES.sh + 'class');
    const SH_PROPERTY = namedNode(WELL_KNOWN_PREFIXES.sh + 'property');
    const SH_PATH = namedNode(WELL_KNOWN_PREFIXES.sh + 'path');
    const OWL_SOME_VALUES_FROM = namedNode(WELL_KNOWN_PREFIXES.owl + 'someValuesFrom');
    const OWL_ALL_VALUES_FROM = namedNode(WELL_KNOWN_PREFIXES.owl + 'allValuesFrom');
    const OWL_ON_PROPERTY = namedNode(WELL_KNOWN_PREFIXES.owl + 'onProperty');
    const RDFS_SUBCLASS_OF = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'subClassOf');

    for (const { store } of stores) {
      // rdfs:range — properties with this class as range
      for (const q of store.getQuads(null, RDFS_RANGE, classNode, null)) {
        if (q.subject.termType === 'NamedNode' && !seen.has(q.subject.value)) {
          seen.add(q.subject.value);
          refs.push({ iri: q.subject.value, via: 'rdfs:range' });
        }
      }

      // sh:class — find blank nodes with sh:class pointing here,
      // then trace back via sh:path to get the property, and sh:property to get the class
      for (const q of store.getQuads(null, SH_CLASS, classNode, null)) {
        const blankNode = q.subject;
        const pathQuads = store.getQuads(blankNode, SH_PATH, null, null);
        for (const pq of pathQuads) {
          if (pq.object.termType === 'NamedNode' && !seen.has(pq.object.value)) {
            seen.add(pq.object.value);
            // Find which class owns this property shape
            const ownerQuads = store.getQuads(null, SH_PROPERTY, blankNode, null);
            const ownerIri = ownerQuads.length > 0 && ownerQuads[0].subject.termType === 'NamedNode'
              ? ownerQuads[0].subject.value : null;
            refs.push({
              iri: pq.object.value,
              via: 'sh:class',
              ownerIri,
            });
          }
        }
      }

      // owl:someValuesFrom / allValuesFrom — find restriction, trace to onProperty and owning class
      for (const pred of [OWL_SOME_VALUES_FROM, OWL_ALL_VALUES_FROM]) {
        const label = pred === OWL_SOME_VALUES_FROM ? 'someValuesFrom' : 'allValuesFrom';
        for (const q of store.getQuads(null, pred, classNode, null)) {
          const restrictionBn = q.subject;
          const onPropQuads = store.getQuads(restrictionBn, OWL_ON_PROPERTY, null, null);
          for (const opq of onPropQuads) {
            if (opq.object.termType === 'NamedNode' && !seen.has(opq.object.value)) {
              seen.add(opq.object.value);
              const ownerQuads = store.getQuads(null, RDFS_SUBCLASS_OF, restrictionBn, null);
              const ownerIri = ownerQuads.length > 0 && ownerQuads[0].subject.termType === 'NamedNode'
                ? ownerQuads[0].subject.value : null;
              refs.push({
                iri: opq.object.value,
                via: label,
                ownerIri,
              });
            }
          }
        }
      }
    }

    // Reverse facet map: find classes that link to this class via restriction
    for (const [classIri, matches] of restrictionFacetMap) {
      for (const { facetIri } of matches) {
        if (facetIri === selectedEntityIri) {
          refs.push({
            iri: classIri,
            via: 'hasFacet restriction',
            ownerIri: null,
            matchType: 'restriction',
          });
        }
      }
    }

    // Reverse facet map: find classes that link to this class by naming convention
    const restrictionRefs = new Set(refs.map(r => r.iri));
    for (const [classIri, matches] of facetMap) {
      for (const { facetIri, matchType } of matches) {
        if (facetIri === selectedEntityIri && !restrictionRefs.has(classIri)) {
          refs.push({
            iri: classIri,
            via: 'name match',
            ownerIri: null,
            matchType,
          });
        }
      }
    }

    refs.sort((a, b) => extractLocalName(a.iri).localeCompare(extractLocalName(b.iri)));
    return refs;
  }, [stores, selectedEntityIri, entry?.type, facetMap, restrictionFacetMap]);

  // Facet matches
  const restrictionMatches = restrictionFacetMap.get(selectedEntityIri) || [];
  const facetMatches = facetMap.get(selectedEntityIri) || [];
  const totalFacetCount = restrictionMatches.length + facetMatches.length;

  if (!entry) {
    return (
      <div className="entity-detail">
        <div className="empty-state">Entity not found in index</div>
      </div>
    );
  }

  const source = sources.find(s => s.id === entry.sourceId);
  const abbr = BADGE_ABBREVIATIONS[entry.sourceGroup] || entry.sourceGroup?.slice(0, 3) || '?';
  const issueUrl = getIssueUrl(source, entry);
  const groupName = entry.sourceGroup || source?.group || source?.name || '';

  // Turtle serialization of the entity
  const turtleSrc = useMemo(() => {
    if (!selectedEntityIri) return '';
    const subjectNode = namedNode(selectedEntityIri);
    const usedPrefixes = new Map(); // prefix → namespace

    function turtleTerm(term) {
      if (term.termType === 'NamedNode') {
        const compact = compactIri(term.value);
        if (compact !== term.value) {
          const colon = compact.indexOf(':');
          const prefix = compact.slice(0, colon);
          // Find the namespace for this prefix
          if (WELL_KNOWN_PREFIXES[prefix]) {
            usedPrefixes.set(prefix, WELL_KNOWN_PREFIXES[prefix]);
          }
          return compact;
        }
        return `<${term.value}>`;
      }
      if (term.termType === 'Literal') {
        const escaped = term.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        if (term.language) return `"${escaped}"@${term.language}`;
        if (term.datatype && term.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string') {
          const dtCompact = compactIri(term.datatype.value);
          if (dtCompact !== term.datatype.value) {
            const colon = dtCompact.indexOf(':');
            const prefix = dtCompact.slice(0, colon);
            if (WELL_KNOWN_PREFIXES[prefix]) usedPrefixes.set(prefix, WELL_KNOWN_PREFIXES[prefix]);
          }
          // Shorthand for xsd:integer / xsd:decimal
          if (term.datatype.value === 'http://www.w3.org/2001/XMLSchema#integer'
            || term.datatype.value === 'http://www.w3.org/2001/XMLSchema#decimal') {
            return term.value;
          }
          return `"${escaped}"^^${dtCompact}`;
        }
        return `"${escaped}"`;
      }
      if (term.termType === 'BlankNode') return `_:${term.value}`;
      return `"${term.value}"`;
    }

    // Collect all quads for this subject, plus expand blank node objects one level
    const allQuads = [];
    const blankObjects = new Set();
    for (const { store } of stores) {
      for (const q of store.getQuads(subjectNode, null, null, null)) {
        allQuads.push(q);
        if (q.object.termType === 'BlankNode') blankObjects.add(q.object.value);
      }
    }

    // Collect blank node quads (SHACL shapes, restrictions, etc.)
    const bnodeQuads = new Map(); // bnodeId → [quads]
    const bnodeQueue = [...blankObjects];
    const visitedBnodes = new Set(blankObjects);
    while (bnodeQueue.length > 0) {
      const bnId = bnodeQueue.shift();
      const quads = [];
      for (const { store } of stores) {
        for (const q of store.getQuads(DataFactory.blankNode(bnId), null, null, null)) {
          quads.push(q);
          if (q.object.termType === 'BlankNode' && !visitedBnodes.has(q.object.value)) {
            visitedBnodes.add(q.object.value);
            bnodeQueue.push(q.object.value);
          }
        }
      }
      if (quads.length > 0) bnodeQuads.set(bnId, quads);
    }

    if (allQuads.length === 0) return '';

    // Group by predicate, render subject block
    const byPred = new Map();
    for (const q of allQuads) {
      const key = q.predicate.value;
      if (!byPred.has(key)) byPred.set(key, []);
      byPred.get(key).push(q);
    }

    // Track the subject's compact IRI for prefix collection
    const subjectCompact = turtleTerm(subjectNode);
    const lines = [];
    const predEntries = [...byPred.entries()];

    function renderBnode(bnId, indent) {
      const quads = bnodeQuads.get(bnId);
      if (!quads || quads.length === 0) return `_:${bnId}`;
      const parts = [];
      for (const q of quads) {
        let objStr;
        if (q.object.termType === 'BlankNode' && bnodeQuads.has(q.object.value)) {
          objStr = renderBnode(q.object.value, indent + '    ');
        } else {
          objStr = turtleTerm(q.object);
        }
        parts.push(`${indent}    ${turtleTerm(q.predicate)} ${objStr}`);
      }
      return `[\n${parts.join(' ;\n')}\n${indent}]`;
    }

    for (let i = 0; i < predEntries.length; i++) {
      const [, quads] = predEntries[i];
      const predStr = turtleTerm(quads[0].predicate);
      const sep = i === predEntries.length - 1 ? ' .' : ' ;';
      const objs = quads.map(q => {
        if (q.object.termType === 'BlankNode' && bnodeQuads.has(q.object.value)) {
          return renderBnode(q.object.value, '    ');
        }
        return turtleTerm(q.object);
      });

      if (i === 0) {
        if (objs.length === 1) {
          lines.push(`${subjectCompact} ${predStr} ${objs[0]}${sep}`);
        } else {
          lines.push(`${subjectCompact} ${predStr} ${objs[0]},`);
          for (let j = 1; j < objs.length; j++) {
            lines.push(`        ${objs[j]}${j === objs.length - 1 ? sep : ','}`);
          }
        }
      } else {
        if (objs.length === 1) {
          lines.push(`    ${predStr} ${objs[0]}${sep}`);
        } else {
          lines.push(`    ${predStr} ${objs[0]},`);
          for (let j = 1; j < objs.length; j++) {
            lines.push(`        ${objs[j]}${j === objs.length - 1 ? sep : ','}`);
          }
        }
      }
    }

    // Build prefix declarations (only used ones)
    const prefixLines = [...usedPrefixes.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([p, ns]) => `@prefix ${p}: <${ns}> .`);

    return [...prefixLines, '', ...lines].join('\n');
  }, [stores, selectedEntityIri]);

  // Expand/collapse all sections — toggle between 'open' / 'closed' / null
  const [sectionForce, setSectionForce] = useState(null);
  const expandAll = useCallback(() => setSectionForce(prev => prev === 'open' ? 'open_' : 'open'), []);
  const collapseAll = useCallback(() => setSectionForce(prev => prev === 'closed' ? 'closed_' : 'closed'), []);

  return (
    <div className="entity-detail">
      {/* Header */}
      <div className="detail-header">
        <div className="detail-local-name">
          {entry.localName}
          <span className="badge" style={{ background: entry.sourceColor, fontSize: 11 }}>{abbr}</span>
          <span className="entity-type-tag" style={{ fontSize: 11 }}>{entry.type}</span>
          {entry.isFacet && <span className="facet-match-type">Facet</span>}
          {issueUrl && (
            <a href={issueUrl} target="_blank" rel="noopener noreferrer" className="issue-btn">
              Submit Issue to {groupName}
            </a>
          )}
        </div>
        <div className="detail-compact-iri">{entry.compactIri}</div>
        <div className="detail-full-iri">
          <a href={entry.iri} target="_blank" rel="noopener noreferrer">{entry.iri}</a>
        </div>
        {(entry.label || entry.comment) && (
          <div className="detail-description">
            {entry.label && entry.label !== entry.localName && (
              <div><strong>{entry.label}</strong></div>
            )}
            {entry.comment && (
              <div><LinkifiedText text={entry.comment} entityIndex={entityIndex} selectEntity={selectEntity} /></div>
            )}
          </div>
        )}
      </div>

      {/* Expand / Collapse all */}
      <div className="detail-toolbar">
        <button className="detail-toolbar-btn" onClick={expandAll}>Expand All</button>
        <button className="detail-toolbar-btn" onClick={collapseAll}>Collapse All</button>
      </div>

      {/* === Origin === */}

      {/* Hierarchy (classes only) */}
      {entry.type === 'class' && (
        <CollapsibleSection title="Hierarchies" defaultOpen={true} forceState={sectionForce}>
          <ClassHierarchy key={selectedEntityIri} classIri={selectedEntityIri} forceState={sectionForce} />
        </CollapsibleSection>
      )}

      {/* Inheritance Diagram (classes only) */}
      {entry.type === 'class' && (
        <CollapsibleSection title="Inheritance Diagram" defaultOpen={false} forceState={sectionForce}>
          <HierarchyDiagram key={selectedEntityIri} classIri={selectedEntityIri} />
        </CollapsibleSection>
      )}

      {/* === Properties === */}

      {/* Domain & Range (properties only) */}
      {propertyDetails && (propertyDetails.domains.length > 0 || propertyDetails.ranges.length > 0) && (
        <CollapsibleSection title="Domain &amp; Range" defaultOpen={true} forceState={sectionForce}>
          <table className="property-table">
            <thead>
              <tr><th>Attribute</th><th>Value</th></tr>
            </thead>
            <tbody>
              {propertyDetails.domains.map(d => (
                <tr key={`d-${d}`}>
                  <td className="prop-name">Domain</td>
                  <td className="prop-type">
                    {entityIndex.has(d) ? (
                      <span className="clickable-iri" onClick={() => selectEntity(d)}>{compactIri(d)}</span>
                    ) : compactIri(d)}
                  </td>
                </tr>
              ))}
              {propertyDetails.ranges.map(r => (
                <tr key={`r-${r}`}>
                  <td className="prop-name">Range</td>
                  <td className="prop-type">
                    {entityIndex.has(r) ? (
                      <span className="clickable-iri" onClick={() => selectEntity(r)}>{compactIri(r)}</span>
                    ) : compactIri(r)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsibleSection>
      )}

      {/* SHACL Property Shapes (properties only) */}
      {propertyDetails?.usages.length > 0 && (
        <CollapsibleSection title="SHACL Property Shapes" count={propertyDetails.usages.length} defaultOpen={true} forceState={sectionForce}>
          <table className="property-table">
            <thead>
              <tr><th>Class</th><th>Type / Range</th><th>Cardinality</th></tr>
            </thead>
            <tbody>
              {propertyDetails.usages.map((u, i) => (
                <tr key={i}>
                  <td className="prop-name">
                    {entityIndex.has(u.classIri) ? (
                      <span className="clickable-iri" onClick={() => selectEntity(u.classIri)}>{compactIri(u.classIri)}</span>
                    ) : compactIri(u.classIri)}
                  </td>
                  <td className="prop-type">
                    {u.typeIri && entityIndex.has(u.typeIri) ? (
                      <span className="clickable-iri" onClick={() => selectEntity(u.typeIri)}>{u.type}</span>
                    ) : u.type || '—'}
                  </td>
                  <td className="prop-card">{u.cardinality || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsibleSection>
      )}

      {/* Used By (properties only) */}
      {usedByClasses.length > 0 && (
        <CollapsibleSection title="Used By Classes" count={usedByClasses.length} defaultOpen={true} forceState={sectionForce}>
          <div className="subclass-list-flat">
            {usedByClasses.map(iri => (
              <span
                key={iri}
                className="subclass-chip"
                onClick={() => selectEntity(iri)}
              >
                {compactIri(iri)}
              </span>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Direct Properties (SHACL) */}
      {shaclProps.length > 0 && (
        <CollapsibleSection title="SHACL Properties" count={shaclProps.length} defaultOpen={true} forceState={sectionForce}>
          <PropertyTable
            properties={shaclProps.map(p => ({
              name: p.pathCompactIri,
              nameIri: p.path,
              type: p.class
                ? compactIri(p.class)
                : p.datatype
                  ? compactIri(p.datatype)
                  : p.nodeKind
                    ? extractLocalName(p.nodeKind)
                    : '',
              typeIri: p.class || p.datatype || null,
              cardinality: formatCardinality(p.minCount, p.maxCount),
            }))}
            entityIndex={entityIndex}
            selectEntity={selectEntity}
          />
        </CollapsibleSection>
      )}

      {/* OWL Domain Properties */}
      {owlProps.length > 0 && (
        <CollapsibleSection title="OWL Properties (Domain)" count={owlProps.length} defaultOpen={true} forceState={sectionForce}>
          <PropertyTable
            properties={owlProps.map(p => ({
              name: p.compactIri,
              nameIri: p.propertyIri,
              type: p.range ? compactIri(p.range) : p.type,
              typeIri: p.range,
              cardinality: '',
            }))}
            entityIndex={entityIndex}
            selectEntity={selectEntity}
          />
        </CollapsibleSection>
      )}

      {/* Inherited Properties */}
      {inheritedGroups.length > 0 && (
        <CollapsibleSection
          title="Inherited Properties"
          count={inheritedGroups.reduce((sum, g) => sum + g.shaclProps.length + g.owlProps.length, 0)}
          defaultOpen={true}
          forceState={sectionForce}
        >
          {inheritedGroups.map(({ ancestorIri, shaclProps: aSh, owlProps: aOwl }) => (
            <div key={ancestorIri} className="inherited-group">
              <div className="inherited-group-header">
                <span className="inherited-from-label">from</span>
                <span
                  className="clickable-iri inherited-from-link"
                  onClick={() => selectEntity(ancestorIri)}
                >
                  {extractLocalName(ancestorIri)}
                </span>
              </div>
              <PropertyTable
                properties={[
                  ...aSh.map(p => ({
                    name: p.pathCompactIri,
                    nameIri: p.path,
                    type: p.class
                      ? compactIri(p.class)
                      : p.datatype
                        ? compactIri(p.datatype)
                        : p.nodeKind
                          ? extractLocalName(p.nodeKind)
                          : '',
                    typeIri: p.class || p.datatype || null,
                    cardinality: formatCardinality(p.minCount, p.maxCount),
                  })),
                  ...aOwl.map(p => ({
                    name: p.compactIri,
                    nameIri: p.propertyIri,
                    type: p.range ? compactIri(p.range) : p.type,
                    typeIri: p.range,
                    cardinality: '',
                  })),
                ]}
                entityIndex={entityIndex}
                selectEntity={selectEntity}
              />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* Facet Properties */}
      {entry.type === 'class' && !entry.isFacet && totalFacetCount > 0 && (
        <CollapsibleSection
          title="Facet Properties"
          count={totalFacetCount > 0 ? totalFacetCount + ' facets' : null}
          defaultOpen={true}
          forceState={sectionForce}
        >
          <FacetProperties classIri={selectedEntityIri} />
        </CollapsibleSection>
      )}

      {/* OWL Restrictions */}
      {restrictions.length > 0 && (
        <CollapsibleSection title="OWL Restrictions" count={restrictions.length} defaultOpen={true} forceState={sectionForce}>
          <table className="property-table">
            <thead>
              <tr>
                <th>On Property</th>
                <th>Constraint</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {restrictions.map((r, i) => {
                let constraint = '';
                let value = '';
                if (r.someValuesFrom) { constraint = 'someValuesFrom'; value = compactIri(r.someValuesFrom); }
                else if (r.allValuesFrom) { constraint = 'allValuesFrom'; value = compactIri(r.allValuesFrom); }
                else if (r.qualifiedCardinality != null) { constraint = 'qualifiedCardinality'; value = String(r.qualifiedCardinality) + (r.onClass ? ' on ' + compactIri(r.onClass) : ''); }
                else if (r.cardinality != null) { constraint = 'cardinality'; value = String(r.cardinality); }
                else if (r.minCardinality != null) { constraint = 'minCardinality'; value = String(r.minCardinality); }
                else if (r.maxCardinality != null) { constraint = 'maxCardinality'; value = String(r.maxCardinality); }

                return (
                  <tr key={i}>
                    <td className="prop-name">
                      {entityIndex.has(r.onProperty) ? (
                        <span className="clickable-iri" onClick={() => selectEntity(r.onProperty)}>
                          {r.onPropertyCompactIri}
                        </span>
                      ) : (
                        r.onPropertyCompactIri
                      )}
                    </td>
                    <td className="prop-type">{constraint}</td>
                    <td className="prop-type">
                      {(() => {
                        const clickableIri = r.someValuesFrom || r.allValuesFrom || r.onClass;
                        if (clickableIri && entityIndex.has(clickableIri)) {
                          return (
                            <span className="clickable-iri" onClick={() => selectEntity(clickableIri)}>
                              {value}
                            </span>
                          );
                        }
                        return value;
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CollapsibleSection>
      )}

      {/* === References === */}

      {/* Referenced By (classes only) */}
      {referencedBy.length > 0 && (
        <CollapsibleSection title="Referenced By" count={referencedBy.length} defaultOpen={true} forceState={sectionForce}>
          <table className="property-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Via</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {referencedBy.map((ref, i) => (
                <tr key={i}>
                  <td className="prop-name">
                    {entityIndex.has(ref.iri) ? (
                      <span className="clickable-iri" onClick={() => selectEntity(ref.iri)}>
                        {compactIri(ref.iri)}
                      </span>
                    ) : (
                      compactIri(ref.iri)
                    )}
                  </td>
                  <td className="prop-type">{ref.via}</td>
                  <td className="prop-type">
                    {ref.ownerIri && entityIndex.has(ref.ownerIri) ? (
                      <span className="clickable-iri" onClick={() => selectEntity(ref.ownerIri)}>
                        {compactIri(ref.ownerIri)}
                      </span>
                    ) : ref.ownerIri ? (
                      compactIri(ref.ownerIri)
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CollapsibleSection>
      )}

      {/* === Metadata === */}

      {/* Annotations */}
      {annotations.length > 0 && (
        <CollapsibleSection title="Annotations" count={annotations.length} defaultOpen={true} forceState={sectionForce}>
          <div className="annotation-list">
            {annotations.map((a, i) => (
              <div key={i} className="annotation-item">
                <div className="annotation-key">{a.key}</div>
                <div className="annotation-value">
                  <LinkifiedText text={a.value} entityIndex={entityIndex} selectEntity={selectEntity} />
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Implementation (Turtle source) */}
      {turtleSrc && (
        <CollapsibleSection title="Implementation" defaultOpen={false} forceState={sectionForce}>
          <HighlightedTurtle source={turtleSrc} />
        </CollapsibleSection>
      )}
    </div>
  );
}

/** Simple Turtle syntax highlighter. */
function HighlightedTurtle({ source }) {
  // Tokenize each line, wrapping recognized patterns in spans
  const tokenRegex = /(@prefix\b|@base\b)|(<[^>]*>)|("(?:[^"\\]|\\.)*"(?:@[\w-]+|\^\^[\w:.-]+)?)|(\b\d+(?:\.\d+)?\b)|([\w-]+:[\w.-]*)|([;.,\[\]])|(\ba\b)/g;

  const lines = source.split('\n');
  const elements = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const parts = [];
    let lastIndex = 0;
    let match;
    tokenRegex.lastIndex = 0;

    while ((match = tokenRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.slice(lastIndex, match.index));
      }
      const [text, directive, uri, literal, number, prefixed, punct, keyword] = match;
      if (directive) parts.push(<span key={match.index} className="ttl-directive">{text}</span>);
      else if (uri) parts.push(<span key={match.index} className="ttl-uri">{text}</span>);
      else if (literal) parts.push(<span key={match.index} className="ttl-literal">{text}</span>);
      else if (number) parts.push(<span key={match.index} className="ttl-number">{text}</span>);
      else if (prefixed) parts.push(<span key={match.index} className="ttl-prefixed">{text}</span>);
      else if (punct) parts.push(<span key={match.index} className="ttl-punct">{text}</span>);
      else if (keyword) parts.push(<span key={match.index} className="ttl-keyword">{text}</span>);
      else parts.push(text);
      lastIndex = match.index + text.length;
    }

    if (lastIndex < line.length) parts.push(line.slice(lastIndex));
    if (li > 0) elements.push('\n');
    elements.push(...parts);
  }

  return <pre className="turtle-source">{elements}</pre>;
}

function formatCardinality(min, max) {
  if (min == null && max == null) return '';
  const lo = min ?? 0;
  const hi = max == null ? '*' : max;
  return `${lo}..${hi}`;
}
