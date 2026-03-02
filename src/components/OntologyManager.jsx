import { useState } from 'react';
import { useOntologyStore } from '../store/ontologyStore.js';
import { ONTOLOGY_CATEGORIES } from '../store/config.js';

function OntologyItem({ src, state, toggleSource, loadOntology, removeCustomOntology }) {
  const status = state?.status || 'idle';
  return (
    <div className="ont-item">
      <span className="ont-color-dot" style={{ background: src.color }} />
      <span className="ont-name">{src.name}</span>
      {status === 'loading' && <span className="loading-spinner" style={{ width: 14, height: 14 }} />}
      {status === 'ready' && (
        <span className="ont-info">{state.quadCount} triples</span>
      )}
      {status === 'error' && (
        <span className="ont-error" title={state.error}>Error</span>
      )}
      {status === 'error' && (
        <button
          className="ont-remove-btn"
          onClick={() => loadOntology(src.id)}
          title="Retry"
          style={{ color: 'var(--color-warning)' }}
        >
          &#8635;
        </button>
      )}
      <input
        type="checkbox"
        className="ont-toggle"
        checked={src.enabled}
        onChange={() => toggleSource(src.id)}
      />
      {src.isCustom && (
        <button
          className="ont-remove-btn"
          onClick={() => removeCustomOntology(src.id)}
          title="Remove"
        >
          &times;
        </button>
      )}
    </div>
  );
}

/**
 * Derive logical sub-modules from ontology IRIs within a group.
 * Files whose ontology IRI shares a parent path are grouped together.
 * E.g. .../observable, .../observable/search, .../observable/sqlite → "Observable"
 */
function deriveSubModules(groupSources, ontologyIriCache) {
  // Collect ontology IRIs from the persistent cache
  const iriMap = new Map(); // sourceId → ontologyIri
  for (const src of groupSources) {
    const iri = ontologyIriCache.get(src.id);
    if (iri) iriMap.set(src.id, iri);
  }

  if (iriMap.size === 0) return null; // never loaded, can't group

  // Find all unique ontology IRIs and sort shortest first
  const allIris = [...new Set(iriMap.values())].sort((a, b) => a.length - b.length);

  // Build parent map: for each IRI, find if another IRI is its prefix (parent module)
  const parentOf = new Map(); // childIri → parentIri
  for (const iri of allIris) {
    for (const candidate of allIris) {
      if (candidate !== iri && (iri.startsWith(candidate + '/') || iri.startsWith(candidate + '#'))) {
        parentOf.set(iri, candidate);
        break; // first (shortest) match is the closest parent
      }
    }
  }

  // Resolve each IRI to its root module IRI
  const rootOf = (iri) => {
    let current = iri;
    while (parentOf.has(current)) current = parentOf.get(current);
    return current;
  };

  // Group sources by their root module IRI.
  // Sources without a detected IRI each become their own module (using source name).
  const modules = new Map(); // key → [sources]
  for (const src of groupSources) {
    const iri = iriMap.get(src.id);
    const root = iri ? rootOf(iri) : `__src__${src.id}`;
    if (!modules.has(root)) modules.set(root, []);
    modules.get(root).push(src);
  }

  // Don't sub-group if everything is in a single module
  if (modules.size <= 1) return null;

  // Derive display names from the root IRI (last path segment, titlecased)
  const result = [];
  for (const [rootIri, sources] of modules) {
    let label;
    if (rootIri.startsWith('__src__')) {
      // Use a short name from the source, stripping the group prefix
      const src = sources[0];
      const groupPrefix = (src.group || '') + ' ';
      label = src.name.startsWith(groupPrefix) ? src.name.slice(groupPrefix.length) : src.name;
    } else {
      const path = rootIri.replace(/\/+$/, '');
      const lastSegment = path.split('/').pop() || rootIri;
      label = lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1).replace(/-/g, ' ');
    }
    result.push({ label, sources });
  }

  return result;
}

