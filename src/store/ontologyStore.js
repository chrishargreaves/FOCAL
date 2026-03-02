import { create } from 'zustand';
import { DataFactory } from 'n3';
import { DEFAULT_ONTOLOGIES } from './config.js';
import { fetchAndParse } from '../utils/rdfParser.js';
import { compactIri, extractLocalName, WELL_KNOWN_PREFIXES } from '../utils/prefixes.js';
import { findFacetClasses, buildFacetMap, extractShaclProperties, getOwlProperties, getClassHierarchy } from '../utils/facetResolver.js';

const { namedNode } = DataFactory;

const RDF_TYPE = namedNode(WELL_KNOWN_PREFIXES.rdf + 'type');
const OWL_ONTOLOGY = namedNode(WELL_KNOWN_PREFIXES.owl + 'Ontology');
const RDFS_LABEL = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'label');
const RDFS_COMMENT = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'comment');
const OWL_CLASS = WELL_KNOWN_PREFIXES.owl + 'Class';
const RDFS_CLASS = WELL_KNOWN_PREFIXES.rdfs + 'Class';
const OWL_OBJECT_PROPERTY = WELL_KNOWN_PREFIXES.owl + 'ObjectProperty';
const OWL_DATATYPE_PROPERTY = WELL_KNOWN_PREFIXES.owl + 'DatatypeProperty';
const OWL_ANNOTATION_PROPERTY = WELL_KNOWN_PREFIXES.owl + 'AnnotationProperty';
const OWL_NAMED_INDIVIDUAL = WELL_KNOWN_PREFIXES.owl + 'NamedIndividual';

const STORAGE_CUSTOM_SOURCES = 'focal-custom-sources';
const STORAGE_THEME = 'focal-theme';
const STORAGE_TOOLBAR_GROUPS = 'focal-toolbar-groups';

function loadCustomSources() {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_SOURCES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomSources(sources) {
  try {
    const custom = sources.filter(s => s.isCustom);
    localStorage.setItem(STORAGE_CUSTOM_SOURCES, JSON.stringify(custom));
  } catch {
    // ignore
  }
}

function loadTheme() {
  try {
    return localStorage.getItem(STORAGE_THEME) || 'dark';
  } catch {
    return 'dark';
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_THEME, theme);
  } catch {
    // ignore
  }
}

function loadToolbarGroups() {
  try {
    const raw = localStorage.getItem(STORAGE_TOOLBAR_GROUPS);
    return raw ? new Set(JSON.parse(raw)) : null; // null = use defaults
  } catch {
    return null;
  }
}

