"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, ArrowUpDown, Filter } from "lucide-react";
import clsx from "clsx";
import type { ConceptEdge, ConceptNode } from "@/lib/graph";

type Props = {
  concepts: ConceptNode[];
  edges: ConceptEdge[];
  focusId: string | null;
  search: string;
  onSearch: (v: string) => void;
  onFocus: (id: string) => void;
};

const listVariant = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.02 } },
};

const itemVariant = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0 },
};

export default function ConceptList({ concepts, edges, focusId, search, onSearch, onFocus }: Props) {
  const [filterMode, setFilterMode] = useState<"all" | "hubs" | "isolated">("all");
  const [sortBy, setSortBy] = useState<"degree" | "name" | "occurrences">("degree");

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of edges) {
      d.set(e.source_concept_id, (d.get(e.source_concept_id) ?? 0) + 1);
      d.set(e.target_concept_id, (d.get(e.target_concept_id) ?? 0) + 1);
    }
    return d;
  }, [edges]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = q
      ? concepts.filter(
          (c) =>
            c.canonical_name.toLowerCase().includes(q) ||
            c.aliases?.some((a) => a.toLowerCase().includes(q)) ||
            c.keywords?.some((k) => k.toLowerCase().includes(q))
        )
      : concepts;

    if (filterMode === "hubs") {
      filtered = filtered.filter((c) => (degree.get(c.concept_id) ?? 0) >= 3);
    } else if (filterMode === "isolated") {
      filtered = filtered.filter((c) => (degree.get(c.concept_id) ?? 0) === 0);
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === "name") {
        return a.canonical_name.localeCompare(b.canonical_name);
      }
      if (sortBy === "occurrences") {
        return b.occurrence_count - a.occurrence_count || a.canonical_name.localeCompare(b.canonical_name);
      }
      // default: degree
      return (
        (degree.get(b.concept_id) ?? 0) - (degree.get(a.concept_id) ?? 0) ||
        b.occurrence_count - a.occurrence_count ||
        a.canonical_name.localeCompare(b.canonical_name)
      );
    });
  }, [concepts, search, degree, filterMode, sortBy]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="search-wrapper">
          <Search size={14} className="search-icon" />
          <input
            className="search"
            placeholder="Search concepts, aliases…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        <div className="sidebar-filters">
          <button
            className={clsx("sidebar-chip", filterMode === "all" && "active")}
            onClick={() => setFilterMode("all")}
          >
            All ({concepts.length})
          </button>
          <button
            className={clsx("sidebar-chip", filterMode === "hubs" && "active")}
            onClick={() => setFilterMode("hubs")}
            title="Concepts with 3 or more relationships"
          >
            Hubs (≥3)
          </button>
          <button
            className={clsx("sidebar-chip", filterMode === "isolated" && "active")}
            onClick={() => setFilterMode("isolated")}
            title="Isolated concepts without explicit relationships in text"
          >
            Isolated
          </button>
          <button
            className="sidebar-chip"
            style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 3 }}
            onClick={() => {
              setSortBy((s) => (s === "degree" ? "name" : s === "name" ? "occurrences" : "degree"));
            }}
            title="Change sorting order"
          >
            <ArrowUpDown size={10} />
            {sortBy === "degree" ? "Links" : sortBy === "name" ? "A-Z" : "Freq"}
          </button>
        </div>

        <div className="sidebar-count">
          Showing {shown.length} of {concepts.length} concepts
        </div>
      </div>

      <div className="concept-list">
        <motion.div variants={listVariant} initial="hidden" animate="visible">
          {shown.map((c) => {
            const d = degree.get(c.concept_id) ?? 0;
            return (
              <motion.button
                key={c.concept_id}
                variants={itemVariant}
                whileHover={{ x: 4 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={clsx("concept-row", c.concept_id === focusId && "active")}
                onClick={() => onFocus(c.concept_id)}
              >
                <span className="concept-row-name">{c.canonical_name}</span>
                <span className="concept-row-meta">
                  <span className="conn-pill">{d > 0 ? `${d} links` : "isolated"}</span>
                  {c.filenames.length > 1 && <span>· {c.filenames.length} docs</span>}
                  {c.mean_confidence && <span>· {(c.mean_confidence * 100).toFixed(0)}% conf</span>}
                </span>
              </motion.button>
            );
          })}
        </motion.div>
        {shown.length === 0 && (
          <div className="sidebar-empty">
            No concepts match {search ? `“${search}”` : "selected filter"}.
          </div>
        )}
      </div>
    </aside>
  );
}

