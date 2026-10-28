"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Network,
  Upload,
  Brain,
  MessageSquare,
  ArrowRight,
  Sparkles,
  FileText,
  GitBranch,
  Search,
  Shield,
  LogIn,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { getHealth, type HealthStatus } from "@/lib/api";

const FEATURES = [
  {
    icon: Upload,
    tag: "Multi-Format",
    title: "Multi-Format Ingestion",
    desc: "Drop PDFs, PowerPoints, or images. PaddleOCR handles scanned pages automatically with high accuracy.",
    color: "#B87345",
    highlight: "PDF, PPTX, OCR",
    bentoClass: "bento-span-3",
  },
  {
    icon: Brain,
    tag: "AI Extraction",
    title: "AI Concept Extraction",
    desc: "Gemini & Groq extract concepts, definitions, and relationships — every claim verified against source text.",
    color: "#4A2818",
    highlight: "Gemini & Groq",
    bentoClass: "bento-span-3",
  },
  {
    icon: GitBranch,
    tag: "Graph Network",
    title: "Knowledge Graph",
    desc: "Concepts become nodes, relationships become edges. Explore how ideas connect across your documents.",
    color: "#C59B77",
    highlight: "NetworkX Engine",
    bentoClass: "bento-span-2",
  },
  {
    icon: MessageSquare,
    tag: "Graph RAG",
    title: "Grounded Q&A",
    desc: "Ask questions and get cited answers. If the material doesn't cover it, ConceptScape says so.",
    color: "#8C5E3B",
    highlight: "Cited Answers",
    bentoClass: "bento-span-2",
  },
  {
    icon: Shield,
    tag: "Evidence-First",
    title: "Evidence-First",
    desc: "No hallucinations. Every concept, edge, and answer traces back to a specific page in your documents.",
    color: "#2D6A4F",
    highlight: "Strict Grounding",
    bentoClass: "bento-span-2",
  },
];

const STEPS = [
  { num: "01", title: "Upload Documents", desc: "PDF, PPTX, JPG, PNG — drag and drop.", icon: FileText },
  { num: "02", title: "Run Pipeline", desc: "AI extracts concepts and builds the graph.", icon: Sparkles },
  { num: "03", title: "Explore & Ask", desc: "Navigate the graph or ask questions with cited answers.", icon: Search },
];

const PIPELINE = ["Ingest", "Clean", "Extract", "Normalize", "Relate", "Graph", "Index"];

