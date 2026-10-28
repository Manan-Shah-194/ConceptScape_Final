"use client";

import { Handle, Position } from "reactflow";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Sparkles, Network, BookOpen, Compass, Layers } from "lucide-react";
import type { ConceptNode as Concept } from "@/lib/graph";

export default function ConceptNode({
  data,
  selected,
}: {
  data: { concept: Concept; degree: number; depth: number };
  selected?: boolean;
}) {
  const { concept, degree, depth } = data;
  const isFocus = selected;
  const isIsolated = degree === 0;

  // Render meaningful icon based on concept prominence & state
  const renderIcon = () => {
    if (isFocus) return <Sparkles size={16} strokeWidth={2.2} />;
    if (isIsolated) return <Compass size={15} strokeWidth={2} />;
    if (degree >= 4) return <Network size={16} strokeWidth={2} />;
    if (concept.filenames && concept.filenames.length > 1) return <Layers size={15} strokeWidth={2} />;
    return <BookOpen size={15} strokeWidth={2} />;
  };

  const docCount = concept.filenames?.length || (concept.resource_ids?.length || 1);
  const secondaryMeta = isIsolated
    ? "Isolated · 0 rels"
    : `${degree} rel${degree === 1 ? "" : "s"} · ${docCount} doc${docCount === 1 ? "" : "s"}`;

  return (
    <>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <motion.div
        whileHover={{ scale: 1.02 }}
        className={clsx(
          "node",
          isIsolated && "isolated",
          isFocus && "focus",
          !isFocus && depth === 2 && "hop2"
        )}
      >
        <div className={clsx("node-avatar", isFocus && "avatar-focus")}>
          {renderIcon()}
        </div>
        <div className="node-body">
          <div className="node-title" title={concept.canonical_name}>
            {concept.canonical_name}
          </div>
          <div className="node-meta" title={secondaryMeta}>
            {secondaryMeta}
          </div>
        </div>
        {degree > 0 && !isIsolated && (
          <div className="node-badge" title={`${degree} connected relationships`}>
            {degree}
          </div>
        )}
      </motion.div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  );
}
