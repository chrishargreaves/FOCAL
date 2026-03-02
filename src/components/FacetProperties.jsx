import { useMemo } from 'react';
import { useOntologyStore, getFilteredStores } from '../store/ontologyStore.js';
import { extractShaclProperties, getOwlProperties } from '../utils/facetResolver.js';
import { compactIri, extractLocalName } from '../utils/prefixes.js';
import PropertyTable from './PropertyTable.jsx';

export default function FacetProperties({ classIri }) {
  const facetMap = useOntologyStore(s => s.facetMap);
  const entityIndex = useOntologyStore(s => s.entityIndex);
  const selectEntity = useOntologyStore(s => s.selectEntity);
  const ontologyState = useOntologyStore(s => s.ontologyState);
  const sources = useOntologyStore(s => s.sources);
  const viewGroups = useOntologyStore(s => s.viewGroups);

  const stores = useMemo(
    () => getFilteredStores(ontologyState, sources, viewGroups),
    [ontologyState, sources, viewGroups]
  );

  const facetMatches = facetMap.get(classIri) || [];

  if (facetMatches.length === 0) {
    return <div className="empty-state">No facet associations found</div>;
  }

  return (
    <div>
      {facetMatches.map(({ facetIri, matchType }) => (
        <FacetGroup
          key={facetIri}
          facetIri={facetIri}
          matchType={matchType}
          stores={stores}
          entityIndex={entityIndex}
          selectEntity={selectEntity}
        />
      ))}
    </div>
  );
}

function FacetGroup({ facetIri, matchType, stores, entityIndex, selectEntity }) {
  const shaclProps = useMemo(
    () => extractShaclProperties(stores, facetIri),
    [stores, facetIri]
  );

  const owlProps = useMemo(
    () => getOwlProperties(stores, facetIri),
    [stores, facetIri]
  );

  const localName = extractLocalName(facetIri);
  const isClickable = entityIndex.has(facetIri);

  return (
    <div className="facet-group">
      <div className="facet-group-header">
        <span
          className={isClickable ? 'clickable-iri' : ''}
          style={{ fontWeight: 600, fontSize: 13 }}
          onClick={() => isClickable && selectEntity(facetIri)}
        >
          {localName}
        </span>
        <span className="facet-match-type">{matchType === 'exact'
          ? 'exact (ClassName + "Facet")'
          : matchType === 'prefix'
            ? 'prefix (starts with ClassName)'
            : matchType}</span>
      </div>
      {shaclProps.length > 0 && (
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
      )}
      {owlProps.length > 0 && (
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
      )}
      {shaclProps.length === 0 && owlProps.length === 0 && (
        <div className="empty-state" style={{ textAlign: 'left' }}>No properties defined on this facet</div>
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
