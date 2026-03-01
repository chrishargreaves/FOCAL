import { useMemo, useState, createContext, useContext } from 'react';
import { DataFactory } from 'n3';
import { useOntologyStore, getFilteredStores } from '../store/ontologyStore.js';
import { extractLocalName, WELL_KNOWN_PREFIXES } from '../utils/prefixes.js';
import { BADGE_ABBREVIATIONS } from '../store/config.js';

/** Context for expand/collapse all signal from the parent detail pane. */
const TreeForceContext = createContext(null);

/** Hook: local expanded state that also responds to the global force signal. */
function useExpandable(defaultExpanded) {
  const forceState = useContext(TreeForceContext);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [lastForce, setLastForce] = useState(forceState);

  if (forceState !== lastForce) {
    setLastForce(forceState);
    if (forceState?.startsWith('open')) setExpanded(true);
    else if (forceState?.startsWith('closed')) setExpanded(false);
  }

  return [expanded, setExpanded];
}

function EntityBadge({ iri, entityIndex }) {
  const entry = entityIndex.get(iri);
  if (!entry) return null;
  const abbr = BADGE_ABBREVIATIONS[entry.sourceGroup] || entry.sourceGroup?.slice(0, 3) || '?';
  return <span className="badge badge-sm" style={{ background: entry.sourceColor }}>{abbr}</span>;
}

const { namedNode } = DataFactory;
const RDFS_SUBCLASS_OF = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'subClassOf');

/** Get direct subclasses of a given IRI across all stores. */
function getDirectSubclasses(stores, classIri) {
  const classNode = namedNode(classIri);
  const subs = new Set();
  for (const { store } of stores) {
    for (const quad of store.getQuads(null, RDFS_SUBCLASS_OF, classNode, null)) {
      if (quad.subject.termType === 'NamedNode') {
        subs.add(quad.subject.value);
      }
    }
  }
  return [...subs].sort((a, b) => extractLocalName(a).localeCompare(extractLocalName(b)));
}

/** Get all direct superclasses of a given IRI. */
function getDirectParents(stores, classIri) {
  const classNode = namedNode(classIri);
  const parents = new Set();
  for (const { store } of stores) {
    for (const quad of store.getQuads(classNode, RDFS_SUBCLASS_OF, null, null)) {
      if (quad.object.termType === 'NamedNode') {
        parents.add(quad.object.value);
      }
    }
  }
  return [...parents].sort((a, b) => extractLocalName(a).localeCompare(extractLocalName(b)));
}

/** Walk up rdfs:subClassOf following one path, returns [root, ..., iri]. */
function getAncestorChainFrom(stores, iri) {
  const chain = [iri];
  const visited = new Set([iri]);
  let current = iri;

  while (true) {
    const currentNode = namedNode(current);
    let parent = null;
    for (const { store } of stores) {
      for (const quad of store.getQuads(currentNode, RDFS_SUBCLASS_OF, null, null)) {
        if (quad.object.termType === 'NamedNode' && !visited.has(quad.object.value)) {
          parent = quad.object.value;
          break;
        }
      }
      if (parent) break;
    }
    if (!parent) break;
    visited.add(parent);
    chain.push(parent);
    current = parent;
  }

  return chain.reverse();
}

/** Check if a node has any NamedNode subclasses. */
function hasSubclasses(stores, iri) {
  const classNode = namedNode(iri);
  for (const { store } of stores) {
    for (const quad of store.getQuads(null, RDFS_SUBCLASS_OF, classNode, null)) {
      if (quad.subject.termType === 'NamedNode') return true;
    }
  }
  return false;
}

/**
 * Renders a single ancestor chain [root, ..., leaf] as nested collapsible tree nodes.
 * The selectedContent (selected class + subtree) is rendered as a child of the leaf node.
 */
