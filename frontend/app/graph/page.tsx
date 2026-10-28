"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  BackgroundVariant,
  type ReactFlowInstance,
} from "reactflow";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2, Compass, Layers, GitFork, Plus, Minus } from "lucide-react";
import ConceptList from "../ConceptList";
import ConceptNode from "../ConceptNode";
import DetailPanel from "../DetailPanel";
import { Navbar } from "@/components/Navbar";
import { getGraph } from "@/lib/api";
import { getToken } from "@/lib/auth";
import {
  TYPE_COLORS,
  layout,
  radialLayout,
  subgraph,
  type ConceptEdge,
  type ConceptNode as Concept,
  type GraphExport,
} from "@/lib/graph";

const nodeTypes = { concept: ConceptNode };

export default function GraphPage() {
  return (
    <Suspense fallback={<div className="fullmsg" style={{ paddingTop: 120 }}>Loading workspace…</div>}>
      <GraphWorkspace />
    </Suspense>
  );
}

function GraphWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [graph, setGraph] = useState<GraphExport | null>(null);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [hops, setHops] = useState<number>(1);
  const [layoutMode, setLayoutMode] = useState<"radial" | "hierarchical">("radial");
  const [overview, setOverview] = useState(false);
  const [documentFilter, setDocumentFilter] = useState("");
  const [relationFilter, setRelationFilter] = useState("");
  const [confidence, setConfidence] = useState(0);
  const [connectedOnly, setConnectedOnly] = useState(false);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    getGraph({
      document: documentFilter,
      relation_type: relationFilter,
      min_confidence: confidence,
      connected_only: connectedOnly,
    })
      .then((g: GraphExport) => {
        setGraph(g);

        // Check URL query param ?focus=...
        const paramFocus = searchParams.get("focus");
        if (paramFocus && g.nodes.some((n) => n.concept_id === paramFocus)) {
          setFocusId(paramFocus);
          return;
        }

        const degree = new Map<string, number>();
        for (const e of g.edges) {
          degree.set(e.source_concept_id, (degree.get(e.source_concept_id) ?? 0) + 1);
          degree.set(e.target_concept_id, (degree.get(e.target_concept_id) ?? 0) + 1);
        }
        const hub = [...g.nodes].sort(
          (a, b) => (degree.get(b.concept_id) ?? 0) - (degree.get(a.concept_id) ?? 0)
        )[0];
        if (hub) setFocusId(hub.concept_id);
      })
      .catch((e) =>
        setError(
          `Could not load the graph: ${e.message}. ` +
          `Check the API is running (python run_api.py), then upload documents and run the pipeline.`
        )
      );
  }, [router, documentFilter, relationFilter, confidence, connectedOnly, searchParams]);

  const conceptsById = useMemo(() => {
    const m: Record<string, Concept> = {};
    for (const n of graph?.nodes ?? []) m[n.concept_id] = n;
    return m;
  }, [graph]);

  const view = useMemo(() => {
    if (!graph) return null;
    if (overview || !focusId) {
      const connected = graph.nodes.filter((n) =>
        graph.edges.some(
          (e) => e.source_concept_id === n.concept_id || e.target_concept_id === n.concept_id
        )
      );
      const ids = new Set(connected.map((n) => n.concept_id));
      const edges = graph.edges.filter(
        (e) => ids.has(e.source_concept_id) && ids.has(e.target_concept_id)
      );
      return { ...layout(connected, edges), shown: connected.length };
    }

    const sub = subgraph(focusId, graph.nodes, graph.edges, hops);
    if (layoutMode === "hierarchical") {
      return { ...layout(sub.nodes, sub.edges), shown: sub.nodes.length };
    }
    return { ...radialLayout(focusId, sub.nodes, sub.edges, sub.depth), shown: sub.nodes.length };
  }, [graph, focusId, hops, overview, layoutMode]);

  const nodes: Node[] = useMemo(
    () =>
      (view?.nodes ?? []).map((n) => ({
        ...n,
        data: { ...n.data, selected: n.id === focusId },
      })),
    [view, focusId]
  );

  const edges: Edge[] = view?.edges ?? [];

  const handleResetView = () => {
    if (rfInstance) {
      rfInstance.fitView({ padding: 0.22, duration: 400 });
    }
  };

  if (error) return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <div className="fullmsg" style={{ paddingTop: 120 }}>{error}</div>
    </div>
  );
  if (!graph || !view) return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <div className="fullmsg" style={{ paddingTop: 120 }}>Loading graph…</div>
    </div>
  );

  const focus = focusId ? conceptsById[focusId] ?? null : null;
  const usedTypes = Array.from(new Set(graph.edges.map((e) => e.type))).sort();

  return (
    <div className="layout" style={{ paddingTop: 0 }}>
      <Navbar />

      <ConceptList
        concepts={graph.nodes}
        edges={graph.edges as ConceptEdge[]}
        focusId={focusId}
        search={search}
        onSearch={setSearch}
        onFocus={(id) => {
          setFocusId(id);
          setOverview(false);
        }}
      />

      <div className="canvas">
        {/* Top toolbar with layout switches & fit-view */}
        <div className="graph-toolbar">
          <button
            className={`graph-tool-btn ${layoutMode === "radial" && !overview ? "active" : ""}`}
            onClick={() => { setLayoutMode("radial"); setOverview(false); }}
            title="Radial neighborhood layout"
          >
            <Compass size={13} />
            Radial
          </button>
          <button
            className={`graph-tool-btn ${layoutMode === "hierarchical" && !overview ? "active" : ""}`}
            onClick={() => { setLayoutMode("hierarchical"); setOverview(false); }}
            title="Dagre hierarchical layout"
          >
            <Layers size={13} />
            Dagre
          </button>
          <button
            className={`graph-tool-btn ${overview ? "active" : ""}`}
            onClick={() => setOverview((v) => !v)}
            title="View entire knowledge graph"
          >
            <GitFork size={13} />
            Whole Graph
          </button>
          <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }} />
          <button className="graph-tool-btn" onClick={handleResetView} title="Center view">
            <Maximize2 size={13} />
            Fit View
          </button>
        </div>

        {/* Bottom controls bar */}
        <div className="controls-bar">
          <span className="stats" style={{ padding: "0 8px", fontSize: 18 }}>
            {overview
              ? `Whole Graph · ${view.shown} connected`
              : `${focus?.canonical_name ?? ""} · ${view.shown} nodes`}
          </span>

          <div className="segmented">
            {!overview && [1, 2, 3].map((h) => (
              <button
                key={h}
                className={`seg ${hops === h ? "active" : ""}`}
                onClick={() => setHops(h)}
              >
                {hops === h && <motion.div layoutId="seg-bg" className="seg-bg" />}
                <span style={{ position: "relative", zIndex: 1 }}>
                  {h} hop{h === 1 ? "" : "s"}
                </span>
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
            <input
              aria-label="Filter graph by source document"
              value={documentFilter}
              onChange={(e) => setDocumentFilter(e.target.value)}
              placeholder="Filter source…"
              style={{ width: 130, padding: "4px 8px", fontSize: 17.2 }}
            />
            <select
              aria-label="Filter graph by relationship type"
              value={relationFilter}
              onChange={(e) => setRelationFilter(e.target.value)}
              style={{ padding: "4px 8px", fontSize: 17.2 }}
            >
              <option value="">All relations</option>
              {usedTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <label style={{ fontSize: 16.5, display: "inline-flex", alignItems: "center", gap: 4 }}>
              Conf ≥ {confidence.toFixed(1)}
              <input
                aria-label="Minimum graph confidence"
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                style={{ width: 60 }}
              />
            </label>
            <label style={{ fontSize: 16.5, display: "inline-flex", alignItems: "center", gap: 3 }}>
              <input
                type="checkbox"
                checked={connectedOnly}
                onChange={(e) => setConnectedOnly(e.target.checked)}
              />
              connected
            </label>
          </div>
        </div>

        {/* Upper-right compact graph navigation panel (Reference Inspiration) */}
        <div className="graph-zoom-controls">
          <button
            className="graph-zoom-btn"
            onClick={() => rfInstance?.zoomIn({ duration: 300 })}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
          <div className="graph-zoom-divider" />
          <button
            className="graph-zoom-btn"
            onClick={() => rfInstance?.zoomOut({ duration: 300 })}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <div className="graph-zoom-divider" />
          <button
            className="graph-zoom-btn"
            onClick={handleResetView}
            title="Fit graph to view"
            aria-label="Fit graph to view"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={(instance) => setRfInstance(instance)}
          onNodeClick={(_, node) => {
            setFocusId(node.id);
            setOverview(false);
          }}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          minZoom={0.08}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={2} color="var(--border-med)" />
        </ReactFlow>

        <div className="legend">
          {usedTypes.map((t) => {
            const isSelected = relationFilter === t;
            return (
              <div
                className="legend-item"
                key={t}
                onClick={() => setRelationFilter((prev) => (prev === t ? "" : t))}
                style={{ cursor: "pointer", opacity: relationFilter && !isSelected ? 0.4 : 1 }}
                title={`Filter by ${t} (click to toggle)`}
              >
                <span className="swatch" style={{ background: TYPE_COLORS[t] ?? "#999" }} />
                <span>{t}</span>
              </div>
            );
          })}
        </div>

        <AnimatePresence>
          {!overview && view.shown === 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="hint"
            >
              This concept has no relationships — the source material never explicitly
              stated one. Edges are only created where the text supports them.
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <DetailPanel
        concept={focus}
        edges={graph.edges as ConceptEdge[]}
        conceptsById={conceptsById}
        onSelect={(id) => {
          setFocusId(id);
          setOverview(false);
        }}
        onClose={() => setFocusId(null)}
      />
    </div>
  );
}

