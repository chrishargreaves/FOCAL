import { useMemo } from 'react';
import { DataFactory } from 'n3';
import { useOntologyStore, getFilteredStores } from '../store/ontologyStore.js';
import { extractLocalName, WELL_KNOWN_PREFIXES } from '../utils/prefixes.js';
import { BADGE_ABBREVIATIONS } from '../store/config.js';

const { namedNode } = DataFactory;
const RDFS_SUBCLASS_OF = namedNode(WELL_KNOWN_PREFIXES.rdfs + 'subClassOf');
const OWL_THING = WELL_KNOWN_PREFIXES.owl + 'Thing';
const UCO_THING = WELL_KNOWN_PREFIXES.core + 'UcoThing';

const NODE_H_NO_BADGE = 22;
const NODE_H_BADGE = 34;
const NODE_RX = 4;
const BADGE_W = 32;
const BADGE_H = 12;
const BADGE_RX = 3;
const LEVEL_GAP = 28;
const H_PAD = 16;
const SVG_PAD = 12;
const CHAR_W = 5.8;

/** BFS upward from classIri collecting all ancestor nodes and edges,
 *  plus direct children of classIri. */
function buildGraph(stores, classIri) {
  const nodes = new Set([classIri]);
  const edges = []; // { child, parent }

  // BFS upward: ancestors
  const queue = [classIri];
  const visited = new Set([classIri]);
  while (queue.length > 0) {
    const current = queue.shift();
    const currentNode = namedNode(current);
    for (const { store } of stores) {
      for (const quad of store.getQuads(currentNode, RDFS_SUBCLASS_OF, null, null)) {
        if (quad.object.termType !== 'NamedNode') continue;
        const parentIri = quad.object.value;
        if (parentIri === OWL_THING) continue;
        nodes.add(parentIri);
        edges.push({ child: current, parent: parentIri });
        if (!visited.has(parentIri)) {
          visited.add(parentIri);
          queue.push(parentIri);
        }
      }
    }
  }

  // Direct children of the selected class
  const classNode = namedNode(classIri);
  for (const { store } of stores) {
    for (const quad of store.getQuads(null, RDFS_SUBCLASS_OF, classNode, null)) {
      if (quad.subject.termType === 'NamedNode') {
        const childIri = quad.subject.value;
        nodes.add(childIri);
        edges.push({ child: childIri, parent: classIri });
      }
    }
  }

  return { nodes: [...nodes], edges };
}

/** Assign longest-path levels (roots = level 0, selected class at bottom). */
function assignLevels(nodes, edges) {
  const childrenOf = new Map();
  const parentSet = new Map();
  for (const n of nodes) {
    childrenOf.set(n, []);
    parentSet.set(n, []);
  }
  for (const { child, parent } of edges) {
    childrenOf.get(parent)?.push(child);
    parentSet.get(child)?.push(parent);
  }

  const levels = new Map();
  // Roots: nodes with no parents in the subgraph
  const roots = nodes.filter(n => parentSet.get(n).length === 0);

  // BFS from roots assigning max level
  for (const r of roots) levels.set(r, 0);
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift();
    const currentLevel = levels.get(current);
    for (const child of childrenOf.get(current)) {
      const prev = levels.get(child) ?? -1;
      if (currentLevel + 1 > prev) {
        levels.set(child, currentLevel + 1);
        queue.push(child);
      }
    }
  }

  return levels;
}

/** Compute the width a node needs based on label only (badge stacks above). */
function nodeWidth(label) {
  const textW = label.length * CHAR_W;
  const pad = 14;
  return Math.max(60, textW + pad);
}