export default function LandingPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  useEffect(() => {
    getHealth()
      .then((h) => { setHealth(h); setBackendUp(true); })
      .catch(() => setBackendUp(false));
  }, []);

  const artifactCount = health
    ? Object.values(health.artifacts).filter(Boolean).length
    : 0;

  return (
    <div className="landing">
      <Navbar />

      {/* Hero */}
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-content">
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            INGESTION / EXTRACTION / GRAPH RAG
          </motion.div>

          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            New possibilities for{" "}
            <em className="italic-serif">ambitious</em> knowledge
          </motion.h1>

          <motion.p
            className="hero-sub"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            Upload your educational material. ConceptScape extracts concepts,
            maps relationships, and lets you explore and ask questions —
            every answer grounded in evidence from your documents.
          </motion.p>

          <motion.div
            className="hero-actions"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Link href="/upload" className="hero-cta">
              Start a project
              <ArrowRight size={18} />
            </Link>
            <Link href="/login" className="hero-cta-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <LogIn size={17} />
              Log in to account
            </Link>
            <Link href="/graph" className="hero-cta-secondary">
              <Network size={18} />
              Explore Graph
            </Link>
          </motion.div>

          <motion.div
            className="hero-status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <span className={`status-dot ${backendUp === true ? "up" : backendUp === false ? "down" : ""}`} />
            {backendUp === null
              ? "Checking backend…"
              : backendUp
                ? `Backend online · ${artifactCount}/4 artifacts ready`
                : "Backend offline — start with: uvicorn api.service:app --port 8000"}
          </motion.div>
        </div>

        <motion.div
          className="hero-visual"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <GraphPreview />
        </motion.div>
      </section>

      {/* NOVA Dark Stats Banner */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.55 }}
        style={{ maxWidth: "min(1560px, 96vw)", margin: "0 auto 20px", padding: "0 clamp(16px, 3vw, 36px)", boxSizing: "border-box" }}
      >
        <div
          style={{
            background: "var(--dark-bg)",
            borderRadius: 24,
            padding: "36px 44px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 24,
            border: "1px solid var(--dark-border)",
            boxShadow: "0 16px 48px rgba(0, 0, 0, 0.16)",
          }}
        >
          {[
            { stat: "100%", label: "Evidence-Grounded Citations" },
            { stat: "7-Stage", label: "Automated AI Pipeline" },
            { stat: "0%", label: "Hallucinated Edges" },
            { stat: "4-Way", label: "Hybrid Retrieval Architecture" },
          ].map((item, idx) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1, duration: 0.45 }}
              whileHover={{ y: -4, scale: 1.02 }}
            >
              <div style={{ fontSize: 36, fontWeight: 800, color: "var(--accent-secondary)", letterSpacing: "-0.03em", fontFamily: "var(--font-sans)" }}>
                {item.stat}
              </div>
              <div style={{ fontSize: 19.5, color: "var(--dark-muted)", marginTop: 4, fontWeight: 500 }}>
                {item.label}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* How it works */}
      <motion.section
        className="section"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.55 }}
      >
        <div className="section-header">
          <span className="section-label">How It Works</span>
          <h2 className="section-title">
            Three Steps to <em className="italic-serif">Understanding</em>
          </h2>
        </div>
        <div className="steps-grid">
          {STEPS.map((step, idx) => (
            <motion.div
              key={step.num}
              className="step-card hover-card-lift"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.12, duration: 0.45 }}
              whileHover={{ y: -6 }}
            >
              <span className="step-num">{step.num}</span>
              <div className="step-icon-wrap">
                <step.icon size={24} />
              </div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Features */}
      <motion.section
        className="section"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.55 }}
      >
        <div className="section-header">
          <span className="section-label">Features</span>
          <h2 className="section-title">
            Built for <em className="italic-serif">Deep</em> Understanding
          </h2>
        </div>

        <div className="features-bento">
          {FEATURES.map((f, idx) => (
            <motion.div
              key={f.title}
              className={`feature-card hover-card-lift ${f.bentoClass}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (idx % 3) * 0.08, duration: 0.4 }}
              whileHover={{ y: -5 }}
            >
              <div className="feature-card-top">
                <div className="feature-icon" style={{ background: `${f.color}15`, color: f.color }}>
                  <f.icon size={22} />
                </div>
                <span className="feature-pill">{f.tag}</span>
              </div>

              <h3>{f.title}</h3>
              <p>{f.desc}</p>

              <div className="feature-card-footer">
                <div className="feature-chip">
                  <span className="feature-chip-dot" style={{ background: f.color }} />
                  <span>{f.highlight}</span>
                </div>
                <span className="feature-index">0{idx + 1}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Pipeline */}
      <motion.section
        className="section"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.55 }}
      >
        <div className="section-header">
          <span className="section-label">Pipeline</span>
          <h2 className="section-title">
            Seven Stages, <em className="italic-serif">Fully</em> Automated
          </h2>
        </div>
        <div className="pipeline-bar">
          {PIPELINE.map((s, i) => (
            <motion.div
              key={s}
              className="pipeline-stage hover-card-lift"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.35 }}
              whileHover={{ scale: 1.04 }}
            >
              <span className="pipeline-num">{i + 1}</span>
              <span>{s}</span>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* CTA */}
      <motion.section
        className="section cta-section"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.55 }}
      >
        <motion.div
          className="cta-block"
          whileHover={{ scale: 1.006 }}
          transition={{ duration: 0.3 }}
          style={{
            background: "#4A3024",
            borderRadius: 22,
            padding: "52px 32px",
            border: "1px solid #5C3D2E",
            boxShadow: "0 18px 45px rgba(74, 48, 36, 0.22)",
            textAlign: "center",
          }}
        >
          <div className="cta-glow" />
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 500, color: "#FFFFFF", marginBottom: 10 }}>
            Ready to Build Your <em className="italic-serif" style={{ color: "#C78052", fontStyle: "italic", fontWeight: 500 }}>Knowledge Graph?</em>
          </h2>
          <p style={{ color: "#D8C4B6", fontSize: 17.5, marginBottom: 24, margin: "0 auto 24px auto", maxWidth: 650 }}>
            Upload your first document and watch ConceptScape map out the concepts.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
            <Link
              href="/upload"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#A25C35",
                color: "#FFFFFF",
                borderRadius: 9999,
                padding: "10px 24px",
                fontSize: 16,
                fontWeight: 600,
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(162, 92, 53, 0.25)",
                transition: "all 0.15s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "#B4673B";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "#A25C35";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              Upload Documents <ArrowRight size={17} />
            </Link>
            <Link
              href="/login"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                background: "rgba(255, 255, 255, 0.05)",
                color: "#FFFFFF",
                border: "1px solid rgba(255, 255, 255, 0.32)",
                borderRadius: 9999,
                padding: "10px 22px",
                fontSize: 16,
                fontWeight: 500,
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.5)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.32)";
              }}
            >
              <LogIn size={16} />
              Already have an account? Log in
            </Link>
          </div>
        </motion.div>
      </motion.section>

      {/* Footer */}
      <Footer />
    </div>
  );
}

function GraphPreview() {
  const nodes = [
    { id: "ml", label: "Machine Learning", x: 195, y: 35, w: 148, h: 36, main: true },
    { id: "gd", label: "Gradient Descent", x: 110, y: 130, w: 140, h: 34, main: false },
    { id: "lr", label: "Learning Rate", x: 300, y: 110, w: 122, h: 34, main: false },
    { id: "nn", label: "Neural Network", x: 36, y: 65, w: 128, h: 34, main: false },
    { id: "opt", label: "Optimization", x: 65, y: 215, w: 115, h: 34, main: false },
    { id: "lf", label: "Loss Function", x: 295, y: 205, w: 120, h: 34, main: false },
    { id: "bp", label: "Backpropagation", x: 205, y: 265, w: 140, h: 34, main: false },
  ];

  const edges = [
    { from: "ml", to: "gd" }, { from: "ml", to: "lr" }, { from: "ml", to: "nn" },
    { from: "gd", to: "opt" }, { from: "gd", to: "lf" }, { from: "nn", to: "bp" },
    { from: "bp", to: "gd" }, { from: "lr", to: "lf" },
  ];

  return (
    <svg viewBox="0 0 440 320" className="graph-preview">
      <defs>
        <radialGradient id="node-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4A2818" stopOpacity="0.32" />
          <stop offset="55%" stopColor="#B87345" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#B87345" stopOpacity="0" />
        </radialGradient>
      </defs>
      {edges.map((e, i) => {
        const from = nodes.find((n) => n.id === e.from)!;
        const to = nodes.find((n) => n.id === e.to)!;
        return (
          <line
            key={i}
            x1={from.x + from.w / 2} y1={from.y + from.h / 2}
            x2={to.x + to.w / 2} y2={to.y + to.h / 2}
            stroke="var(--border-med)"
            strokeWidth="1.5"
            opacity="0.6"
          />
        );
      })}
      {nodes.map((n) => (
        <g key={n.id}>
          {n.main && (
            <ellipse
              cx={n.x + n.w / 2}
              cy={n.y + n.h / 2}
              rx={n.w / 2 + 26}
              ry={n.h / 2 + 20}
              fill="url(#node-glow)"
            />
          )}
          <rect
            x={n.x} y={n.y}
            width={n.w} height={n.h} rx={9}
            fill={n.main ? "var(--surface-3)" : "var(--panel)"}
            stroke={n.main ? "var(--accent)" : "var(--border)"}
            strokeWidth={n.main ? "1.5" : "1"}
          />
          <text
            x={n.x + n.w / 2}
            y={n.y + n.h / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--text)"
            fontSize="14.5"
            fontWeight={n.main ? "600" : "500"}
            fontFamily="var(--font-sans), sans-serif"
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
