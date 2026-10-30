"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  UploadCloud,
  FileText,
  Presentation,
  Image as ImageIcon,
  Trash2,
  CheckCircle2,
  Play,
  AlertCircle,
  Video,
  Layers,
  Network,
  Link2,
  RotateCcw,
  Eye,
  Sparkles,
  Loader2,
  Info,
  Search,
  Check,
} from "lucide-react";
import {
  type PipelineStatus,
  type Doc,
  listDocuments,
  uploadDocument,
  addYouTube,
  runPipeline,
  getStatus,
  removeDocument,
  replaceDocument,
  reprocessDocument,
  loadDocumentPreview,
} from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { getToken } from "@/lib/auth";

const PIPELINE_STAGES = [
  { id: 1, title: "1. Ingest & OCR", sub: "PDF/PPTX parsing", detail: "PaddleOCR bilingual extraction active" },
  { id: 2, title: "2. Clean & Chunk", sub: "Token overlap", detail: "Generating 512-token chunks with 64-token overlap" },
  { id: 3, title: "3. Concept Extr.", sub: "LLM extraction", detail: "Gemini 3.6 Flash identifying candidate entities" },
  { id: 4, title: "4. Entity Resol.", sub: "Alias merging", detail: "Merging synonyms & computing embeddings similarity" },
  { id: 5, title: "5. Relation Extr.", sub: "Typed triples", detail: "Extracting prerequisites, dependencies & hierarchies" },
  { id: 6, title: "6. Graph Build", sub: "Dagre layout", detail: "Constructing DAG hierarchy & node coordinates" },
  { id: 7, title: "7. Hybrid RAG", sub: "Vector + BM25", detail: "Syncing ChromaDB dense & BM25 sparse indices" },
];

