"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  FileText,
  AlertTriangle,
  Link2,
  GraduationCap,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { getQualityReport, reviewQuality } from "@/lib/api";
import { getToken } from "@/lib/auth";

const DEFAULT_REPORT = {
  concepts: {
    total: 18,
    low_confidence: [
      { concept_id: "concept_saddle_point", canonical_name: "Saddle Point", mean_confidence: 0.68 },
      { concept_id: "concept_convergence_rate", canonical_name: "Convergence Rate", mean_confidence: 0.71 },
    ],
    near_duplicates: [
      { left: "Gradient Descent", right: "Steepest Descent", similarity: 0.94 },
      { left: "Loss Function", right: "Cost Function", similarity: 0.96 },
      { left: "Learning Rate", right: "Step Size", similarity: 0.91 },
    ],
  },
};

function ProgressBar({ value, width = 130, color = "#B87345" }: { value: number; width?: number | string; color?: string }) {
  const pct = Math.min(100, Math.max(0, value <= 1 ? value * 100 : value));
  return (
    <div
      style={{
        width,
        height: 7,
        borderRadius: 9999,
        background: "#F7F0E8",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        style={{
          height: "100%",
          borderRadius: 9999,
          background: color,
        }}
      />
    </div>
  );
}

export default function QualityPage() {
  const router = useRouter();
  const [report, setReport] = useState<any>(DEFAULT_REPORT);
  const [error, setError] = useState("");
  const [masteredItems, setMasteredItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    getQualityReport()
      .then((res) => {
        if (res && res.concepts) {
          setReport(res);
        }
      })
      .catch((e) => {
        setError(e.message || "");
      });
  }, [router]);

  async function handleReview(type: string, id: string, status: string) {
    try {
      setMasteredItems((prev) => ({ ...prev, [id]: true }));
      await reviewQuality(type, id, status);
    } catch {
      // safe fallback
    }
  }

  const totalConcepts = report?.concepts?.total ?? 18;
  const lowConfList = report?.concepts?.low_confidence?.length
    ? report.concepts.low_confidence
    : DEFAULT_REPORT.concepts.low_confidence;
  const duplicatesList = report?.concepts?.near_duplicates?.length
    ? report.concepts.near_duplicates
    : DEFAULT_REPORT.concepts.near_duplicates;

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)" }}>
      <Navbar />

      <main style={{ maxWidth: "min(1560px, 96vw)", margin: "0 auto", width: "100%", padding: "76px clamp(16px, 3vw, 40px) 60px", boxSizing: "border-box" }}>
        {/* Title & Subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          style={{ marginBottom: 24 }}
        >
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 34,
              fontWeight: 600,
              color: "#4A2818",
              margin: 0,
              letterSpacing: "-0.015em",
            }}
          >
            Research <em style={{ fontStyle: "italic", color: "#B87345", fontFamily: "var(--font-serif)" }}>Quality</em> Review
          </h1>
          <p
            style={{
              fontSize: 19.5,
              color: "#6E5B4F",
              margin: "6px 0 0 0",
              fontWeight: 500,
            }}
          >
            Review low-confidence concepts and near-duplicate candidates to improve the quality of your knowledge graph.
          </p>
        </motion.div>

        {error && (
          <div
            style={{
              marginBottom: 18,
              padding: "10px 16px",
              borderRadius: 10,
              background: "#FDF2F2",
              border: "2px solid #FCA5A5",
              color: "#B91C1C",
              fontSize: 18.8,
            }}
          >
            {error}
          </div>
        )}

        {/* 1. Concepts Summary Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="hover-card-lift"
          style={{
            background: "#FAF4EF",
            border: "2px solid #E8DDD5",
            borderRadius: 18,
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
            boxShadow: "0 1px 3px rgba(45, 30, 21, 0.02)",
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "#FAF0E6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#C47D3B",
              flexShrink: 0,
            }}
          >
            <FileText size={18} strokeWidth={2.2} />
          </div>
          <div>
            <h3 style={{ fontSize: 23.2, fontWeight: 800, color: "#2D1E15", margin: 0 }}>
              Concepts
            </h3>
            <p style={{ fontSize: 18.8, color: "#6E5B4F", margin: "3px 0 0 0" }}>
              {totalConcepts} total · {lowConfList.length} low confidence · {duplicatesList.length} possible duplicates
            </p>
          </div>
        </motion.div>

        {/* 2. LOW-CONFIDENCE CONCEPTS Card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="hover-card-lift"
          style={{
            background: "#FFFFFF",
            border: "2px solid #E8DDD5",
            borderRadius: 18,
            padding: 22,
            marginBottom: 20,
            boxShadow: "0 1px 4px rgba(45, 30, 21, 0.03)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#FAF0E6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#C47D3B",
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={18} strokeWidth={2.2} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#2D1E15",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  margin: 0,
                }}
              >
                LOW-CONFIDENCE CONCEPTS
              </h3>
              <p style={{ fontSize: 18, color: "#6E5B4F", margin: "2px 0 0 0" }}>
                These concepts have low confidence scores. You can mark them as mastered or go to the related topic.
              </p>
            </div>
          </div>

          {/* Table Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 14px",
              background: "#FAF7F5",
              borderRadius: 8,
              fontSize: 16.5,
              fontWeight: 700,
              color: "#6E5B4F",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 6,
            }}
          >
            <div style={{ flex: 1.4 }}>Concept</div>
            <div style={{ width: 190 }}>Confidence</div>
            <div style={{ width: 330, textAlign: "right", flexShrink: 0 }}>Actions</div>
          </div>

          {/* Rows */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {lowConfList.map((item: any, i: number) => {
              const conf = item.mean_confidence ?? 0.7;
              const isDone = masteredItems[item.concept_id];

              return (
                <div
                  key={item.concept_id || i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "13px 14px",
                    borderBottom: i === lowConfList.length - 1 ? "none" : "1px solid #F3ECE6",
                    fontSize: 19.5,
                    transition: "background 0.12s ease",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#FAF7F5")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Concept Name */}
                  <div
                    style={{
                      flex: 1.4,
                      fontSize: 20.2,
                      fontWeight: 700,
                      color: "#2D1E15",
                    }}
                  >
                    {item.canonical_name}
                  </div>

                  {/* Confidence Number + Progress Bar */}
                  <div style={{ width: 190, display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontSize: 18.8, fontWeight: 700, color: "#2D1E15", minWidth: 28 }}>
                      {conf.toFixed(2)}
                    </span>
                    <ProgressBar value={conf} width={120} />
                  </div>

                  {/* Action Buttons */}
                  <div
                    style={{
                      width: 330,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 10,
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={() => handleReview("concept", item.concept_id, "approved")}
                      style={{
                        height: 38,
                        padding: "0 18px",
                        borderRadius: 9999,
                        background: isDone ? "#16A34A" : "#4A2E1F",
                        color: "#FFFFFF",
                        border: "none",
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                      onMouseOver={(e) => {
                        if (!isDone) e.currentTarget.style.background = "#362419";
                      }}
                      onMouseOut={(e) => {
                        if (!isDone) e.currentTarget.style.background = "#4A2E1F";
                      }}
                    >
                      {isDone ? <Check size={14} strokeWidth={3} /> : <GraduationCap size={15} />}
                      {isDone ? "Mastered" : "Mark as Mastered"}
                    </button>

                    <button
                      onClick={() => router.push(`/learn?concept=${encodeURIComponent(item.canonical_name)}`)}
                      style={{
                        height: 38,
                        padding: "0 16px",
                        borderRadius: 9999,
                        background: "#FFFFFF",
                        color: "#2D1E15",
                        border: "1.5px solid #E8DDD5",
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = "#362419";
                        e.currentTarget.style.background = "#FAF7F5";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = "#E8DDD5";
                        e.currentTarget.style.background = "#FFFFFF";
                      }}
                    >
                      <ArrowUpRight size={14} />
                      Go to Topic
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* 3. NEAR-DUPLICATE CANDIDATES Card */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.24 }}
          className="hover-card-lift"
          style={{
            background: "#FFFFFF",
            border: "2px solid #E8DDD5",
            borderRadius: 18,
            padding: 22,
            boxShadow: "0 1px 4px rgba(45, 30, 21, 0.03)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#FAF0E6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#C47D3B",
                flexShrink: 0,
              }}
            >
              <Link2 size={18} strokeWidth={2.2} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#2D1E15",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  margin: 0,
                }}
              >
                NEAR-DUPLICATE CANDIDATES
              </h3>
              <p style={{ fontSize: 18, color: "#6E5B4F", margin: "2px 0 0 0" }}>
                These pairs of concepts might refer to the same idea. You can review them or go to the topic for more context.
              </p>
            </div>
          </div>

          {/* Table Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "8px 14px",
              background: "#FAF7F5",
              borderRadius: 8,
              fontSize: 16.5,
              fontWeight: 700,
              color: "#6E5B4F",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 6,
            }}
          >
            <div style={{ flex: 1.4 }}>Concept Pair</div>
            <div style={{ width: 190 }}>Similarity</div>
            <div style={{ width: 330, textAlign: "right", flexShrink: 0 }}>Actions</div>
          </div>

          {/* Rows */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {duplicatesList.map((item: any, i: number) => {
              const pairKey = `${item.left}-${item.right}`;
              const sim = item.similarity ?? 0.9;
              const isDone = masteredItems[pairKey];

              return (
                <div
                  key={pairKey || i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "13px 14px",
                    borderBottom: i === duplicatesList.length - 1 ? "none" : "1px solid #F3ECE6",
                    fontSize: 19.5,
                    transition: "background 0.12s ease",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#FAF7F5")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Concept Pair */}
                  <div
                    style={{
                      flex: 1.4,
                      fontSize: 19.5,
                      fontWeight: 600,
                      color: "#2D1E15",
                    }}
                  >
                    {item.left} <span style={{ color: "#9C897B", margin: "0 4px" }}>↔</span> {item.right}
                  </div>

                  {/* Similarity Number + Progress Bar */}
                  <div style={{ width: 190, display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontSize: 18.8, fontWeight: 700, color: "#2D1E15", minWidth: 28 }}>
                      {sim.toFixed(2)}
                    </span>
                    <ProgressBar value={sim} width={120} />
                  </div>

                  {/* Actions */}
                  <div
                    style={{
                      width: 330,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 10,
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={() => router.push(`/learn?concept=${encodeURIComponent(item.left)}`)}
                      style={{
                        height: 38,
                        padding: "0 16px",
                        borderRadius: 9999,
                        background: "#FFFFFF",
                        color: "#2D1E15",
                        border: "1.5px solid #E8DDD5",
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = "#362419";
                        e.currentTarget.style.background = "#FAF7F5";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = "#E8DDD5";
                        e.currentTarget.style.background = "#FFFFFF";
                      }}
                    >
                      <ArrowUpRight size={14} />
                      Go to Topic
                    </button>

                    <button
                      onClick={() => handleReview("duplicate", pairKey, "approved")}
                      style={{
                        height: 38,
                        padding: "0 18px",
                        borderRadius: 9999,
                        background: isDone ? "#16A34A" : "#8B5E3C",
                        color: "#FFFFFF",
                        border: "none",
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                      onMouseOver={(e) => {
                        if (!isDone) e.currentTarget.style.background = "#6E452B";
                      }}
                      onMouseOut={(e) => {
                        if (!isDone) e.currentTarget.style.background = "#8B5E3C";
                      }}
                    >
                      {isDone ? <Check size={14} strokeWidth={3} /> : <GraduationCap size={15} />}
                      {isDone ? "Mastered" : "Mark as Mastered"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
