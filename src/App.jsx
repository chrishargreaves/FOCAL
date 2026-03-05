import { useEffect, useState, useMemo } from 'react';
import { useOntologyStore, parseHashGroups } from './store/ontologyStore.js';
import Omnibox from './components/Omnibox.jsx';
import EntityList from './components/EntityList.jsx';
import EntityDetail from './components/EntityDetail.jsx';
import OntologyManager from './components/OntologyManager.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

export default function App() {
  const loadAllOntologies = useOntologyStore(s => s.loadAllOntologies);
  const showOntologyManager = useOntologyStore(s => s.showOntologyManager);
  const toggleOntologyManager = useOntologyStore(s => s.toggleOntologyManager);
  const ontologyState = useOntologyStore(s => s.ontologyState);
  const sources = useOntologyStore(s => s.sources);
  const toggleGroup = useOntologyStore(s => s.toggleGroup);
  const toolbarGroups = useOntologyStore(s => s.toolbarGroups);
  const selectedEntityIri = useOntologyStore(s => s.selectedEntityIri);
  const selectEntity = useOntologyStore(s => s.selectEntity);
  const selectEntityFromHash = useOntologyStore(s => s.selectEntityFromHash);
  const goBack = useOntologyStore(s => s.goBack);
  const goForward = useOntologyStore(s => s.goForward);
  const navHistory = useOntologyStore(s => s.navHistory);
  const navForward = useOntologyStore(s => s.navForward);
  const entityIndex = useOntologyStore(s => s.entityIndex);

  useEffect(() => {
    loadAllOntologies();
  }, [loadAllOntologies]);

  // Derive loading state: all enabled sources are either ready or errored
  const enabledSources = sources.filter(s => s.enabled);
  const allLoaded = enabledSources.length > 0 && enabledSources.every(s => {
    const state = ontologyState.get(s.id);
    return state?.status === 'ready' || state?.status === 'error';
  });

  // Track initial load — splash screen only shows once, on first visit
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  useEffect(() => {
    if (allLoaded && !initialLoadDone) setInitialLoadDone(true);
  }, [allLoaded]);
  const showSplash = !initialLoadDone;

  // Loading progress
  const loadingProgress = useMemo(() => {
    const total = enabledSources.length;
    const done = enabledSources.filter(s => {
      const state = ontologyState.get(s.id);
      return state?.status === 'ready' || state?.status === 'error';
    }).length;
    return { done, total };
  }, [enabledSources, ontologyState]);

  // Deep linking: resolve entity from hash once loaded, and on hashchange
  useEffect(() => {
    if (!allLoaded) return;

    function resolveHash(applyGroups) {
      const rawHash = window.location.hash.slice(1);
      if (!rawHash) return;
      const { entity, groups } = parseHashGroups(rawHash);

      // On hashchange (e.g. user pastes new URL), apply groups
      if (applyGroups && groups) {
        const store = useOntologyStore.getState();
        store.setViewGroups(groups);
      }

      if (!entity) return;
      const decoded = decodeURIComponent(entity);
      const asCompact = decoded.includes('/') && !decoded.includes('://')
        ? decoded.replace('/', ':')
        : decoded;

      // Try exact IRI match
      if (entityIndex.has(decoded)) {
        selectEntityFromHash(decoded);
        return;
      }

      // Try compact IRI match (supports both prefix:Name and prefix/Name)
      for (const [iri, entry] of entityIndex) {
        if (entry.compactIri === asCompact || entry.compactIri === decoded || entry.localName === decoded) {
          selectEntityFromHash(iri);
          return;
        }
      }
    }

    resolveHash(false);
    function onHashChange() { resolveHash(true); }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [allLoaded, entityIndex, selectEntity]);

  // Group ALL sources by project (not just enabled)
  const allGroups = new Map();
  for (const src of sources) {
    const g = src.group || src.name;
    if (!allGroups.has(g)) allGroups.set(g, { color: src.color, sources: [] });
    allGroups.get(g).sources.push(src);
  }

  // Determine which groups show in toolbar (default: all)
  const visibleGroups = toolbarGroups || new Set(allGroups.keys());

  const statusDots = [...allGroups.entries()]
    .filter(([group]) => visibleGroups.has(group))
    .map(([group, { color, sources: grpSources }]) => {
      const anyEnabled = grpSources.some(s => s.enabled);
      const enabledInGroup = grpSources.filter(s => s.enabled);
      const states = enabledInGroup.map(s => ontologyState.get(s.id));
      const totalQuads = states.reduce((sum, s) => sum + (s?.quadCount || 0), 0);
      const anyLoading = states.some(s => s?.status === 'loading');
      const anyError = states.some(s => s?.status === 'error');
      const allReady = enabledInGroup.length > 0 && states.every(s => s?.status === 'ready');
      const readyCount = states.filter(s => s?.status === 'ready').length;

      const status = !anyEnabled ? 'off' : anyLoading ? 'loading' : anyError && !allReady ? 'error' : allReady ? 'ready' : 'idle';
      const tooltip = !anyEnabled
        ? `${group}: disabled \u2014 click to enable`
        : `${group}: ${readyCount}/${enabledInGroup.length} loaded (${totalQuads} triples)\nClick to disable`;

      return (
        <button
          key={group}
          className={`status-dot status-${status}`}
          style={{ '--ont-color': color }}
          title={tooltip}
          onClick={() => toggleGroup(group)}
        >
          <span className="status-label">{group}</span>
          {anyLoading && <span className="status-progress">{readyCount}/{enabledInGroup.length}</span>}
        </button>
      );
    });

  const [bannerDismissed, setBannerDismissed] = useState(
    () => sessionStorage.getItem('focal-banner-dismissed') === '1'
  );
  const dismissBanner = () => {
    setBannerDismissed(true);
    sessionStorage.setItem('focal-banner-dismissed', '1');
  };

  // Loading screen — only on initial page load
  if (showSplash) {
    return (
      <div className="app">
        <div className="loading-screen">
          <img src="logo.png" alt="FOCAL logo" className="loading-logo" />
          <h1 className="loading-title">FOCAL</h1>
          <p className="loading-subtitle">Forensic Ontologies Catalogued and Linked</p>
          <div className="loading-bar-track">
            <div
              className="loading-bar-fill"
              style={{ width: `${loadingProgress.total ? (loadingProgress.done / loadingProgress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="loading-status">
            Loading ontologies... {loadingProgress.done}/{loadingProgress.total}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {!bannerDismissed && (
        <div className="ai-banner">
          <span>
            This application was AI-generated and may contain errors — use at your own risk.
            {' '}<a href="https://github.com/chrishargreaves/FOCAL" target="_blank" rel="noopener noreferrer">Source code</a>
          </span>
          <button className="ai-banner-close" onClick={dismissBanner} aria-label="Dismiss">&times;</button>
        </div>
      )}
      <header className="app-header">
        <div className="app-title-block">
          <img src="logo.png" alt="FOCAL logo" className="app-logo" />
          <div className="app-title-text">
            <h1 className="app-title">FOCAL</h1>
            <span className="app-subtitle">Forensic Ontologies<br />Catalogued and Linked</span>
          </div>
        </div>
        <Omnibox />
        <div className="ontology-status-bar"><span className="status-bar-label">Loaded:</span>{statusDots}</div>
        <button
          className="manage-btn"
          onClick={toggleOntologyManager}
          title="Manage ontologies"
        >
          {showOntologyManager ? 'Close' : 'Manage'}
        </button>
        <ThemeToggle />
      </header>
      {showOntologyManager && <OntologyManager />}
      <div className="app-body">
        <EntityList />
        <div className="detail-pane">
          {(navHistory.length > 0 || navForward.length > 0) && (
            <div className="nav-bar">
              <button
                className="nav-btn"
                onClick={goBack}
                disabled={navHistory.length === 0}
                title="Go back"
              >
                &#8592;
              </button>
              <button
                className="nav-btn"
                onClick={goForward}
                disabled={navForward.length === 0}
                title="Go forward"
              >
                &#8594;
              </button>
              <div className="nav-breadcrumbs">
                {navHistory.slice(-5).map((iri, i) => {
                  const entry = entityIndex.get(iri);
                  return (
                    <span key={iri + i} className="nav-crumb" onClick={() => selectEntity(iri)}>
                      {entry?.localName || iri.split(/[#/]/).pop()}
                    </span>
                  );
                })}
                {selectedEntityIri && (
                  <span className="nav-crumb nav-crumb-current">
                    {entityIndex.get(selectedEntityIri)?.localName || selectedEntityIri.split(/[#/]/).pop()}
                  </span>
                )}
              </div>
            </div>
          )}
          {selectedEntityIri ? (
            <EntityDetail />
          ) : (
            <div className="detail-placeholder">
              <p>Select an entity from the list to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
