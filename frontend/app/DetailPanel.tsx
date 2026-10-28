"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, FileText, ArrowRight, ArrowLeft, ExternalLink, GraduationCap, MessageSquare } from "lucide-react";
import Link from "next/link";
import type { ConceptEdge, ConceptNode } from "@/lib/graph";
import { TYPE_COLORS } from "@/lib/graph";
import { formatLocation } from "@/lib/api";

type Props = {
  concept: ConceptNode | null;
  edges: ConceptEdge[];
  conceptsById: Record<string, ConceptNode>;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export default function DetailPanel({ concept, edges, conceptsById, onSelect, onClose }: Props) {
  const [tab, setTab] = useState<"def" | "ev" | "rel">("def");

  return (
    <AnimatePresence>
      {concept && (
        <motion.aside
          initial={{ x: 380, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 380, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="panel"
        >
          <div className="panel-head">
            <button className="close" onClick={onClose} aria-label="Close detail panel">
              <X size={18} />
            </button>
            <h2>{concept.canonical_name}</h2>

            <div className="tabs">
              {(["def", "ev", "rel"] as const).map((t) => (
                <button
                  key={t}
                  className={`tab ${tab === t ? "active" : ""}`}
                  onClick={() => setTab(t)}
                >
                  {t === "def" ? "Definition" : t === "ev" ? "Evidence" : "Relationships"}
                  {tab === t && (
                    <motion.div
                      layoutId="tab-indicator"
                      className="tab-indicator"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="panel-body">
            {tab === "def" && <DefinitionTab concept={concept} />}
            {tab === "ev" && <EvidenceTab concept={concept} />}
            {tab === "rel" && (
              <RelationshipsTab
                concept={concept}
                edges={edges}
                conceptsById={conceptsById}
                onSelect={onSelect}
              />
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function DefinitionTab({ concept }: { concept: ConceptNode }) {
  return (
    <>
      <div className="node-meta" style={{ marginBottom: 16 }}>
        {concept.occurrence_count} mention{concept.occurrence_count === 1 ? "" : "s"} ·{" "}
        {concept.filenames.length} document{concept.filenames.length === 1 ? "" : "s"} ·{" "}
        confidence {(concept.mean_confidence * 100).toFixed(0)}%
      </div>

      {concept.definition ? (
        <p className="definition">{concept.definition}</p>
      ) : (
        <div className="empty-state">No explicit definition found in text.</div>
      )}

      {/* Quick Cross-Nav Links */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <Link
          href={`/chat`}
          className="btn-ghost"
          style={{ textDecoration: "none", fontSize: 17.2, display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <MessageSquare size={13} />
          Ask in Q&A
        </Link>
        <Link
          href={`/learn`}
          className="btn-ghost"
          style={{ textDecoration: "none", fontSize: 17.2, display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <GraduationCap size={13} />
          Study in Learn
        </Link>
      </div>

      {concept.aliases?.length > 1 && (
        <>
          <h3>Also appears as</h3>
          <div className="tags">
            {concept.aliases.map((a) => (
              <span className="tag" key={a}>
                {a}
              </span>
            ))}
          </div>
        </>
      )}

      {concept.keywords?.length > 0 && (
        <>
          <h3>Keywords</h3>
          <div className="tags">
            {concept.keywords.map((k) => (
              <span className="tag" key={k}>
                {k}
              </span>
            ))}
          </div>
        </>
      )}

      {concept.models_used && concept.models_used.length > 0 && (
        <>
          <h3>Extraction Models</h3>
          <div className="tags">
            {concept.models_used.map((m) => (
              <span className="tag" key={m} style={{ fontStyle: "italic", fontSize: 15 }}>
                {m}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function EvidenceTab({ concept }: { concept: ConceptNode }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1800);
  };

  return (
    <>
      <div className="node-meta" style={{ marginBottom: 14 }}>
        Verbatim evidence groundings extracted from source documents.
      </div>

      {concept.evidence?.length > 0 ? (
        concept.evidence.map((ev, i) => (
          <div className="evidence-card" key={i}>
            <div className="evidence-quote">“{ev}”</div>
            <div className="evidence-footer">
              <span className="evidence-badge">
                <FileText size={11} />
                {concept.filenames[0]}
                {concept.locations?.length
                  ? ` · ${formatLocation(concept.locations[0].type, concept.locations[0].number)}`
                  : concept.page_numbers?.length > 0
                  ? ` · p${concept.page_numbers[0]}`
                  : ""}
              </span>
              <button
                className="btn-copy-quote"
                onClick={() => handleCopy(ev, i)}
                title="Copy verbatim citation"
              >
                {copiedIndex === i ? (
                  <>
                    <Check size={11} style={{ color: "var(--success)" }} /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={11} /> Copy quote
                  </>
                )}
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="empty-state">No direct evidence clips available.</div>
      )}

      <h3 style={{ marginTop: 24 }}>Sources & Locations</h3>
      {concept.filenames.map((f, i) => (
        <div className="source-line" key={i}>
          <FileText size={12} style={{ verticalAlign: "-2px", marginRight: 5, color: "var(--accent)" }} />
          <strong>{f}</strong>
          {concept.locations?.length ? (
            <span style={{ color: "var(--text-3)" }}>
              {" · "}
              {concept.locations
                .filter((l) => l.filename === f)
                .map((l) => formatLocation(l.type, l.number))
                .join(", ")}
            </span>
          ) : concept.page_numbers?.length > 0 ? (
            <span style={{ color: "var(--text-3)" }}> · p{concept.page_numbers.join(", ")}</span>
          ) : null}
        </div>
      ))}
    </>
  );
}

function RelationshipsTab({
  concept,
  edges,
  conceptsById,
  onSelect,
}: {
  concept: ConceptNode;
  edges: ConceptEdge[];
  conceptsById: Record<string, ConceptNode>;
  onSelect: (id: string) => void;
}) {
  const [dirFilter, setDirFilter] = useState<"all" | "out" | "in">("all");

  const related = edges.filter(
    (e) => e.source_concept_id === concept.concept_id || e.target_concept_id === concept.concept_id
  );

  const outgoingCount = related.filter((e) => e.source_concept_id === concept.concept_id).length;
  const incomingCount = related.filter((e) => e.target_concept_id === concept.concept_id).length;

  const filtered = related.filter((e) => {
    if (dirFilter === "out") return e.source_concept_id === concept.concept_id;
    if (dirFilter === "in") return e.target_concept_id === concept.concept_id;
    return true;
  });

  if (related.length === 0) {
    return (
      <div className="empty-state">
        No relationships. The source material never explicitly stated one for this concept, and
        edges are only created where the text supports them.
      </div>
    );
  }

  return (
    <>
      <div className="rel-filter-row">
        <button
          className={`rel-filter-btn ${dirFilter === "all" ? "active" : ""}`}
          onClick={() => setDirFilter("all")}
        >
          All ({related.length})
        </button>
        <button
          className={`rel-filter-btn ${dirFilter === "out" ? "active" : ""}`}
          onClick={() => setDirFilter("out")}
        >
          Outgoing → ({outgoingCount})
        </button>
        <button
          className={`rel-filter-btn ${dirFilter === "in" ? "active" : ""}`}
          onClick={() => setDirFilter("in")}
        >
          Incoming ← ({incomingCount})
        </button>
      </div>

      {filtered.map((e) => {
        const outgoing = e.source_concept_id === concept.concept_id;
        const otherId = outgoing ? e.target_concept_id : e.source_concept_id;
        const other = conceptsById[otherId];
        const evidence = e.evidence_texts?.[0] ?? "";
        const src = e.evidence_filenames?.[0] ?? "";
        const page = e.evidence_locations?.[0] ?? 0;

        return (
          <div className="rel" key={e.relationship_id}>
            <div className="rel-head">
              {!outgoing && (
                <span className="rel-target" onClick={() => onSelect(otherId)}>
                  {other?.canonical_name ?? otherId}
                </span>
              )}
              <span
                className="rel-type"
                style={{
                  color: TYPE_COLORS[e.type] ?? "#666",
                  borderColor: TYPE_COLORS[e.type] ?? "var(--border)",
                }}
              >
                {outgoing ? "" : "← "}{e.type}{outgoing ? " →" : ""}
              </span>
              {outgoing && (
                <span className="rel-target" onClick={() => onSelect(otherId)}>
                  {other?.canonical_name ?? otherId}
                </span>
              )}
              <button
                className="rel-jump-btn"
                onClick={() => onSelect(otherId)}
                title={`Explore ${other?.canonical_name ?? otherId}`}
              >
                Explore ↗
              </button>
            </div>
            {evidence && (
              <div className="evidence" style={{ marginTop: 10, marginBottom: 0 }}>
                “{evidence}”
                {src && (
                  <span className="src">
                    <FileText size={10} style={{ marginRight: 3 }} />
                    {src}
                    {page ? ` p${page}` : ""}
                    {e.mean_confidence && ` · ${(e.mean_confidence * 100).toFixed(0)}% conf`}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