function saveToolbarGroups(groups) {
  try {
    localStorage.setItem(STORAGE_TOOLBAR_GROUPS, JSON.stringify([...groups]));
  } catch {
    // ignore
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function updateHash(iri) {
  if (iri) {
    const compact = compactIri(iri);
    const hashValue = compact.includes(':') ? compact.replace(':', '/') : compact;
    history.replaceState(null, '', `#${hashValue}`);
  } else {
    history.replaceState(null, '', window.location.pathname);
  }
}

// Initialize theme immediately
const initialTheme = loadTheme();
applyTheme(initialTheme);

/**
 * Get stores filtered by viewGroups. Pass null for all stores.
 */
export function getFilteredStores(ontologyState, sources, viewGroups) {
  const stores = [];
  for (const source of sources) {
    if (!source.enabled) continue;
    const group = source.group || source.name;
    if (viewGroups && !viewGroups.has(group)) continue;
    const state = ontologyState.get(source.id);
    if (state?.status === 'ready' && state.store) {
      stores.push({ store: state.store });
    }
  }
  return stores;
}

export const useOntologyStore = create((set, get) => ({
  sources: [...DEFAULT_ONTOLOGIES, ...loadCustomSources()],
  ontologyState: new Map(),
  ontologyIriCache: new Map(), // sourceId → ontologyIri, persists across disable/enable
  entityIndex: new Map(),
  facetClasses: new Set(),
  facetMap: new Map(),
  searchQuery: '',
  selectedEntityIri: null,
  navHistory: [],      // stack of previously visited IRIs
  navForward: [],      // forward stack for redo
  highlightedIndex: 0,
  typeFilter: null,
  viewGroups: null, // null = show all groups; Set of group names when filtering
  theme: initialTheme,
  showOntologyManager: false,
  toolbarGroups: loadToolbarGroups(), // null = derive from sources on first load

  toggleOntologyManager: () => set(s => ({ showOntologyManager: !s.showOntologyManager })),

  setSearchQuery: (query) => set({ searchQuery: query, highlightedIndex: 0 }),

  setHighlightedIndex: (index) => set({ highlightedIndex: index }),

  setTypeFilter: (filter) => set({ typeFilter: filter, highlightedIndex: 0 }),

  setViewGroups: (groups) => {
    set({ viewGroups: groups });
    get().rebuildEntityStats();
  },

  selectEntity: (iri) => {
    const { selectedEntityIri, navHistory } = get();
    // Push current to history if navigating to a different entity
    const newHistory = selectedEntityIri && selectedEntityIri !== iri
      ? [...navHistory, selectedEntityIri].slice(-50)  // keep last 50
      : navHistory;
    set({ selectedEntityIri: iri, navHistory: newHistory, navForward: [] });
    updateHash(iri);
  },

  // Called from hash resolution — doesn't push to history
  selectEntityFromHash: (iri) => {
    set({ selectedEntityIri: iri });
  },

  goBack: () => {
    const { navHistory, selectedEntityIri, navForward } = get();
    if (navHistory.length === 0) return;
    const prev = navHistory[navHistory.length - 1];
    const newHistory = navHistory.slice(0, -1);
    const newForward = selectedEntityIri
      ? [selectedEntityIri, ...navForward].slice(0, 50)
      : navForward;
    set({ selectedEntityIri: prev, navHistory: newHistory, navForward: newForward });
    updateHash(prev);
  },

  goForward: () => {
    const { navForward, selectedEntityIri, navHistory } = get();
    if (navForward.length === 0) return;
    const next = navForward[0];
    const newForward = navForward.slice(1);
    const newHistory = selectedEntityIri
      ? [...navHistory, selectedEntityIri].slice(-50)
      : navHistory;
    set({ selectedEntityIri: next, navHistory: newHistory, navForward: newForward });
    updateHash(next);
  },

  toggleTheme: () => {
    const newTheme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
    saveTheme(newTheme);
    set({ theme: newTheme });
  },

  loadOntology: async (id, { skipCache = false } = {}) => {
    const { sources, ontologyState } = get();
    const source = sources.find(s => s.id === id);
    if (!source) return;

    // Set loading state
    const newState = new Map(ontologyState);
    newState.set(id, { status: 'loading', error: null, store: null, quadCount: 0, prefixes: {} });
    set({ ontologyState: newState });

    try {
      const result = await fetchAndParse(source.url, { skipCache });
      // Extract owl:Ontology IRI from the loaded store
      const ontQuads = result.store.getQuads(null, RDF_TYPE, OWL_ONTOLOGY, null);
      const ontologyIri = ontQuads.length > 0 && ontQuads[0].subject.termType === 'NamedNode'
        ? ontQuads[0].subject.value : null;
      const state = new Map(get().ontologyState);
      state.set(id, {
        status: 'ready',
        error: null,
        store: result.store,
        quadCount: result.quadCount,
        prefixes: result.prefixes,
        ontologyIri,
      });
      // Cache the ontology IRI persistently
      if (ontologyIri) {
        const iriCache = new Map(get().ontologyIriCache);
        iriCache.set(id, ontologyIri);
        set({ ontologyState: state, ontologyIriCache: iriCache });
      } else {
        set({ ontologyState: state });
      }

      // Rebuild indexes after each ontology loads
      get().rebuildEntityIndex();
      get().rebuildFacetMap();
      get().rebuildEntityStats();
    } catch (err) {
      const state = new Map(get().ontologyState);
      state.set(id, {
        status: 'error',
        error: err.message || String(err),
        store: null,
        quadCount: 0,
        prefixes: {},
      });
      set({ ontologyState: state });
    }
  },

  loadAllOntologies: async () => {
    const { sources, loadOntology } = get();
    const enabled = sources.filter(s => s.enabled);
    await Promise.allSettled(enabled.map(s => loadOntology(s.id)));
  },

  forceRefreshAll: async () => {
    const { sources, loadOntology } = get();
    const enabled = sources.filter(s => s.enabled);
    await Promise.allSettled(enabled.map(s => loadOntology(s.id, { skipCache: true })));
  },

  rebuildEntityIndex: () => {
    const { ontologyState, sources } = get();
    const entityIndex = new Map();

    for (const source of sources) {
      const state = ontologyState.get(source.id);
      if (!state || state.status !== 'ready' || !state.store) continue;

      const store = state.store;

      // Find all typed entities
      const typeQuads = store.getQuads(null, RDF_TYPE, null, null);
      for (const quad of typeQuads) {
        if (quad.subject.termType !== 'NamedNode') continue;

        const iri = quad.subject.value;
        const typeIri = quad.object.value;

        let entryType = null;
        if (typeIri === OWL_CLASS || typeIri === RDFS_CLASS) {
          entryType = 'class';
        } else if (typeIri === OWL_OBJECT_PROPERTY || typeIri === OWL_DATATYPE_PROPERTY || typeIri === OWL_ANNOTATION_PROPERTY) {
          entryType = 'property';
        } else if (typeIri === OWL_NAMED_INDIVIDUAL) {
          entryType = 'individual';
        }

        if (!entryType) continue;

        // Don't overwrite if already indexed (first source wins, or class > property)
        if (entityIndex.has(iri)) {
          const existing = entityIndex.get(iri);
          if (existing.type === 'class' || (existing.type === entryType)) continue;
        }

        const localName = extractLocalName(iri);
        const compact = compactIri(iri);

        // Get label and comment
        const labelQuads = store.getQuads(namedNode(iri), RDFS_LABEL, null, null);
        const label = labelQuads.length > 0 ? labelQuads[0].object.value : null;

        const commentQuads = store.getQuads(namedNode(iri), RDFS_COMMENT, null, null);
        const comment = commentQuads.length > 0 ? commentQuads[0].object.value : null;

        entityIndex.set(iri, {
          iri,
          localName,
          compactIri: compact,
          type: entryType,
          sourceId: source.id,
          sourceColor: source.color,
          sourceGroup: source.group || source.name,
          label,
          comment,
          isFacet: false, // updated by rebuildFacetMap
        });
      }
    }

    set({ entityIndex });
  },

  rebuildFacetMap: () => {
    const { ontologyState, entityIndex } = get();

    // Collect all ready stores
    const storeEntries = [];
    for (const [id, state] of ontologyState) {
      if (state.status === 'ready' && state.store) {
        storeEntries.push({ store: state.store, id });
      }
    }

    if (storeEntries.length === 0) return;

    const facetClasses = findFacetClasses(storeEntries);
    const facetMap = buildFacetMap(facetClasses, entityIndex);

    // Mark facet entities
    const updatedIndex = new Map(entityIndex);
    for (const [iri, entry] of updatedIndex) {
      if (facetClasses.has(iri)) {
        updatedIndex.set(iri, { ...entry, isFacet: true });
      }
    }

    set({ facetClasses, facetMap, entityIndex: updatedIndex });
  },

  rebuildEntityStats: () => {
    const { ontologyState, sources, entityIndex, facetMap, viewGroups } = get();

    // Use filtered stores based on viewGroups
    const stores = getFilteredStores(ontologyState, sources, viewGroups);
    if (stores.length === 0) return;

    // Caches to avoid re-querying common superclasses
    const shaclCache = new Map();   // classIri → property count
    const owlCache = new Map();     // classIri → property count
    const hierarchyCache = new Map(); // classIri → { superClasses, subClasses }

    const getShaclCount = (iri) => {
      if (shaclCache.has(iri)) return shaclCache.get(iri);
      const count = extractShaclProperties(stores, iri).length;
      shaclCache.set(iri, count);
      return count;
    };

    const getOwlCount = (iri) => {
      if (owlCache.has(iri)) return owlCache.get(iri);
      const count = getOwlProperties(stores, iri).length;
      owlCache.set(iri, count);
      return count;
    };

    const getHierarchy = (iri) => {
      if (hierarchyCache.has(iri)) return hierarchyCache.get(iri);
      const h = getClassHierarchy(stores, iri);
      hierarchyCache.set(iri, h);
      return h;
    };

    // Collect SHACL property paths per class (for dedup with inherited)
    const shaclPathsCache = new Map();
    const getShaclPaths = (iri) => {
      if (shaclPathsCache.has(iri)) return shaclPathsCache.get(iri);
      const props = extractShaclProperties(stores, iri);
      const paths = new Set(props.map(p => p.path));
      shaclPathsCache.set(iri, paths);
      return paths;
    };

    const getOwlPropIris = new Map();
    const getOwlIris = (iri) => {
      if (getOwlPropIris.has(iri)) return getOwlPropIris.get(iri);
      const props = getOwlProperties(stores, iri);
      const iris = new Set(props.map(p => p.propertyIri));
      getOwlPropIris.set(iri, iris);
      return iris;
    };

    const RDFS_COMMENT_IRI = WELL_KNOWN_PREFIXES.rdfs + 'comment';
    const commentPred = namedNode(RDFS_COMMENT_IRI);

    const updatedIndex = new Map(entityIndex);

    for (const [iri, entry] of updatedIndex) {
      if (entry.type !== 'class') {
        updatedIndex.set(iri, { ...entry, stats: null });
        continue;
      }

      const directPropCount = getShaclCount(iri) + getOwlCount(iri);
      const hierarchy = getHierarchy(iri);
      const subClassCount = hierarchy.subClasses.length;

      // Inherited props: collect from all superclasses, dedup by path/iri
      const inheritedPaths = new Set();
      const directShaclPaths = getShaclPaths(iri);
      const directOwlIris = getOwlIris(iri);
      for (const superIri of hierarchy.superClasses) {
        for (const path of getShaclPaths(superIri)) {
          if (!directShaclPaths.has(path)) inheritedPaths.add(path);
        }
        for (const propIri of getOwlIris(superIri)) {
          if (!directOwlIris.has(propIri)) inheritedPaths.add(propIri);
        }
      }
      const inheritedPropCount = inheritedPaths.size;

      // Facet props: count properties from matched facets
      const facetMatches = facetMap.get(iri) || [];
      const facetCount = facetMatches.length;
      let facetPropCount = 0;
      const facetPropPaths = new Set();
      for (const { facetIri } of facetMatches) {
        for (const path of getShaclPaths(facetIri)) {
          facetPropPaths.add(path);
        }
        for (const propIri of getOwlIris(facetIri)) {
          facetPropPaths.add(propIri);
        }
      }
      facetPropCount = facetPropPaths.size;

      const totalPropCount = directPropCount + inheritedPropCount + facetPropCount;

      // hasComment: check any store for rdfs:comment
      let hasComment = !!entry.comment;
      if (!hasComment) {
        const node = namedNode(iri);
        for (const { store } of stores) {
          if (store.getQuads(node, commentPred, null, null).length > 0) {
            hasComment = true;
            break;
          }
        }
      }

      updatedIndex.set(iri, {
        ...entry,
        stats: {
          directPropCount,
          inheritedPropCount,
          facetPropCount,
          totalPropCount,
          subClassCount,
          facetCount,
          hasComment,
        },
      });
    }

    set({ entityIndex: updatedIndex });
  },

  toggleGroup: (groupName) => {
    const { sources, viewGroups } = get();
    const groupSources = sources.filter(s => (s.group || s.name) === groupName);
    if (groupSources.length === 0) return;
    const allEnabled = groupSources.every(s => s.enabled);
    const target = !allEnabled;
    for (const src of groupSources) {
      if (src.enabled !== target) get().toggleSource(src.id);
    }
    // Sync viewGroups with the toggle so the sidebar reflects the change
    if (viewGroups) {
      const next = new Set(viewGroups);
      if (target) {
        next.add(groupName);
      } else {
        next.delete(groupName);
      }
      get().setViewGroups(next);
    }
  },

  toggleToolbarGroup: (groupName) => {
    const { sources } = get();
    // Derive current toolbar groups
    let current = get().toolbarGroups;
    if (!current) {
      // Default: all groups that have at least one source
      const allGroups = new Set(sources.map(s => s.group || s.name));
      current = allGroups;
    }
    const next = new Set(current);
    if (next.has(groupName)) {
      next.delete(groupName);
    } else {
      next.add(groupName);
    }
    saveToolbarGroups(next);
    set({ toolbarGroups: next });
  },

  toggleSource: (id) => {
    const sources = get().sources.map(s =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    set({ sources });
    saveCustomSources(sources);

    const source = sources.find(s => s.id === id);
    if (source?.enabled) {
      get().loadOntology(id);
    } else {
      // Clear state for disabled source
      const newState = new Map(get().ontologyState);
      newState.delete(id);
      set({ ontologyState: newState });
      get().rebuildEntityIndex();
      get().rebuildFacetMap();
      get().rebuildEntityStats();
    }
  },

  addCustomOntology: (name, url, color) => {
    const id = 'custom-' + Date.now();
    const newSource = { id, name, url, color, enabled: true, group: 'Custom', isCustom: true, category: 'custom' };
    const sources = [...get().sources, newSource];
    set({ sources });
    saveCustomSources(sources);
    get().loadOntology(id);
  },

  removeCustomOntology: (id) => {
    const sources = get().sources.filter(s => s.id !== id);
    set({ sources });
    saveCustomSources(sources);

    const newState = new Map(get().ontologyState);
    newState.delete(id);
    set({ ontologyState: newState });
    get().rebuildEntityIndex();
    get().rebuildFacetMap();
    get().rebuildEntityStats();
  },
}));