export default function HierarchyDiagram({ classIri }) {
  const ontologyState = useOntologyStore(s => s.ontologyState);
  const sources = useOntologyStore(s => s.sources);
  const selectEntity = useOntologyStore(s => s.selectEntity);
  const entityIndex = useOntologyStore(s => s.entityIndex);
  const viewGroups = useOntologyStore(s => s.viewGroups);

  const stores = useMemo(
    () => getFilteredStores(ontologyState, sources, viewGroups),
    [ontologyState, sources, viewGroups]
  );

  const layout = useMemo(() => {
    const { nodes, edges } = buildGraph(stores, classIri);
    if (nodes.length === 0) return null;

    const levels = assignLevels(nodes, edges);

    // Pre-compute labels, widths, heights
    const nodeInfo = new Map();
    for (const n of nodes) {
      const label = extractLocalName(n);
      const entry = entityIndex.get(n);
      const badge = entry ? (BADGE_ABBREVIATIONS[entry.sourceGroup] || entry.sourceGroup?.slice(0, 3) || null) : null;
      const w = nodeWidth(label);
      const h = badge ? NODE_H_BADGE : NODE_H_NO_BADGE;
      nodeInfo.set(n, { label, badge, badgeColor: entry?.sourceColor, w, h });
    }

    // Group by level
    const byLevel = new Map();
    for (const n of nodes) {
      const lvl = levels.get(n) ?? 0;
      if (!byLevel.has(lvl)) byLevel.set(lvl, []);
      byLevel.get(lvl).push(n);
    }
    for (const arr of byLevel.values()) {
      arr.sort((a, b) => extractLocalName(a).localeCompare(extractLocalName(b)));
    }

    const maxLevel = Math.max(...byLevel.keys());

    // Compute row widths and heights
    let maxRowWidth = 0;
    const rowHeights = new Map();
    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const row = byLevel.get(lvl) || [];
      const rowWidth = row.reduce((sum, n) => sum + nodeInfo.get(n).w, 0) + (row.length - 1) * H_PAD;
      if (rowWidth > maxRowWidth) maxRowWidth = rowWidth;
      rowHeights.set(lvl, Math.max(...row.map(n => nodeInfo.get(n).h)));
    }

    // Assign positions with cumulative y based on row heights
    const positions = new Map();
    let cumulativeY = 0;
    for (let lvl = 0; lvl <= maxLevel; lvl++) {
      const row = byLevel.get(lvl) || [];
      const rowH = rowHeights.get(lvl);
      const rowWidth = row.reduce((sum, n) => sum + nodeInfo.get(n).w, 0) + (row.length - 1) * H_PAD;
      let x = (maxRowWidth - rowWidth) / 2;
      for (const n of row) {
        const { w, h } = nodeInfo.get(n);
        // Vertically center within row
        positions.set(n, { x, y: cumulativeY + (rowH - h) / 2, w, h });
        x += w + H_PAD;
      }
      cumulativeY += rowH + LEVEL_GAP;
    }

    const svgWidth = maxRowWidth + SVG_PAD * 2;
    const svgHeight = cumulativeY - LEVEL_GAP + SVG_PAD * 2;

    return { nodes, edges, positions, nodeInfo, svgWidth, svgHeight };
  }, [stores, classIri, entityIndex]);

  if (!layout) return null;

  const { nodes, edges, positions, nodeInfo, svgWidth, svgHeight } = layout;

  return (
    <div style={{ maxHeight: 500, overflow: 'auto' }}>
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ display: 'block', width: svgWidth, maxWidth: '100%' }}
      >
        {/* Edges */}
        {edges.map(({ child, parent }, i) => {
          const p = positions.get(parent);
          const c = positions.get(child);
          if (!p || !c) return null;
          const x1 = SVG_PAD + p.x + p.w / 2;
          const y1 = SVG_PAD + p.y + p.h;
          const x2 = SVG_PAD + c.x + c.w / 2;
          const y2 = SVG_PAD + c.y;
          const midY = (y1 + y2) / 2;
          return (
            <path
              key={`e${i}`}
              className="dag-edge"
              d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`}
            />
          );
        })}
        {/* Nodes */}
        {nodes.map(iri => {
          const pos = positions.get(iri);
          const info = nodeInfo.get(iri);
          if (!pos || !info) return null;
          const isSelected = iri === classIri;
          const h = pos.h;
          return (
            <g
              key={iri}
              className={`dag-node${isSelected ? ' dag-node-selected' : ''}`}
              onClick={() => selectEntity(iri)}
              transform={`translate(${SVG_PAD + pos.x},${SVG_PAD + pos.y})`}
            >
              <rect width={pos.w} height={h} rx={NODE_RX} />
              {info.badge && (
                <>
                  <rect
                    className="dag-badge"
                    x={(pos.w - BADGE_W) / 2} y={3}
                    width={BADGE_W} height={BADGE_H}
                    rx={BADGE_RX}
                    fill={info.badgeColor || '#888'}
                  />
                  <text
                    className="dag-badge-text"
                    x={pos.w / 2} y={3 + BADGE_H / 2}
                    textAnchor="middle" dominantBaseline="central"
                  >
                    {info.badge}
                  </text>
                </>
              )}
              <text
                x={pos.w / 2}
                y={info.badge ? 3 + BADGE_H + (h - 3 - BADGE_H) / 2 : h / 2}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {info.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