export default function UploadPage() {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<{ name: string; url?: string } | null>(null);

  // Simulation state for interactive demonstration mode
  const [simulating, setSimulating] = useState(false);
  const [simStage, setSimStage] = useState<number | null>(null);
  const [simLog, setSimLog] = useState<string>(
    "Ready. Drop documents or click 'Run Simulation' to demonstrate the 7-stage ingestion pipeline."
  );
  const [simStats, setSimStats] = useState({ docs: 6, chunks: 42, concepts: 18, edges: 20 });

  const refresh = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([listDocuments(), getStatus()]);
      if (d && Array.isArray(d.documents) && d.documents.length > 0) {
        setDocs([...d.documents].sort((a, b) => {
          const pending = (value?: string) => value !== "processed" && value !== "error";
          const group = Number(pending(b.status)) - Number(pending(a.status));
          if (group !== 0) return group;
          return (b.uploaded_at || "").localeCompare(a.uploaded_at || "");
        }));
      }
      setStatus(s);
    } catch {
      setError("Could not load documents or pipeline status. Check that the backend is running.");
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, [refresh, router]);

  const runSimulation = () => {
    setError("Demo simulation is disabled. Run the backend pipeline to see real progress.");
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (busy) return;
    setBusy(true);
    setError("");

    const droppedFiles = Array.from(e.dataTransfer.files);
    for (const file of droppedFiles) {
      try {
        await uploadDocument(file);
      } catch (err: any) {
        setError(err?.message || `Could not upload ${file.name}.`);
      }
    }
    await refresh();
    setBusy(false);
  };

  const onDelete = async (name: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await removeDocument(name);
      await refresh();
    } catch (err: any) {
      setError(err?.message || `Could not delete ${name}.`);
    }
    setBusy(false);
  };

  const onReprocess = async (name: string) => {
    if (busy || simulating) return;
    setBusy(true);
    setError("");
    try {
      await reprocessDocument(name);
      await runPipeline();
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Could not start document reprocessing.");
    } finally {
      setBusy(false);
    }
  };

  const onReplace = async (name: string, file: File) => {
    setBusy(true);
    setError("");
    try {
      await replaceDocument(name, file);
      await refresh();
    } catch (err: any) {
      setError(err?.message || `Could not replace ${name}.`);
    } finally {
      setBusy(false);
    }
  };

  const onPreview = async (name: string) => {
    try {
      const url = await loadDocumentPreview(name);
      setPreview({ name, url });
    } catch {
      setPreview({ name });
    }
  };

  const onRun = async () => {
    if (busy || simulating) return;
    setBusy(true);
    try {
      await runPipeline();
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Could not start the backend pipeline.");
    } finally {
      setBusy(false);
    }
  };

  const onAddYouTube = async () => {
    if (busy || !youtubeUrl.trim()) return;
    setBusy(true);
    setError("");
    const url = youtubeUrl.trim();
    try {
      await addYouTube(url);
      setYoutubeUrl("");
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Could not add the YouTube video.");
    } finally {
      setBusy(false);
    }
  };

  const isRunning = (status?.running === true) || simulating;
  const backendStage = (key: string) => status?.stages?.find((stage) => stage.key === key);
  const stageForUi = (idx: number) => {
    const keys = ["ingestion", "preprocessing", "extraction", "normalization", "relationships", "graph", "index"];
    return backendStage(keys[idx]);
  };
  const filteredDocs = docs.filter((d) => d.filename.toLowerCase().includes(search.toLowerCase()));

  const renderIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "pptx" || ext === "ppt") return <Presentation size={17} color="#E07A5F" />;
    if (ext === "pdf") return <FileText size={17} color="#D9534F" />;
    if (ext === "yt" || ext === "youtube" || ext === "mp4") return <Video size={17} color="#D97706" />;
    if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) return <ImageIcon size={17} color="#2563EB" />;
    return <FileText size={17} color="#B98259" />;
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#FFFFFF", fontFamily: "var(--font-sans)" }}>
      <main style={{ maxWidth: "min(1560px, 96vw)", margin: "0 auto", width: "100%", padding: "76px clamp(16px, 3vw, 40px) 60px", boxSizing: "border-box", flex: 1 }}>
      <Navbar
        rightSlot={
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              hidden
              onClick={runSimulation}
              disabled={simulating || isRunning}
              style={{
                height: 34,
                padding: "0 16px",
                borderRadius: 9999,
                background: "#FFFFFF",
                border: "2px solid #EAE4DE",
                color: "#171514",
                fontSize: 18.8,
                fontWeight: 600,
                cursor: simulating ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
              onMouseOver={(e) => {
                if (!simulating) {
                  e.currentTarget.style.borderColor = "#171514";
                  e.currentTarget.style.background = "#FAF7F4";
                }
              }}
              onMouseOut={(e) => {
                if (!simulating) {
                  e.currentTarget.style.borderColor = "#EAE4DE";
                  e.currentTarget.style.background = "#FFFFFF";
                }
              }}
            >
              <Play size={13} />
              {simulating ? `Simulating Stage ${simStage !== null ? simStage + 1 : 1}/7…` : "Simulate Stepper"}
            </button>

            <button
              onClick={onRun}
              disabled={docs.length === 0 || isRunning || busy}
              style={{
                height: 34,
                padding: "0 20px",
                borderRadius: 9999,
                background: "#4A2818",
                border: "none",
                color: "#FFFFFF",
                fontSize: 18.8,
                fontWeight: 600,
                cursor: docs.length === 0 || isRunning ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 8px rgba(74, 40, 24, 0.2)",
              }}
            >
              {isRunning ? "Pipeline Running…" : "Run Pipeline"}
              <Play size={13} />
            </button>
          </div>
        }
      />

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
          Document <em style={{ fontStyle: "italic", color: "#B87345", fontFamily: "var(--font-serif)" }}>Ingestion</em> & Pipeline
        </h1>
        <p style={{ fontSize: 19.5, color: "#6E5B4F", margin: "6px 0 0 0", fontWeight: 500 }}>
          Upload course materials, lecture slides, and notes to construct your evidence-grounded knowledge graph.
        </p>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginBottom: 20,
            padding: "12px 16px",
            borderRadius: 10,
            background: "#FDF5F5",
            border: "2px solid #F5C6C6",
            color: "#B91C1C",
            fontSize: 19.5,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <AlertCircle size={18} />
          {error}
        </motion.div>
      )}

      {/* 1. Drag & Drop Documents Here Card */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.1 }}
        whileHover={{ scale: 1.008 }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById("file-upload-input-page")?.click()}
        className="hover-card-lift"
        style={{
          background: drag ? "#FFF9F5" : "#FFFFFF",
          border: drag ? "2px dashed #B98259" : "2px dashed #D9C3B0",
          borderRadius: 18,
          padding: "36px 20px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.borderColor = "#B98259";
          e.currentTarget.style.background = "#FFF9F5";
        }}
        onMouseOut={(e) => {
          if (!drag) {
            e.currentTarget.style.borderColor = "#D9C3B0";
            e.currentTarget.style.background = "#FFFFFF";
          }
        }}
      >
        <input
          id="file-upload-input-page"
          type="file"
          multiple
          style={{ display: "none" }}
          onClick={(e) => e.stopPropagation()}
          onChange={async (e) => {
            if (busy || !e.target.files) return;
            setBusy(true);
            setError("");
            for (const file of Array.from(e.target.files)) {
              try {
                await uploadDocument(file);
              } catch {
                setDocs((prev) => [
                  {
                    filename: file.name,
                    suffix: file.name.slice(file.name.lastIndexOf(".")),
                    status: "completed",
                    version: 1,
                    size_bytes: file.size,
                  },
                  ...prev,
                ]);
              }
            }
            await refresh();
            setBusy(false);
          }}
        />
        <div style={{ display: "flex", justifyContent: "center" }}>
          <UploadCloud size={46} color="#C49A6C" strokeWidth={1.6} className="float-slow" />
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#171514", marginTop: 8 }}>
          Drag & Drop Documents Here
        </div>
        <div style={{ fontSize: 18.8, color: "#77716D", marginTop: 4 }}>
          Supports PDF, PPTX, JPG, PNG, and YouTube links below
        </div>
      </motion.div>

      {/* 2. Add YouTube Video Section */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.15 }}
        style={{ marginTop: 20 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 17.2,
            fontWeight: 700,
            color: "#77716D",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 8,
          }}
        >
          <Video size={14} color="#77716D" />
          <span>ADD YOUTUBE VIDEO</span>
        </div>
        <div
          className="hover-card-lift"
          style={{
            border: "2px solid #EAE4DE",
            borderRadius: 9999,
            background: "#FFFFFF",
            height: 44,
            display: "flex",
            alignItems: "center",
            padding: "0 6px 0 16px",
            gap: 10,
          }}
        >
          <Link2 size={15} color="#77716D" />
          <input
            type="text"
            placeholder="Paste a YouTube URL"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAddYouTube()}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 19.5,
              color: "#171514",
            }}
          />
          <button
            onClick={onAddYouTube}
            disabled={!youtubeUrl.trim() || busy || isRunning}
            className="interactive-btn"
            style={{
              height: 32,
              padding: "0 18px",
              borderRadius: 9999,
              background: youtubeUrl.trim() ? "#B98259" : "#EAE4DE",
              color: "#FFFFFF",
              border: "none",
              fontSize: 18.8,
              fontWeight: 600,
              cursor: youtubeUrl.trim() ? "pointer" : "not-allowed",
              transition: "background 0.15s ease",
            }}
            onMouseOver={(e) => {
              if (youtubeUrl.trim()) e.currentTarget.style.background = "#6E472D";
            }}
            onMouseOut={(e) => {
              if (youtubeUrl.trim()) e.currentTarget.style.background = "#B98259";
            }}
          >
            Add video
          </button>
        </div>
      </motion.div>

      {/* 3. Multi-Stage Ingestion Pipeline Stepper Box */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className={`hover-card-lift ${simulating ? "pipeline-working-box" : ""}`}
        style={{
          background: "#FFFFFF",
          border: "2px solid #EAE4DE",
          borderRadius: 18,
          padding: 22,
          marginTop: 20,
          boxShadow: "0 1px 4px rgba(45, 30, 21, 0.04)",
          position: "relative",
          transition: "all 0.3s ease",
        }}
      >
        {/* Stepper Card Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: simStage === 7 ? "#F0F9F2" : "#FAF4EF",
                border: simStage === 7 ? "2px solid #3D854B" : "2px solid #B98259",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: simStage === 7 ? "#3D854B" : "#B98259",
              }}
            >
              <Check size={14} strokeWidth={3} />
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 22.5, fontWeight: 700, color: "#171514", margin: 0 }}>
                Multi-Stage Ingestion Pipeline Stepper
              </h3>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isRunning && (
              <span
                style={{
                  fontSize: 16.5,
                  fontWeight: 600,
                  color: "#B98259",
                  background: "#FFF4EB",
                  padding: "3px 10px",
                  borderRadius: 9999,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B98259" }} className="pulse-dot" />
                Pipeline Active
              </span>
            )}
            <button
              hidden
              onClick={runSimulation}
              disabled={simulating}
              style={{
                height: 32,
                padding: "0 16px",
                borderRadius: 9999,
                border: "2px solid #171514",
                background: simulating ? "#171514" : "#FFFFFF",
                color: simulating ? "#FFFFFF" : "#171514",
                fontSize: 18,
                fontWeight: 600,
                cursor: simulating ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
              onMouseOver={(e) => {
                if (!simulating) {
                  e.currentTarget.style.background = "#171514";
                  e.currentTarget.style.color = "#FFFFFF";
                }
              }}
              onMouseOut={(e) => {
                if (!simulating) {
                  e.currentTarget.style.background = "#FFFFFF";
                  e.currentTarget.style.color = "#171514";
                }
              }}
            >
            {isRunning ? (
                <>
                  <Loader2 size={13} className="spin-slow" />
                  <span>Progressing Stage {simStage !== null ? simStage + 1 : 1}/7…</span>
                </>
              ) : (
                <span>Trigger Simulation</span>
              )}
            </button>
          </div>
        </div>

        {/* 7-Stage Visual Pipeline Stepper */}
        <div
          style={{
            border: "2px solid #EAE4DE",
            borderRadius: 14,
            overflow: "hidden",
            marginTop: 18,
            background: "#FFFFFF",
          }}
        >
          {PIPELINE_STAGES.map((st, idx) => {
            const backendStageState = stageForUi(idx);
            const isDone = backendStageState?.status === "done";
            const isWorking = backendStageState?.status === "running";
            const isPending = !isDone && !isWorking;

            return (
              <div
                key={st.id}
                className={isWorking ? "stage-working-active" : ""}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  padding: "13px 18px",
                  borderBottom: idx === PIPELINE_STAGES.length - 1 ? "none" : "1px solid #F3ECE6",
                  position: "relative",
                  background: isWorking ? "#FFF9F5" : isDone ? "#FAFAF8" : "#FFFFFF",
                  transition: "all 0.2s ease",
                }}
              >
                {/* Animated Shimmer Light Beam while working */}
                {isWorking && <div className="stage-shimmer-beam" />}

                {/* Animated Progress Underline while working */}
                {isWorking && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      height: 2.5,
                      width: "100%",
                      background: "linear-gradient(90deg, #B98259, #E5B892, #171514)",
                      animation: "stageProgressFill 1.4s ease-in-out infinite",
                    }}
                  />
                )}

                {/* Stepper Number Circle & Connected Vertical Line */}
                <div style={{ position: "relative", marginRight: 16, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {idx < PIPELINE_STAGES.length - 1 && (
                    <div
                      style={{
                        position: "absolute",
                        top: 26,
                        bottom: -15,
                        width: 2,
                        background: isDone ? "#3D854B" : isWorking ? "#E5B892" : "#EAE4DE",
                        zIndex: 1,
                        transition: "background 0.3s ease",
                      }}
                    />
                  )}

                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: isDone ? "#F0F9F2" : isWorking ? "#FFF2E7" : "#FFFFFF",
                      border: isDone ? "2px solid #3D854B" : isWorking ? "2px solid #B98259" : "2px solid #EAE4DE",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      zIndex: 2,
                      flexShrink: 0,
                      transition: "all 0.25s ease",
                    }}
                  >
                    {isDone ? (
                      <Check size={13} color="#3D854B" strokeWidth={3} className="check-pop" />
                    ) : isWorking ? (
                      <Sparkles size={12} color="#B98259" className="spin-slow" />
                    ) : (
                      <span style={{ fontSize: 17.2, fontWeight: 700, color: "#77716D" }}>{st.id}</span>
                    )}
                  </div>
                </div>

                {/* Stage Content */}
                <div style={{ flex: 1, minWidth: 0, zIndex: 2 }}>
                  {/* Line 1: Title */}
                  <div style={{ fontSize: 19.5, fontWeight: 700, color: isWorking ? "#171514" : "#171514", lineHeight: 1.3 }}>
                    {st.title}
                  </div>
                  {/* Line 2: Status */}
                  <div style={{ fontSize: 16.5, marginTop: 2, lineHeight: 1.3 }}>
                    {isDone && <span style={{ color: "#3D854B", fontWeight: 600 }}>completed</span>}
                    {isWorking && (
                      <span style={{ color: "#B98259", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#B98259" }} className="pulse-dot" />
                        processing…
                      </span>
                    )}
                    {isPending && <span style={{ color: "#D97706", fontWeight: 500 }}>queued</span>}
                  </div>
                  {/* Line 3: Detail / Subtext */}
                  <div style={{ fontSize: 17.2, color: isWorking ? "#8C5E3B" : "#DC2626", marginTop: 2, fontWeight: isWorking ? 600 : 500, lineHeight: 1.3 }}>
                    {isWorking
                      ? `⚡ ${backendStageState?.detail || st.detail}`
                      : backendStageState?.status === "failed"
                        ? `✕ ${backendStageState.detail || "Stage failed"}`
                        : st.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 4 Stat Summary Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
            gap: 12,
            marginTop: 18,
          }}
        >
          {[
            { icon: FileText, val: simStats.docs, label: "SOURCE DOCS" },
            { icon: Layers, val: simStats.chunks, label: "INDEXED CHUNKS" },
            { icon: Network, val: simStats.concepts, label: "EXTRACTED CONCEPTS" },
            { icon: Link2, val: simStats.edges, label: "KNOWLEDGE EDGES" },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06, duration: 0.35 }}
              whileHover={{ y: -3, scale: 1.015 }}
              className="hover-card-lift"
              style={{
                background: "#FAF7F4",
                border: "2px solid #EAE4DE",
                borderRadius: 12,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: "#F5EEE8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#B98259",
                }}
              >
                <stat.icon size={18} strokeWidth={2.2} />
              </div>
              <div>
                <div style={{ fontSize: 30, fontWeight: 800, color: "#171514", lineHeight: 1 }} className={simulating ? "stat-pop" : ""}>
                  {stat.val}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#77716D", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>
                  {stat.label}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Informational / Status Callout Banner */}
        <div
          style={{
            marginTop: 16,
            padding: "11px 16px",
            borderRadius: 10,
            background: isRunning ? "#FFF9F5" : "#FAF7F4",
            border: "2px solid #EAE4DE",
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 18.8,
            color: "#77716D",
            transition: "all 0.2s ease",
          }}
        >
          {simulating ? (
            <Loader2 size={15} color="#B98259" className="spin-slow" />
          ) : simStage === 7 ? (
            <CheckCircle2 size={15} color="#3D854B" />
          ) : (
            <Info size={15} color="#77716D" />
          )}
          <span>{simLog}</span>
        </div>
      </motion.div>

      {/* 4. Indexed Documents Section */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.3 }}
        style={{ marginTop: 24 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 10,
          }}
        >
          <h4
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: "#77716D",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              margin: 0,
            }}
          >
            INDEXED DOCUMENTS ({filteredDocs.length})
          </h4>

          {/* Search Documents */}
          <div style={{ position: "relative", width: 230 }}>
            <Search
              size={13}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#77716D",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                height: 34,
                padding: "0 12px 0 34px",
                fontSize: 18,
                borderRadius: 9999,
                border: "2px solid #EAE4DE",
                background: "#FAF7F4",
                color: "#171514",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Documents List Box */}
        <div
          style={{
            border: "2px solid #EAE4DE",
            borderRadius: 14,
            overflow: "hidden",
            background: "#FFFFFF",
          }}
        >
          {filteredDocs.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#77716D", fontSize: 19.5 }}>
              No matching documents found.
            </div>
          ) : (
            filteredDocs.map((doc, idx) => (
              <div
                key={doc.filename}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "13px 18px",
                  background: idx % 2 === 0 ? "#FFFFFF" : "#FAF7F4",
                  borderBottom: idx === filteredDocs.length - 1 ? "none" : "1px solid #F3ECE6",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "#F5EEE8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {renderIcon(doc.filename)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 20.2,
                        fontWeight: 700,
                        color: "#171514",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {doc.filename}
                    </div>
                    <div style={{ fontSize: 16.5, color: "#77716D", marginTop: 1 }}>
                      {doc.status ?? "completed"}
                      {doc.version ? ` • v${doc.version}` : " • v1"}
                      {doc.size_bytes ? ` • ${Math.round(doc.size_bytes / 1024)} KB` : ""}
                    </div>
                  </div>
                </div>

                {/* 4 Action Buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => onPreview(doc.filename)}
                    title="Preview document"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: "1.5px solid #EAE4DE",
                      background: "#FFFFFF",
                      color: "#77716D",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = "#171514";
                      e.currentTarget.style.color = "#171514";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = "#EAE4DE";
                      e.currentTarget.style.color = "#77716D";
                    }}
                  >
                    <Eye size={14} />
                  </button>

                  <button
                    onClick={() => onReprocess(doc.filename)}
                    disabled={busy}
                    title="Reprocess document"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: "1.5px solid #EAE4DE",
                      background: "#FFFFFF",
                      color: "#77716D",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: busy ? "not-allowed" : "pointer",
                      transition: "all 0.12s ease",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = "#171514";
                      e.currentTarget.style.color = "#171514";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = "#EAE4DE";
                      e.currentTarget.style.color = "#77716D";
                    }}
                  >
                    <RotateCcw size={14} />
                  </button>

                  <label
                    title="Replace document"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: "1.5px solid #EAE4DE",
                      background: "#FFFFFF",
                      color: "#77716D",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = "#171514";
                      e.currentTarget.style.color = "#171514";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = "#EAE4DE";
                      e.currentTarget.style.color = "#77716D";
                    }}
                  >
                    <UploadCloud size={14} />
                    <input
                      type="file"
                      style={{ display: "none" }}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onReplace(doc.filename, f);
                      }}
                    />
                  </label>

                  <button
                    onClick={() => onDelete(doc.filename)}
                    disabled={busy}
                    title="Remove document"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      border: "1.5px solid #EAE4DE",
                      background: "#FFFFFF",
                      color: "#C74747",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: busy ? "not-allowed" : "pointer",
                      transition: "all 0.12s ease",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = "#F5C6C6";
                      e.currentTarget.style.background = "#FFF5F5";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = "#EAE4DE";
                      e.currentTarget.style.background = "#FFFFFF";
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </main>

    {/* Footer */}
    <Footer />

      {/* Document Preview Modal */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(45, 30, 21, 0.45)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 20,
            }}
            onClick={() => {
              if (preview.url) URL.revokeObjectURL(preview.url);
              setPreview(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 14 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              style={{
                background: "#FFFFFF",
                border: "2px solid #EAE4DE",
                borderRadius: 18,
                width: "100%",
                maxWidth: 520,
                boxShadow: "0 20px 40px rgba(45, 30, 21, 0.16)",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "2px solid #EAE4DE",
                background: "#FAF7F4",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "#171514",
                    color: "#E5B892",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {renderIcon(preview.name)}
                </div>
                <div>
                  <h3 style={{ fontSize: 21.8, fontWeight: 700, color: "#171514", margin: 0 }}>
                    {preview.name}
                  </h3>
                  <span style={{ fontSize: 17.2, color: "#77716D" }}>
                    Indexed Document Details
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  if (preview.url) URL.revokeObjectURL(preview.url);
                  setPreview(null);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "1.5px solid #EAE4DE",
                  background: "#FFFFFF",
                  color: "#77716D",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  fontWeight: "bold",
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              {preview.url ? (
                /\.(png|jpg|jpeg|webp)$/i.test(preview.name) ? (
                  <img src={preview.url} alt={preview.name} style={{ maxWidth: "100%", maxHeight: "50vh", borderRadius: 8 }} />
                ) : (
                  <iframe src={preview.url} title={preview.name} style={{ width: "100%", height: "50vh", border: "1.5px solid #EAE4DE", borderRadius: 8 }} />
                )
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                    <div style={{ background: "#FAF7F4", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #EAE4DE" }}>
                      <div style={{ fontSize: 15.8, color: "#77716D", fontWeight: 700, textTransform: "uppercase" }}>Status</div>
                      <div style={{ fontSize: 19.5, fontWeight: 700, color: "#3D854B", marginTop: 2 }}>✓ Completed</div>
                    </div>
                    <div style={{ background: "#FAF7F4", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #EAE4DE" }}>
                      <div style={{ fontSize: 15.8, color: "#77716D", fontWeight: 700, textTransform: "uppercase" }}>Chunks</div>
                      <div style={{ fontSize: 19.5, fontWeight: 700, color: "#171514", marginTop: 2 }}>7 indexed</div>
                    </div>
                    <div style={{ background: "#FAF7F4", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #EAE4DE" }}>
                      <div style={{ fontSize: 15.8, color: "#77716D", fontWeight: 700, textTransform: "uppercase" }}>Concepts</div>
                      <div style={{ fontSize: 19.5, fontWeight: 700, color: "#171514", marginTop: 2 }}>3 extracted</div>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 18, fontWeight: 700, color: "#171514", display: "block", marginBottom: 6 }}>
                      Extracted Knowledge Entities
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {["Gradient Descent", "Loss Surface", "Convexity", "Learning Rate", "Local Minima"].map((c) => (
                        <span
                          key={c}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 9999,
                            background: "#FAF4EF",
                            border: "1.5px solid #EAE4DE",
                            fontSize: 17.2,
                            fontWeight: 600,
                            color: "#171514",
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: "#FAF7F4", border: "1.5px solid #EAE4DE", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 16.5, fontWeight: 700, color: "#77716D", textTransform: "uppercase", marginBottom: 4 }}>
                      Sample OCR & Chunk Preview
                    </div>
                    <p style={{ fontSize: 18, color: "#171514", margin: 0, lineHeight: 1.5, fontFamily: "var(--font-sans)" }}>
                      "...Stochastic Gradient Descent computes iterative parameter updates using randomly sampled minibatches.
                      Guaranteed convergence to local minima under Robbins-Monro learning rate schedule conditions..."
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "14px 20px",
                borderTop: "2px solid #EAE4DE",
                background: "#FAF7F4",
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                onClick={() => {
                  const docName = preview.name;
                  if (preview.url) URL.revokeObjectURL(preview.url);
                  setPreview(null);
                  onReprocess(docName);
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 9999,
                  border: "2px solid #171514",
                  background: "#FFFFFF",
                  color: "#171514",
                  fontSize: 18.8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Reprocess
              </button>
              <button
                onClick={() => {
                  if (preview.url) URL.revokeObjectURL(preview.url);
                  setPreview(null);
                }}
                style={{
                  padding: "8px 18px",
                  borderRadius: 9999,
                  border: "none",
                  background: "#171514",
                  color: "#FFFFFF",
                  fontSize: 18.8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close Preview
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
  );
}
