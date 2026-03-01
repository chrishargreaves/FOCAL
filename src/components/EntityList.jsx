import { useMemo, useRef, useEffect, useState, memo } from 'react';
import { useOntologyStore } from '../store/ontologyStore.js';
import { searchEntities } from '../utils/search.js';
import { BADGE_ABBREVIATIONS, ONTOLOGY_CATEGORIES } from '../store/config.js';

const TYPE_COLORS = {
  class: '#3b82f6',
  property: '#8b5cf6',
  individual: '#f59e0b',
};

const TYPE_FILTERS = [
  { value: null, label: 'All' },
  { value: 'class', label: 'Classes', color: TYPE_COLORS.class },
  { value: 'property', label: 'Properties', color: TYPE_COLORS.property },
  { value: 'individual', label: 'Individuals', color: TYPE_COLORS.individual },
];

const SORT_KEYS = [
  { key: 'name', label: 'Name', title: 'Name' },
  { key: 'desc', label: 'Desc', title: 'Has description' },
  { key: 'total', label: 'Tot', title: 'Total properties' },
  { key: 'direct', label: 'Dir', title: 'Direct properties' },
  { key: 'facet', label: 'Fct', title: 'Facet properties' },
  { key: 'sub', label: 'Sub', title: 'Subclasses' },
];

function getSortValue(entry, key) {
  const s = entry.stats;
  switch (key) {
    case 'name': return entry.localName.toLowerCase();
    case 'desc': return s ? (s.hasComment ? 1 : 0) : -1;
    case 'total': return s ? s.totalPropCount : -1;
    case 'direct': return s ? s.directPropCount : -1;
    case 'facet': return s ? s.facetPropCount : -1;
    case 'sub': return s ? s.subClassCount : -1;
    default: return 0;
  }
}

const TYPE_PILL = {
  class: { letter: 'C', color: TYPE_COLORS.class },
  property: { letter: 'P', color: TYPE_COLORS.property },
  individual: { letter: 'I', color: TYPE_COLORS.individual },
};

const EntityTableRow = memo(function EntityTableRow({ entry, isSelected, isHighlighted, onClick, rowRef }) {
  const abbr = BADGE_ABBREVIATIONS[entry.sourceGroup] || entry.sourceGroup?.slice(0, 3) || '?';
  const s = entry.stats;
  const tp = TYPE_PILL[entry.type] || { letter: '?', color: '#888' };

  const statCell = (value) => {
    if (s == null) return <td className="stat-na">—</td>;
    const classes = ['stat-cell'];
    if (value === 0) classes.push('stat-zero');
    return <td className={classes.join(' ')}>{value}</td>;
  };

  // For "direct" column, highlight 0 as warning if class has no direct+facet props
  const directCell = () => {
    if (s == null) return <td className="stat-na">—</td>;
    const classes = ['stat-cell'];
    if (s.directPropCount === 0 && s.facetPropCount === 0) {
      classes.push('stat-warning');
    } else if (s.directPropCount === 0) {
      classes.push('stat-zero');
    }
    return <td className={classes.join(' ')}>{s.directPropCount}</td>;
  };

  return (
    <tr
      ref={rowRef}
      className={`${isSelected ? 'selected' : ''}${isHighlighted ? ' highlighted' : ''}`}
      onClick={onClick}
      role="option"
      aria-selected={isSelected}
    >
      <td className="col-badge">
        <span className="badge" style={{ background: entry.sourceColor }}>{abbr}</span>
      </td>
      <td className="col-type">
        <span className="type-pill" style={{ background: tp.color }}>{tp.letter}</span>
      </td>
      <td className="col-name">
        <span className="entity-name" title={entry.iri}>{entry.compactIri}</span>
      </td>
      <td className="desc-indicator">
        {s == null
          ? <span className="desc-no">—</span>
          : s.hasComment
            ? <span className="desc-yes">✓</span>
            : <span className="desc-no">✗</span>
        }
      </td>
      {statCell(s?.totalPropCount)}
      {directCell()}
      {statCell(s?.facetPropCount)}
      {statCell(s?.subClassCount)}
    </tr>
  );
});