function AncestorChainNode({ chain, index, entityIndex, selectEntity, defaultExpanded, selectedContent }) {
  const [expanded, setExpanded] = useExpandable(defaultExpanded);
  const iri = chain[index];
  const isLeaf = index === chain.length - 1;
  const isInIndex = entityIndex.has(iri);

  return (
    <div className="tree-node">
      <div className="tree-node-row">
        <button
          className="tree-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <span className={`tree-arrow ${expanded ? 'open' : ''}`}>&#9654;</span>
        </button>
        <EntityBadge iri={iri} entityIndex={entityIndex} />
        <span
          className={isInIndex ? 'clickable-iri tree-label' : 'tree-label tree-label-muted'}
          onClick={() => isInIndex && selectEntity(iri)}
        >
          {extractLocalName(iri)}
        </span>
      </div>
      {expanded && (
        <div className="tree-children">
          {isLeaf ? selectedContent : (
            <AncestorChainNode
              chain={chain}
              index={index + 1}
              entityIndex={entityIndex}
              selectEntity={selectEntity}
              defaultExpanded={defaultExpanded}
              selectedContent={selectedContent}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Expandable tree node for exploring subclasses below the selected class.
 */
function SubtreeNode({ iri, stores, entityIndex, selectEntity, defaultExpanded }) {
  const [expanded, setExpanded] = useExpandable(defaultExpanded);
  const children = useMemo(
    () => expanded ? getDirectSubclasses(stores, iri) : [],
    [expanded, stores, iri]
  );
  const hasSubs = useMemo(() => hasSubclasses(stores, iri), [stores, iri]);
  const isInIndex = entityIndex.has(iri);

  return (
    <div className="tree-node">
      <div className="tree-node-row">
        {hasSubs ? (
          <button
            className="tree-toggle"
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <span className={`tree-arrow ${expanded ? 'open' : ''}`}>&#9654;</span>
          </button>
        ) : (
          <span className="tree-leaf-spacer" />
        )}
        <EntityBadge iri={iri} entityIndex={entityIndex} />
        <span
          className={isInIndex ? 'clickable-iri tree-label' : 'tree-label'}
          onClick={() => isInIndex && selectEntity(iri)}
        >
          {extractLocalName(iri)}
        </span>
      </div>
      {expanded && children.length > 0 && (
        <div className="tree-children">
          {children.map(childIri => (
            <SubtreeNode
              key={childIri}
              iri={childIri}
              stores={stores}
              entityIndex={entityIndex}
              selectEntity={selectEntity}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A full hierarchy view for one parent lineage: ancestor chain + selected class + children.
 */
function SelectedClassNode({ classIri, stores, entityIndex, selectEntity }) {
  const directChildren = useMemo(() => getDirectSubclasses(stores, classIri), [stores, classIri]);

  return (
    <div className="tree-node">
      <div className="tree-node-row tree-node-selected">
        {directChildren.length > 0 ? (
          <span className="tree-leaf-spacer" />
        ) : (
          <span className="tree-leaf-spacer" />
        )}
        <EntityBadge iri={classIri} entityIndex={entityIndex} />
        <span className="tree-label tree-label-selected">
          {extractLocalName(classIri)}
        </span>
        {directChildren.length > 0 && (
          <span className="hierarchy-child-count">{directChildren.length} subclasses</span>
        )}
      </div>

      {directChildren.length > 0 && (
        <div className="tree-children">
          {directChildren.map(childIri => (
            <SubtreeNode
              key={childIri}
              iri={childIri}
              stores={stores}
              entityIndex={entityIndex}
              selectEntity={selectEntity}
              defaultExpanded={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HierarchyPane({ classIri, parentIri, stores, entityIndex, selectEntity }) {
  const chain = useMemo(
    () => parentIri ? getAncestorChainFrom(stores, parentIri) : [],
    [stores, parentIri]
  );

  const selectedNode = (
    <SelectedClassNode
      classIri={classIri}
      stores={stores}
      entityIndex={entityIndex}
      selectEntity={selectEntity}
    />
  );

  // No ancestors — just show selected class + children
  if (chain.length === 0) {
    return <div className="hierarchy-context">{selectedNode}</div>;
  }

  return (
    <div className="hierarchy-context">
      <AncestorChainNode
        chain={chain}
        index={0}
        entityIndex={entityIndex}
        selectEntity={selectEntity}
        defaultExpanded={true}
        selectedContent={selectedNode}
      />
    </div>
  );
}

/**
 * Collapsible sub-section for one hierarchy path (used in multi-parent view).
 */
function HierarchySection({ index, parentIri, classIri, stores, entityIndex, selectEntity, defaultOpen }) {
  const [open, setOpen] = useExpandable(defaultOpen);
  const parentName = extractLocalName(parentIri);

  return (
    <div className="hierarchy-section">
      <button className="hierarchy-section-header" onClick={() => setOpen(!open)}>
        <span className={`tree-arrow ${open ? 'open' : ''}`}>&#9654;</span>
        <span className="hierarchy-section-title">
          Hierarchy {index + 1}
        </span>
        <span className="hierarchy-section-via">
          via <EntityBadge iri={parentIri} entityIndex={entityIndex} />
          <span className="tree-label">{parentName}</span>
        </span>
      </button>
      {open && (
        <HierarchyPane
          classIri={classIri}
          parentIri={parentIri}
          stores={stores}
          entityIndex={entityIndex}
          selectEntity={selectEntity}
        />
      )}
    </div>
  );
}

export default function ClassHierarchy({ classIri, forceState }) {
  const ontologyState = useOntologyStore(s => s.ontologyState);
  const sources = useOntologyStore(s => s.sources);
  const selectEntity = useOntologyStore(s => s.selectEntity);
  const entityIndex = useOntologyStore(s => s.entityIndex);
  const viewGroups = useOntologyStore(s => s.viewGroups);

  const stores = useMemo(
    () => getFilteredStores(ontologyState, sources, viewGroups),
    [ontologyState, sources, viewGroups]
  );

  const directParents = useMemo(() => getDirectParents(stores, classIri), [stores, classIri]);
  const directChildren = useMemo(() => getDirectSubclasses(stores, classIri), [stores, classIri]);

  if (directParents.length === 0 && directChildren.length === 0) return null;

  // Multiple parents — one full hierarchy section per parent
  if (directParents.length > 1) {
    return (
      <TreeForceContext.Provider value={forceState}>
        <div>
          {directParents.map((parentIri, i) => (
            <HierarchySection
              key={parentIri}
              index={i}
              parentIri={parentIri}
              classIri={classIri}
              stores={stores}
              entityIndex={entityIndex}
              selectEntity={selectEntity}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      </TreeForceContext.Provider>
    );
  }

  // Single parent or no parents (just children)
  return (
    <TreeForceContext.Provider value={forceState}>
      <HierarchyPane
        classIri={classIri}
        parentIri={directParents[0] || null}
        stores={stores}
        entityIndex={entityIndex}
        selectEntity={selectEntity}
      />
    </TreeForceContext.Provider>
  );
}