function OntologyGroup({ groupName, groupSources, ontologyState, ontologyIriCache, toggleSource, loadOntology, removeCustomOntology, toggleToolbarGroup, showInToolbar }) {
  const [expanded, setExpanded] = useState(false);
  const isSingleModule = groupSources.length === 1;

  const allEnabled = groupSources.every(s => s.enabled);
  const someEnabled = groupSources.some(s => s.enabled);

  const totalQuads = groupSources.reduce((sum, src) => {
    const state = ontologyState.get(src.id);
    return sum + (state?.quadCount || 0);
  }, 0);
  const readyCount = groupSources.filter(src => ontologyState.get(src.id)?.status === 'ready').length;
  const anyLoading = groupSources.some(src => ontologyState.get(src.id)?.status === 'loading');
  const anyError = groupSources.some(src => ontologyState.get(src.id)?.status === 'error');

  const handleGroupToggle = () => {
    const target = !allEnabled;
    for (const src of groupSources) {
      if (src.enabled !== target) toggleSource(src.id);
    }
  };

  const subModules = deriveSubModules(groupSources, ontologyIriCache);

  // For single-module groups, just show a single row with toolbar toggle
  if (isSingleModule) {
    const src = groupSources[0];
    const state = ontologyState.get(src.id);
    return (
      <div className="ont-item">
        <span className="ont-color-dot" style={{ background: src.color }} />
        <span className="ont-name">{groupName}</span>
        {state?.status === 'loading' && <span className="loading-spinner" style={{ width: 14, height: 14 }} />}
        {state?.status === 'ready' && (
          <span className="ont-info">{state.quadCount} triples</span>
        )}
        {state?.status === 'error' && (
          <span className="ont-error" title={state.error}>Error</span>
        )}
        <button
          className={`ont-toolbar-toggle ${showInToolbar ? 'active' : ''}`}
          onClick={() => toggleToolbarGroup(groupName)}
          title={showInToolbar ? 'Hide from toolbar' : 'Show in toolbar'}
        >
          &#9733;
        </button>
        <input
          type="checkbox"
          className="ont-toggle"
          checked={src.enabled}
          onChange={() => toggleSource(src.id)}
        />
        {src.isCustom && (
          <button
            className="ont-remove-btn"
            onClick={() => removeCustomOntology(src.id)}
            title="Remove"
          >
            &times;
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="ont-group">
      <div className="ont-group-header">
        <button className="ont-group-expand" onClick={() => setExpanded(!expanded)}>
          <span className={`tree-arrow ${expanded ? 'open' : ''}`}>&#9654;</span>
        </button>
        <span className="ont-color-dot" style={{ background: groupSources[0].color }} />
        <span className="ont-group-name">{groupName}</span>
        <span className="ont-info">
          {subModules
            ? `${subModules.length} modules \u00B7 ${groupSources.length} files`
            : `${groupSources.length} modules`}
          {totalQuads > 0 && ` \u00B7 ${totalQuads} triples`}
          {anyLoading && ` \u00B7 loading ${readyCount}/${groupSources.length}`}
        </span>
        {anyError && <span className="ont-error">errors</span>}
        <button
          className={`ont-toolbar-toggle ${showInToolbar ? 'active' : ''}`}
          onClick={() => toggleToolbarGroup(groupName)}
          title={showInToolbar ? 'Hide from toolbar' : 'Show in toolbar'}
        >
          &#9733;
        </button>
        <input
          type="checkbox"
          className="ont-toggle"
          checked={allEnabled}
          ref={el => { if (el) el.indeterminate = someEnabled && !allEnabled; }}
          onChange={handleGroupToggle}
          title={allEnabled ? `Disable all ${groupName}` : `Enable all ${groupName}`}
        />
      </div>
      {expanded && (
        <div className="ont-list ont-group-children">
          {subModules ? (
            subModules.map(({ label, sources }) => (
              <SubModuleGroup
                key={label}
                label={label}
                sources={sources}
                color={groupSources[0].color}
                ontologyState={ontologyState}
                toggleSource={toggleSource}
                loadOntology={loadOntology}
                removeCustomOntology={removeCustomOntology}
              />
            ))
          ) : (
            groupSources.map(src => (
              <OntologyItem
                key={src.id}
                src={src}
                state={ontologyState.get(src.id)}
                toggleSource={toggleSource}
                loadOntology={loadOntology}
                removeCustomOntology={removeCustomOntology}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SubModuleGroup({ label, sources, color, ontologyState, toggleSource, loadOntology, removeCustomOntology }) {
  const [expanded, setExpanded] = useState(false);
  const isMulti = sources.length > 1;

  const allEnabled = sources.every(s => s.enabled);
  const someEnabled = sources.some(s => s.enabled);
  const totalQuads = sources.reduce((sum, src) => sum + (ontologyState.get(src.id)?.quadCount || 0), 0);
  const anyLoading = sources.some(src => ontologyState.get(src.id)?.status === 'loading');

  const handleToggle = () => {
    const target = !allEnabled;
    for (const src of sources) {
      if (src.enabled !== target) toggleSource(src.id);
    }
  };

  return (
    <div className="ont-group">
      <div className="ont-group-header" style={{ paddingLeft: 8 }}>
        {isMulti ? (
          <button className="ont-group-expand" onClick={() => setExpanded(!expanded)}>
            <span className={`tree-arrow ${expanded ? 'open' : ''}`}>&#9654;</span>
          </button>
        ) : (
          <span style={{ width: 18, flexShrink: 0 }} />
        )}
        <span className="ont-color-dot" style={{ background: color }} />
        <span className="ont-name">{label}</span>
        <span className="ont-info">
          {isMulti && `${sources.length} files \u00B7 `}
          {totalQuads > 0 ? `${totalQuads} triples` : ''}
          {anyLoading && 'loading\u2026'}
        </span>
        <input
          type="checkbox"
          className="ont-toggle"
          checked={allEnabled}
          ref={isMulti ? (el => { if (el) el.indeterminate = someEnabled && !allEnabled; }) : undefined}
          onChange={handleToggle}
        />
      </div>
      {isMulti && expanded && (
        <div className="ont-list ont-group-children">
          {sources.map(src => (
            <OntologyItem
              key={src.id}
              src={src}
              state={ontologyState.get(src.id)}
              toggleSource={toggleSource}
              loadOntology={loadOntology}
              removeCustomOntology={removeCustomOntology}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategorySection({ categoryKey, sources, ontologyState, ontologyIriCache, toggleSource, loadOntology, removeCustomOntology, toggleToolbarGroup, toolbarGroups }) {
  const cat = ONTOLOGY_CATEGORIES[categoryKey];
  if (!cat || sources.length === 0) return null;

  // Group sources by their top-level group
  const groups = new Map();
  for (const src of sources) {
    const g = src.group || src.name;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(src);
  }

  // Derive default toolbar groups if not yet persisted
  const allGroupNames = new Set(groups.keys());
  const visibleGroups = toolbarGroups || allGroupNames;

  return (
    <div className="ont-category">
      <div className="ont-category-header">
        <h3>{cat.label}</h3>
        <span className="ont-category-desc">{cat.description}</span>
      </div>
      {[...groups.entries()].map(([groupName, groupSources]) => (
        <OntologyGroup
          key={groupName}
          groupName={groupName}
          groupSources={groupSources}
          ontologyState={ontologyState}
          ontologyIriCache={ontologyIriCache}
          toggleSource={toggleSource}
          loadOntology={loadOntology}
          removeCustomOntology={removeCustomOntology}
          toggleToolbarGroup={toggleToolbarGroup}
          showInToolbar={visibleGroups.has(groupName)}
        />
      ))}
    </div>
  );
}

export default function OntologyManager() {
  const sources = useOntologyStore(s => s.sources);
  const ontologyState = useOntologyStore(s => s.ontologyState);
  const ontologyIriCache = useOntologyStore(s => s.ontologyIriCache);
  const toggleSource = useOntologyStore(s => s.toggleSource);
  const addCustomOntology = useOntologyStore(s => s.addCustomOntology);
  const removeCustomOntology = useOntologyStore(s => s.removeCustomOntology);
  const loadOntology = useOntologyStore(s => s.loadOntology);
  const forceRefreshAll = useOntologyStore(s => s.forceRefreshAll);
  const toggleToolbarGroup = useOntologyStore(s => s.toggleToolbarGroup);
  const toolbarGroups = useOntologyStore(s => s.toolbarGroups);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState('#9b59b6');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await forceRefreshAll();
    setRefreshing(false);
  };

  const handleAdd = (e) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    addCustomOntology(name.trim(), url.trim(), color);
    setName('');
    setUrl('');
  };

  const officialSources = sources.filter(s => s.category === 'official');
  const communitySources = sources.filter(s => s.category === 'community');
  const customSources = sources.filter(s => s.isCustom);

  const anyLoading = [...ontologyState.values()].some(s => s.status === 'loading');

  return (
    <div className="ontology-manager">
      <div className="ont-refresh-bar">
        <button
          className="ont-refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing || anyLoading}
          title="Force refresh all ontologies (bypass cache)"
        >
          <span className={refreshing ? 'ont-refresh-icon spinning' : 'ont-refresh-icon'}>&#8635;</span>
          {refreshing ? 'Refreshing\u2026' : 'Refresh All'}
        </button>
      </div>
      <CategorySection
        categoryKey="official"
        sources={officialSources}
        ontologyState={ontologyState}
        ontologyIriCache={ontologyIriCache}
        toggleSource={toggleSource}
        loadOntology={loadOntology}
        removeCustomOntology={removeCustomOntology}
        toggleToolbarGroup={toggleToolbarGroup}
        toolbarGroups={toolbarGroups}
      />
      <CategorySection
        categoryKey="community"
        sources={communitySources}
        ontologyState={ontologyState}
        ontologyIriCache={ontologyIriCache}
        toggleSource={toggleSource}
        loadOntology={loadOntology}
        removeCustomOntology={removeCustomOntology}
        toggleToolbarGroup={toggleToolbarGroup}
        toolbarGroups={toolbarGroups}
      />
      {customSources.length > 0 && (
        <CategorySection
          categoryKey="custom"
          sources={customSources}
          ontologyState={ontologyState}
          toggleSource={toggleSource}
          loadOntology={loadOntology}
          removeCustomOntology={removeCustomOntology}
          toggleToolbarGroup={toggleToolbarGroup}
          toolbarGroups={toolbarGroups}
        />
      )}

      <div className="ont-category">
        <h3>Add Custom Ontology</h3>
        <form className="add-custom-form" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{ width: 120 }}
          />
          <input
            type="url"
            placeholder="TTL URL"
            value={url}
            onChange={e => setUrl(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
          />
          <button type="submit" className="add-custom-btn">Add</button>
        </form>
      </div>
    </div>
  );
}