export default function EntityList() {
  const searchQuery = useOntologyStore(s => s.searchQuery);
  const entityIndex = useOntologyStore(s => s.entityIndex);
  const selectedEntityIri = useOntologyStore(s => s.selectedEntityIri);
  const highlightedIndex = useOntologyStore(s => s.highlightedIndex);
  const selectEntity = useOntologyStore(s => s.selectEntity);
  const sources = useOntologyStore(s => s.sources);
  const typeFilter = useOntologyStore(s => s.typeFilter);
  const setTypeFilter = useOntologyStore(s => s.setTypeFilter);
  const ontologyState = useOntologyStore(s => s.ontologyState);
  const viewGroups = useOntologyStore(s => s.viewGroups);
  const setViewGroups = useOntologyStore(s => s.setViewGroups);

  const highlightedRef = useRef(null);

  // Sort state
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc'); // numbers default desc (highest first)
    }
  };

  // Derive available groups from enabled sources, grouped by category
  const groupInfo = useMemo(() => {
    const map = new Map();
    for (const src of sources) {
      if (!src.enabled) continue;
      const g = src.group || src.name;
      if (!map.has(g)) map.set(g, { color: src.color, ids: [], category: src.category || 'custom' });
      map.get(g).ids.push(src.id);
    }
    return map;
  }, [sources]);

  const groupsByCategory = useMemo(() => {
    const cats = new Map();
    for (const [group, info] of groupInfo) {
      const cat = info.category;
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat).push([group, info]);
    }
    return cats;
  }, [groupInfo]);

  // Initialize viewGroups in store when groupInfo changes (e.g. sources load)
  const activeGroups = viewGroups || new Set(groupInfo.keys());
  useEffect(() => {
    if (!viewGroups) {
      setViewGroups(new Set(groupInfo.keys()));
    }
  }, [groupInfo]);

  const toggleGroup = (group) => {
    const next = new Set(activeGroups);
    if (next.has(group)) {
      // Don't allow deselecting all — keep at least one
      if (next.size > 1) next.delete(group);
    } else {
      next.add(group);
    }
    setViewGroups(next);
  };

  const enabledSourceIds = useMemo(() => {
    const ids = new Set();
    for (const [group, info] of groupInfo) {
      if (activeGroups.has(group)) {
        for (const id of info.ids) ids.add(id);
      }
    }
    return ids;
  }, [groupInfo, activeGroups]);

  const results = useMemo(
    () => searchEntities(entityIndex, searchQuery, enabledSourceIds, typeFilter),
    [entityIndex, searchQuery, enabledSourceIds, typeFilter]
  );

  // Apply sorting (skip when search query is active — search relevance takes priority)
  const sortedResults = useMemo(() => {
    if (searchQuery.trim()) return results;

    const sorted = [...results];
    sorted.sort((a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      let cmp;
      if (typeof va === 'string') {
        cmp = va.localeCompare(vb);
      } else {
        cmp = va - vb;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [results, sortKey, sortDir, searchQuery]);

  // Auto-scroll highlighted into view
  useEffect(() => {
    highlightedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  // Check if any ontology is still loading
  const anyLoading = [...ontologyState.values()].some(s => s.status === 'loading');

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="entity-list" role="listbox" aria-label="Entity list">
      {[...groupsByCategory.entries()].map(([cat, groups]) => (
        <div key={cat} className="group-filter-bar">
          <span className="group-filter-label">{ONTOLOGY_CATEGORIES[cat]?.label || cat}</span>
          {groups.map(([group, { color }]) => {
            const active = activeGroups.has(group);
            const abbr = BADGE_ABBREVIATIONS[group] || group.slice(0, 3);
            return (
              <button
                key={group}
                className={`group-filter-btn ${active ? 'active' : ''}`}
                style={{ '--group-color': color }}
                onClick={() => toggleGroup(group)}
                title={active ? `Hide ${group}` : `Show ${group}`}
              >
                {abbr}
              </button>
            );
          })}
        </div>
      ))}
      <div className="type-filter-bar">
        {TYPE_FILTERS.map(({ value, label, color }) => (
          <button
            key={label}
            className={`type-filter-btn ${typeFilter === value ? 'active' : ''}`}
            style={color ? { '--type-color': color } : undefined}
            onClick={() => setTypeFilter(value)}
          >
            {label}
          </button>
        ))}
        <span className="entity-count">{sortedResults.length} entities</span>
      </div>
      <div className="entity-list-scroll">
        {anyLoading && sortedResults.length === 0 && (
          <div className="loading-overlay">
            <span className="loading-spinner" />
            <span>Loading ontologies...</span>
          </div>
        )}
        {sortedResults.length > 0 && (
          <table className="entity-table">
            <thead>
              <tr>
                <th className="col-badge">Src</th>
                <th className="col-type">Type</th>
                <th
                  className={`col-name${!isSearching && sortKey === 'name' ? ' sorted' : ''}`}
                  onClick={() => handleSort('name')}
                  title="Name"
                >
                  Name{!isSearching && sortKey === 'name' && <span className="sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
                {SORT_KEYS.filter(k => k.key !== 'name').map(({ key, label, title }) => (
                  <th
                    key={key}
                    className={`${key === 'desc' ? 'col-desc' : 'col-stat'}${!isSearching && sortKey === key ? ' sorted' : ''}`}
                    onClick={() => handleSort(key)}
                    title={title}
                  >
                    {label}{!isSearching && sortKey === key && <span className="sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((entry, i) => (
                <EntityTableRow
                  key={entry.iri}
                  entry={entry}
                  isSelected={entry.iri === selectedEntityIri}
                  isHighlighted={i === highlightedIndex}
                  onClick={() => selectEntity(entry.iri)}
                  rowRef={i === highlightedIndex ? highlightedRef : null}
                />
              ))}
            </tbody>
          </table>
        )}
        {!anyLoading && sortedResults.length === 0 && (
          <div className="empty-state">
            {entityIndex.size === 0 ? 'No ontologies loaded' : 'No matching entities'}
          </div>
        )}
      </div>
    </div>
  );
}
