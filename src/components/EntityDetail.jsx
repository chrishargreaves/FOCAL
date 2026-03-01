import { useMemo, useState, useCallback } from 'react';
import { DataFactory } from 'n3';
import { useOntologyStore, getFilteredStores } from '../store/ontologyStore.js';
import { extractShaclProperties, getOwlProperties, getOwlRestrictions, getClassHierarchy } from '../utils/facetResolver.js';
import { compactIri, extractLocalName, WELL_KNOWN_PREFIXES } from '../utils/prefixes.js';
import { BADGE_ABBREVIATIONS } from '../store/config.js';
import ClassHierarchy from './ClassHierarchy.jsx';
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

    // Reverse facet map: find classes that link to this class by naming convention
    for (const [classIri, matches] of facetMap) {
      for (const { facetIri, matchType } of matches) {
        if (facetIri === selectedEntityIri) {
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
  }, [stores, selectedEntityIri, entry?.type, facetMap]);

  // Facet matches
  const facetMatches = facetMap.get(selectedEntityIri) || [];

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

      {/* Hierarchy (classes only) */}
      {entry.type === 'class' && (
        <CollapsibleSection title="Hierarchy" defaultOpen={true} forceState={sectionForce}>
          <ClassHierarchy classIri={selectedEntityIri} forceState={sectionForce} />
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
      {entry.type === 'class' && !entry.isFacet && (
        <CollapsibleSection
          title="Facet Properties"
          count={facetMatches.length > 0 ? facetMatches.length + ' facets' : null}
          defaultOpen={facetMatches.length > 0}
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
                      {(r.someValuesFrom || r.allValuesFrom) && entityIndex.has(r.someValuesFrom || r.allValuesFrom) ? (
                        <span className="clickable-iri" onClick={() => selectEntity(r.someValuesFrom || r.allValuesFrom)}>
                          {value}
                        </span>
                      ) : (
                        value
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CollapsibleSection>
      )}

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
    </div>
  );
}

function formatCardinality(min, max) {
  if (min == null && max == null) return '';
  const lo = min ?? 0;
  const hi = max == null ? '*' : max;
  return `${lo}..${hi}`;
}
