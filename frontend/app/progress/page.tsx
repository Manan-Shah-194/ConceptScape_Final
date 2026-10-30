"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Target,
  FileText,
  Layers,
  BarChart2,
  Lightbulb,
  RotateCw,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { getGraph, getProgress, listSubjects } from "@/lib/api";
import { getSubjectId, getToken, setSubjectId } from "@/lib/auth";

function RadialGauge({ percent = 88, size = 68 }: { percent?: number; size?: number }) {
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#F7F0E8"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Animated Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#B87345"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          fontSize: 24,
          fontWeight: 800,
          color: "#4A2818",
          letterSpacing: "-0.02em",
        }}
      >
        {percent}%
      </div>
    </div>
  );
}

function ProgressBar({ value, width = 110, color = "#B87345" }: { value: number; width?: number | string; color?: string }) {
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

export default function ProgressPage() {
  const router = useRouter();
  // Filled from /progress. Invented mastery percentages were
  // indistinguishable from measured ones, which is the worst case for a
  // screen whose entire purpose is reporting how much you actually know.
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [topicSort, setTopicSort] = useState("mastery_desc");
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; document_count?: number }>>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    Promise.all([getProgress(), getGraph()])
      .then(([res, graph]) => {
        const names = new Map((graph?.nodes ?? []).map((node: any) => [node.concept_id, node.canonical_name || node.name || node.label]));
        setData({
          ...res,
          concepts: (res?.concepts ?? []).map((item: any) => ({
            ...item,
            concept_name: item.concept_name && !item.concept_name.startsWith("concept_")
              ? item.concept_name
              : names.get(item.concept_id) || item.concept_name || item.concept_id,
          })),
          paths: (res?.paths ?? []).map((item: any) => ({
            ...item,
            concept_name: names.get(item.concept_id) || item.concept_name || item.concept_id,
          })),
        });
      })
      .catch((e) => {
        setError(e.message || "");
      });
  }, [router, selectedSubjectId]);

  useEffect(() => {
    listSubjects().then((items) => {
      setSubjects(items);
      const saved = getSubjectId();
      if (saved && items.some((item) => item.id === saved)) {
        setSelectedSubjectId(saved);
        setSubjectId(saved);
      }
      else if (items.length === 1) {
        setSelectedSubjectId(items[0].id);
        setSubjectId(items[0].id);
      }
    }).catch(() => setSubjects([]));
  }, []);

  const quizAccuracy = Math.round((data?.quiz?.accuracy ?? 0) * 100);
  const quizCorrect = data?.quiz?.correct ?? 0;
  const quizAttempts = data?.quiz?.attempts ?? 0;
  const docsList = data?.by_document ?? [];
  const topicsList = [...(data?.by_topic ?? [])]
    .filter((topic: any) => topicFilter === "all" || (topicFilter === "completed" ? topic.mastery >= 1 : topic.mastery < 1))
    .sort((a: any, b: any) => topicSort === "name" ? a.name.localeCompare(b.name) : topicSort === "mastery_asc" ? a.mastery - b.mastery : b.mastery - a.mastery);
  const conceptsList = data?.concepts ?? [];

  const renderDocIcon = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    return (
      <div style={{ width: 28, height: 28, borderRadius: 7, background: "#FAF0E6", display: "flex", alignItems: "center", justifyContent: "center", color: ext === "pptx" || ext === "ppt" ? "#E07A5F" : "#D9534F", flexShrink: 0 }}>
        {ext === "pptx" || ext === "ppt" ? <Layers size={15} /> : <FileText size={15} />}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)" }}>
      <Navbar />

      <main style={{ maxWidth: "min(1560px, 96vw)", margin: "0 auto", width: "100%", padding: "76px clamp(16px, 3vw, 40px) 60px", boxSizing: "border-box" }}>
        {/* Page Title & Subtitle */}
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
            Progress & <em style={{ fontStyle: "italic", color: "#B87345", fontFamily: "var(--font-serif)" }}>Mastery</em>
          </h1>
          <p
            style={{
              fontSize: 19.5,
              color: "#6E5B4F",
              margin: "6px 0 0 0",
              fontWeight: 500,
            }}
          >
            Track your learning progress across documents, topics and concepts.
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

        {/* 1. Top Card: Quiz accuracy */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
          className="hover-card-lift"
          style={{
            background: "#FFFFFF",
            border: "2px solid #E8DDD5",
            borderRadius: 18,
            padding: "20px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 20,
            marginBottom: 20,
            boxShadow: "0 1px 4px rgba(74, 40, 24, 0.03)",
          }}
        >
          {/* Left: Icon + Label */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: "#F7F0E8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#B87345",
                flexShrink: 0,
              }}
            >
              <Target size={22} strokeWidth={2.2} />
            </div>
            <div>
              <h3 style={{ fontSize: 24, fontWeight: 700, color: "#1C1917", margin: 0 }}>
                Quiz accuracy
              </h3>
              <p style={{ fontSize: 18.8, color: "#6E5B4F", margin: "3px 0 0 0" }}>
                Your performance across all practice quizzes.
              </p>
            </div>
          </div>

          {/* Right: Radial gauge + Fraction */}
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            <RadialGauge percent={quizAccuracy} size={70} />
            <div>
              <div style={{ fontSize: 33, fontWeight: 800, color: "#4A2818", lineHeight: 1 }}>
                {quizCorrect} / {quizAttempts}
              </div>
              <div style={{ fontSize: 18, fontWeight: 500, color: "#6E5B4F", marginTop: 4 }}>
                correct answers
              </div>
            </div>
          </div>
        </motion.div>

        {/* 2. Middle Row: By Document & By Topic (2 Columns) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
            gap: 20,
            marginBottom: 20,
          }}
        >
          {/* Card: By Document */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
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
                <FileText size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3 style={{ fontSize: 22.5, fontWeight: 800, color: "#2D1E15", margin: 0 }}>
                  By Document
                </h3>
                <p style={{ fontSize: 18, color: "#6E5B4F", margin: "2px 0 0 0" }}>
                  Your accuracy and coverage for each document.
                </p>
              </div>
            </div>

            {/* Table Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
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
              <div style={{ flex: 1 }}>Document</div>
              <div style={{ width: 140, textAlign: "left" }}>Accuracy</div>
              <div style={{ width: 85, textAlign: "right" }}>Concepts</div>
            </div>

            {/* Document Rows */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {docsList.map((doc: any, i: number) => {
                const masteryPct = Math.round((doc.mastery ?? 0) * 100);
                return (
                  <div
                    key={doc.name || i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "11px 12px",
                      borderBottom: i === docsList.length - 1 ? "none" : "1px solid #F3ECE6",
                      fontSize: 19.5,
                      transition: "background 0.12s ease",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "#FAF7F5")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Document Title with Icon */}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0, paddingRight: 10 }}>
                      {renderDocIcon(doc.name)}
                      <span
                        style={{
                          fontSize: 18.8,
                          fontWeight: 600,
                          color: "#2D1E15",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {doc.name}
                      </span>
                    </div>

                    {/* Accuracy Progress Bar + Number */}
                    <div style={{ width: 140, display: "flex", alignItems: "center", gap: 10 }}>
                      <ProgressBar value={doc.mastery ?? 0} width={80} />
                      <span style={{ fontSize: 18, fontWeight: 700, color: "#2D1E15" }}>
                        {masteryPct}%
                      </span>
                    </div>

                    {/* Concepts Count + Chevron */}
                    <div
                      style={{
                        width: 85,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 6,
                        color: "#2D1E15",
                        fontSize: 18,
                        fontWeight: 500,
                      }}
                    >
                      <span>{doc.concepts} concepts</span>
                      <ChevronRight size={14} color="#9C897B" />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Card: By Topic */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.2 }}
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
                <Layers size={18} strokeWidth={2.2} />
              </div>
              <div>
                <h3 style={{ fontSize: 22.5, fontWeight: 800, color: "#2D1E15", margin: 0 }}>
                  By Topic
                </h3>
                <p style={{ fontSize: 18, color: "#6E5B4F", margin: "2px 0 0 0" }}>
                  Your accuracy and coverage for each topic.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <select
                aria-label="Filter progress by subject"
                value={selectedSubjectId}
                onChange={(event) => {
                  const next = event.target.value;
                  setSelectedSubjectId(next);
                  setSubjectId(next || null);
                }}
                style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #E8DDD5", color: "#4A2818" }}
              >
                <option value="">All subjects</option>
                {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
              </select>
              <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #E8DDD5", color: "#4A2818" }}>
                <option value="all">All topics</option>
                <option value="completed">Completed</option>
                <option value="active">In progress</option>
              </select>
              <select value={topicSort} onChange={(e) => setTopicSort(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #E8DDD5", color: "#4A2818" }}>
                <option value="mastery_desc">Highest mastery</option>
                <option value="mastery_asc">Lowest mastery</option>
                <option value="name">Name</option>
              </select>
            </div>

            {/* Table Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 12px",
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
              <div style={{ flex: 1 }}>Topic</div>
              <div style={{ width: 140, textAlign: "left" }}>Accuracy</div>
              <div style={{ width: 85, textAlign: "right" }}>Concepts</div>
            </div>

            {/* Topic Rows */}
            <div data-lenis-prevent="true" style={{ display: "flex", flexDirection: "column", maxHeight: 360, overflowY: "auto", overscrollBehavior: "contain", paddingRight: 4 }}>
              {topicsList.map((topic: any, i: number) => {
                const masteryPct = Math.round((topic.mastery ?? 0) * 100);
                return (
                  <div
                    key={topic.name || i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "11px 12px",
                      borderBottom: i === topicsList.length - 1 ? "none" : "1px solid #F3ECE6",
                      fontSize: 19.5,
                      transition: "background 0.12s ease",
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "#FAF7F5")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Topic Title with BarChart Icon */}
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0, paddingRight: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: "#FAF0E6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#C47D3B",
                          flexShrink: 0,
                        }}
                      >
                        <BarChart2 size={15} />
                      </div>
                      <span
                        style={{
                          fontSize: 18.8,
                          fontWeight: 600,
                          color: "#2D1E15",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {topic.name}
                      </span>
                    </div>

                    {/* Accuracy Progress Bar + Number */}
                    <div style={{ width: 140, display: "flex", alignItems: "center", gap: 10 }}>
                      <ProgressBar value={topic.mastery ?? 0} width={80} />
                      <span style={{ fontSize: 18, fontWeight: 700, color: "#2D1E15" }}>
                        {masteryPct}%
                      </span>
                    </div>

                    {/* Concepts Count + Chevron */}
                    <div
                      style={{
                        width: 85,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 6,
                        color: "#2D1E15",
                        fontSize: 18,
                        fontWeight: 500,
                      }}
                    >
                      <span>{topic.concepts} concepts</span>
                      <ChevronRight size={14} color="#9C897B" />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>

        {/* 3. Bottom Card: Concepts */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.25 }}
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
              <Lightbulb size={18} strokeWidth={2.2} />
            </div>
            <div>
              <h3 style={{ fontSize: 22.5, fontWeight: 800, color: "#2D1E15", margin: 0 }}>
                Concepts
              </h3>
              <p style={{ fontSize: 18, color: "#6E5B4F", margin: "2px 0 0 0" }}>
                Your learning status and confidence for each concept.
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
            <div style={{ width: 110 }}>Status</div>
            <div style={{ width: 220 }}>Confidence</div>
            <div style={{ width: 140, textAlign: "right" }}>Actions</div>
          </div>

          {/* Concept Rows */}
          <div
            data-lenis-prevent="true"
            style={{
              display: "flex",
              flexDirection: "column",
              maxHeight: "min(520px, 60vh)",
              overflowY: "auto",
              overscrollBehavior: "contain",
              paddingRight: 4,
              scrollbarWidth: "thin",
              scrollbarColor: "#B87345 #F7F0E8",
            }}
          >
            {conceptsList.map((item: any, i: number) => {
              const isLearned = item.status === "learned";
              const confVal = typeof item.confidence === "number" ? item.confidence : 0;

              return (
                <div
                  key={item.concept_id || i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 14px",
                    borderBottom: i === conceptsList.length - 1 ? "none" : "1px solid #F3ECE6",
                    fontSize: 19.5,
                    transition: "background 0.12s ease",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#FAF7F5")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Concept ID */}
                  <div
                    style={{
                      flex: 1.4,
                      fontSize: 18.8,
                      fontWeight: 600,
                      color: "#2D1E15",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: 12,
                    }}
                  >
                    {item.concept_name || item.concept_id}
                  </div>

                  {/* Status Badge */}
                  <div style={{ width: 110 }}>
                    <span
                      style={{
                        padding: "3px 12px",
                        borderRadius: 9999,
                        fontSize: 17.2,
                        fontWeight: 600,
                        background: isLearned ? "#EAF7EE" : "#FAF0E6",
                        border: isLearned ? "1.5px solid #C8ECD4" : "1.5px solid #EEDBCB",
                        color: isLearned ? "#166534" : "#8B5E3C",
                        display: "inline-block",
                      }}
                    >
                      {isLearned ? "Learned" : "Started"}
                    </span>
                  </div>

                  {/* Confidence Progress Bar + Value */}
                  <div style={{ width: 220, display: "flex", alignItems: "center", gap: 12 }}>
                    <ProgressBar value={confVal} width={130} />
                    <span style={{ fontSize: 18, fontWeight: 700, color: "#2D1E15" }}>
                      {confVal.toFixed(2)}
                    </span>
                  </div>

                  {/* Actions Column */}
                  <div
                    style={{
                      width: 140,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 12,
                    }}
                  >
                    {item.needs_review ? (
                      <button
                        onClick={() => router.push(`/learn?concept=${item.concept_id}`)}
                        style={{
                          height: 28,
                          padding: "0 12px",
                          borderRadius: 9999,
                          border: "1.5px solid #E8DDD5",
                          background: "#FFFFFF",
                          color: "#2D1E15",
                          fontSize: 17.2,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          transition: "all 0.12s ease",
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.borderColor = "#362419";
                          e.currentTarget.style.background = "#FAF0E6";
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.borderColor = "#E8DDD5";
                          e.currentTarget.style.background = "#FFFFFF";
                        }}
                      >
                        <RotateCw size={12} color="#2D1E15" />
                        Revisit
                      </button>
                    ) : (
                      <span style={{ color: "#9C897B", fontSize: 19.5, paddingRight: 8 }}>—</span>
                    )}

                    <button
                      title="More options"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#9C897B",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 4,
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.color = "#2D1E15")}
                      onMouseOut={(e) => (e.currentTarget.style.color = "#9C897B")}
                    >
                      <MoreHorizontal size={15} />
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
