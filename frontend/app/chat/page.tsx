"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  FileText,
  X,
  Search,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  Network,
  Copy,
  Check,
  ExternalLink,
  HelpCircle,
  Bookmark,
  RotateCw,
  PanelRightClose,
  PanelRightOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Download,
  Volume2,
  Paperclip,
  MessageSquare,
  FileSearch,
} from "lucide-react";
import {
  FLAG_LABELS,
  ask,
  deleteChatSession,
  getChatSession,
  listChatSessions,
  renameChatSession,
  type AskResponse,
  type Citation,
  type ChatSession,
} from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { getToken } from "@/lib/auth";

type Turn = {
  id: string;
  query: string;
  answer?: string;
  result?: AskResponse;
  error?: string;
  pending?: boolean;
};

type Flashcard = {
  id: string;
  front: string;
  back: string;
  source: string;
  mastered?: boolean;
  flipped?: boolean;
};

const COMPOSER_MODIFIERS = [
  { label: "Explain simply", prefix: "Explain in simple terms: " },
  { label: "Prerequisites", prefix: "What are the required prerequisites for: " },
  { label: "Compare with", prefix: "Compare and contrast: " },
  { label: "Evidence & citations", prefix: "What evidence and citations support: " },
];

export default function ChatPage() {
  return (
    <Suspense fallback={<div style={{ paddingTop: 120, textAlign: "center", color: "#6E5B4F" }}>Loading Ask workspace…</div>}>
      <ChatWorkspace />
    </Suspense>
  );
}

function ChatWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionSearch, setSessionSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Split-pane inspector state
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<"citations" | "concepts" | "flashcards">("citations");
  const [activeTurnIndex, setActiveTurnIndex] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 960) {
      setSidebarOpen(false);
      setInspectorOpen(false);
    }
  }, []);

  // Study Flashcards state
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [flashcardExportCopied, setFlashcardExportCopied] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    } else {
      listChatSessions()
        .then((res) => {
          if (res && res.length > 0) setSessions(res);
        })
        .catch(() => undefined);
    }
  }, [router]);

  // Handle URL query parameter `?q=...`
  useEffect(() => {
    const qParam = searchParams.get("q");
    if (qParam && turns.length === 0 && !busy) {
      submit(qParam);
    }
  }, [searchParams]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const activeTurn = useMemo(() => {
    if (turns.length === 0) return null;
    if (activeTurnIndex !== null && turns[activeTurnIndex]) {
      return turns[activeTurnIndex];
    }
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].result) return turns[i];
    }
    return turns[turns.length - 1];
  }, [turns, activeTurnIndex]);

  const filteredSessions = useMemo(() => {
    const list = sessions;
    if (!sessionSearch.trim()) return list;
    return list.filter((s) => s.title.toLowerCase().includes(sessionSearch.toLowerCase()));
  }, [sessions, sessionSearch]);

  async function openSession(id: string) {
    try {
      const session = await getChatSession(id);
      setSessionId(session.id);
      const restored: Turn[] = [];
      for (const message of session.messages) {
        if (message.role === "user") {
          restored.push({ id: `msg-${Date.now()}-${Math.random()}`, query: message.content });
        } else if (restored.length && message.metadata) {
          restored[restored.length - 1].result = message.metadata;
        } else if (restored.length) {
          restored[restored.length - 1].answer = message.content;
        }
      }
      setTurns(restored);
      setActiveTurnIndex(restored.length > 0 ? restored.length - 1 : null);
    } catch {
      // A conversation that cannot be restored is reported as such. Filling the
      // window with an invented exchange made a failed load look like history.
      setSessionId(id);
      setTurns([]);
      setActiveTurnIndex(null);
    }
  }

  function createNewSession() {
    setSessionId(undefined);
    setTurns([]);
    setActiveTurnIndex(null);
    setInput("");
    inputRef.current?.focus();
  }

  async function renameSession(session: ChatSession) {
    const title = window.prompt("Rename conversation", session.title);
    if (!title?.trim() || title.trim() === session.title) return;
    try {
      await renameChatSession(session.id, title.trim());
      setSessions(await listChatSessions());
    } catch {
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, title: title.trim() } : s)));
    }
  }

  async function removeSession(id: string) {
    if (!window.confirm("Delete this conversation?")) return;
    try {
      await deleteChatSession(id);
    } catch {
      // fallback
    }
    if (sessionId === id) {
      setSessionId(undefined);
      setTurns([]);
      setActiveTurnIndex(null);
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  async function submit(query: string) {
    const q = query.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);

    const turnId = `turn-${Date.now()}`;
    const newTurn: Turn = { id: turnId, query: q, pending: true };
    setTurns((t) => [...t, newTurn]);

    try {
      const result = await ask(q, sessionId);
      if (result.session_id) setSessionId(result.session_id);
      listChatSessions()
        .then((res) => {
          if (res && res.length > 0) setSessions(res);
        })
        .catch(() => undefined);

      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === turnId ? { ...turn, pending: false, result } : turn
        )
      );
      setActiveTurnIndex(turns.length);
    } catch (e: any) {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === turnId
            ? { ...turn, pending: false, error: e.message || "Request failed" }
            : turn
        )
      );
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  };

  const handleCreateFlashcard = (turn: Turn) => {
    if (!turn.result) return;
    const firstCite = turn.result.citations[0];
    const sourceLabel = firstCite
      ? `${firstCite.filename}${firstCite.page_number ? ` (p.${firstCite.page_number})` : ""}`
      : "ConceptScape Knowledge Graph";

    const newCard: Flashcard = {
      id: `fc-${Date.now()}`,
      front: turn.query,
      back: turn.result.answer,
      source: sourceLabel,
      mastered: false,
      flipped: false,
    };
    setFlashcards((prev) => [newCard, ...prev]);
    setInspectorTab("flashcards");
    setInspectorOpen(true);
  };

  const exportFlashcards = () => {
    const md = flashcards
      .map(
        (c, i) =>
          `### Flashcard ${i + 1}\n**Q:** ${c.front}\n**A:** ${c.back}\n*Source: ${c.source}*\n`
      )
      .join("\n---\n\n");
    navigator.clipboard.writeText(md);
    setFlashcardExportCopied(true);
    setTimeout(() => setFlashcardExportCopied(false), 2000);
  };

  return (
    <div style={{ height: "100vh", minHeight: "100dvh", width: "100vw", maxWidth: "100%", display: "flex", flexDirection: "column", background: "#FFFFFF", fontFamily: "var(--font-sans)", overflow: "hidden" }}>
      <Navbar />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* ── 1. Left Sidebar ── */}
        {sidebarOpen && (
          <aside
            style={{
              width: 250,
              maxWidth: "85vw",
              flexShrink: 0,
              background: "#FFFFFF",
              borderRight: "2px solid #E8DDD5",
              display: "flex",
              flexDirection: "column",
              height: "100%",
            }}
          >
          {/* Sidebar Header */}
          <div style={{ padding: "16px 14px", borderBottom: "2px solid #E8DDD5", display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={createNewSession}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 9999,
                background: "#4A2818",
                color: "#FFFFFF",
                fontSize: 18.8,
                fontWeight: 600,
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                cursor: "pointer",
                transition: "background 0.15s ease",
                boxShadow: "0 2px 6px rgba(74, 40, 24, 0.2)",
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "#361D11")}
              onMouseOut={(e) => (e.currentTarget.style.background = "#4A2818")}
            >
              <Plus size={15} />
              New Discussion
            </button>

            <div style={{ position: "relative" }}>
              <input
                aria-label="Search conversation history"
                placeholder="Search history…"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "7px 32px 7px 14px",
                  borderRadius: 9999,
                  border: "2px solid #E8DDD5",
                  background: "#FAF7F5",
                  fontSize: 18,
                  color: "#2D1E15",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <Search
                size={13}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#9C897B",
                  pointerEvents: "none",
                }}
              />
            </div>
          </div>

          {/* Discussions List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 10px" }}>
            <div
              style={{
                fontSize: 15.8,
                fontWeight: 800,
                color: "#6E5B4F",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
                padding: "0 6px",
              }}
            >
              Discussions ({filteredSessions.length})
            </div>

            {filteredSessions.map((session) => {
              const isActive = sessionId === session.id;
              return (
                <div
                  key={session.id}
                  onClick={() => openSession(session.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "9px 10px",
                    borderRadius: 8,
                    fontSize: 18.8,
                    color: isActive ? "#2D1E15" : "#6E5B4F",
                    fontWeight: isActive ? 700 : 500,
                    background: isActive ? "#FAF4EF" : "transparent",
                    cursor: "pointer",
                    marginBottom: 3,
                    transition: "all 0.12s ease",
                  }}
                  onMouseOver={(e) => {
                    if (!isActive) e.currentTarget.style.background = "#FAF7F5";
                  }}
                  onMouseOut={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <FileText size={14} color="#E07A5F" style={{ flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {session.title}
                  </span>
                  <div style={{ display: "flex", gap: 3, opacity: isActive ? 1 : 0.4 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        renameSession(session);
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#9C897B" }}
                    >
                      <Edit2 size={11} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSession(session.id);
                      }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#9C897B" }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Study topics are intentionally sourced from the active indexed corpus.
              Do not show sample topics when the account has no real chat data. */}
          <div style={{ padding: "14px", borderTop: "2px solid #E8DDD5", background: "#FFFFFF" }}>
            <div
              style={{
                fontSize: 15.8,
                fontWeight: 800,
                color: "#6E5B4F",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Indexed study topics
            </div>
            <p style={{ margin: 0, color: "#6E5B4F", lineHeight: 1.45 }}>
              Ask a question about the documents indexed in the active workspace. Study topics will appear here only when they are returned by the backend corpus.
            </p>
          </div>
        </aside>
      )}

        {/* ── 2. Center Chat Main Area ── */}
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100%", position: "relative", background: "#FFFFFF" }}>
          {/* Topbar */}
          <div
            style={{
              padding: "10px clamp(12px, 2vw, 24px)",
              borderBottom: "2px solid #E8DDD5",
              background: "#FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              zIndex: 5,
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                title={sidebarOpen ? "Hide history" : "Show history"}
                style={{
                  height: 32,
                  padding: "0 11px",
                  borderRadius: 9999,
                  border: "1.5px solid #E8DDD5",
                  background: "#FFFFFF",
                  color: "#2D1E15",
                  fontSize: 18,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  transition: "all 0.12s ease",
                }}
              >
                {sidebarOpen ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
                <span>{sidebarOpen ? "Hide History" : "History"}</span>
              </button>
              <span style={{ fontSize: 21.8, fontWeight: 700, color: "#2D1E15" }}>
                {sessionId
                  ? sessions.find((s) => s.id === sessionId)?.title || "Active Discussion"
                  : "ConceptScape Ask & Q&A"}
              </span>
              <span
                style={{
                  fontSize: 16.5,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 9999,
                  background: "#EAF7EE",
                  color: "#166534",
                  border: "1.5px solid #C8ECD4",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Sparkles size={11} />
                Strictly Grounded & Cited
              </span>
            </div>

            <button
              onClick={() => setInspectorOpen((v) => !v)}
              style={{
                height: 32,
                padding: "0 14px",
                borderRadius: 9999,
                border: "1.5px solid #E8DDD5",
                background: "#FFFFFF",
                color: "#2D1E15",
                fontSize: 18,
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.12s ease",
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
              {inspectorOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
              {inspectorOpen ? "Hide Inspector" : "Show Inspector"}
            </button>
          </div>

          {/* Messages / Welcome View Scroll Area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px clamp(14px, 3vw, 36px)" }}>
            <div style={{ maxWidth: "min(1140px, 100%)", margin: "0 auto", width: "100%" }}>
              {turns.length === 0 && (
                <div style={{ margin: "20px auto 36px" }}>
                  {/* Hero Intro */}
                  <div style={{ textAlign: "center", marginBottom: 28 }}>
                    <div
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: "50%",
                        background: "#FAF0E6",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto 14px",
                        color: "#8B5E3C",
                      }}
                    >
                      <MessageSquare size={26} strokeWidth={2.2} />
                    </div>

                    <h2
                      style={{
                        fontFamily: "var(--font-serif)",
                        fontSize: 38,
                        fontWeight: 600,
                        letterSpacing: "-0.015em",
                        margin: "0 0 10px",
                        color: "#4A2818",
                      }}
                    >
                      Ask <em style={{ fontStyle: "italic", color: "#B87345", fontFamily: "var(--font-serif)" }}>ConceptScape</em>
                    </h2>

                    <p
                      style={{
                        fontSize: 20.2,
                        color: "#6E5B4F",
                        lineHeight: 1.6,
                        margin: "0 auto",
                        maxWidth: 540,
                      }}
                    >
                      Every answer is verified against your indexed documents with verbatim citations.
                      <br />
                      If the source material does not state a claim, ConceptScape will explicitly decline to fabricate it.
                    </p>
                  </div>

                  <div
                    style={{
                      border: "1.5px solid #E8DDD5",
                      borderRadius: 14,
                      padding: "18px 20px",
                      background: "#FAF7F5",
                      color: "#6E5B4F",
                      textAlign: "center",
                    }}
                  >
                    No sample questions are preloaded. Enter a question below and the answer will be generated only from the active workspace documents.
                  </div>
                </div>
              )}

              {/* Chat Conversation Turns */}
              {turns.map((turn, idx) => {
                const isFocusedInInspector = activeTurnIndex === idx;
                return (
                  <motion.div
                    key={turn.id}
                    className="turn"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 280, damping: 25 }}
                  >
                    {/* User Question */}
                    <div
                      style={{
                        alignSelf: "flex-end",
                        padding: "12px 18px",
                        borderRadius: "18px 18px 4px 18px",
                        background: "#4A2818",
                        color: "#FFFFFF",
                        fontSize: 20.2,
                        maxWidth: "80%",
                        marginBottom: 14,
                        lineHeight: 1.5,
                        fontWeight: 500,
                        boxShadow: "0 2px 8px rgba(74, 40, 24, 0.15)",
                      }}
                    >
                      {turn.query}
                    </div>

                    {/* Pending State with Animated Dots */}
                    {turn.pending && (
                      <div
                        style={{
                          alignSelf: "flex-start",
                          padding: "16px 20px",
                          borderRadius: 14,
                          background: "#FAF7F5",
                          border: "2px solid #E8DDD5",
                          color: "#6E5B4F",
                          fontSize: 19.5,
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 14,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#B87345", display: "inline-block" }} />
                          <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#4A2818", display: "inline-block", animationDelay: "0.2s" }} />
                          <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#B87345", display: "inline-block", animationDelay: "0.4s" }} />
                        </div>
                        <span>Retrieving concepts & checking citations across documents…</span>
                      </div>
                    )}

                    {/* Error State */}
                    {turn.error && (
                      <div
                        style={{
                          alignSelf: "flex-start",
                          padding: "14px 18px",
                          borderRadius: 14,
                          background: "#FDF2F2",
                          border: "2px solid #FCA5A5",
                          color: "#B91C1C",
                          fontSize: 19.5,
                          marginBottom: 14,
                        }}
                      >
                        {turn.error}
                      </div>
                    )}

                    {/* Grounded Answer Card */}
                    {turn.result && (
                      <AnswerCard
                        turn={turn}
                        isActive={isFocusedInInspector}
                        onCite={(c) => {
                          setOpenCitation(c);
                          setActiveTurnIndex(idx);
                          setInspectorTab("citations");
                        }}
                        onInspect={() => {
                          setActiveTurnIndex(idx);
                          setInspectorOpen(true);
                        }}
                        onMakeFlashcard={() => handleCreateFlashcard(turn)}
                        onAskFollowUp={submit}
                      />
                    )}

                    {turn.answer && !turn.result && (
                      <div
                        style={{
                          background: "#FFFFFF",
                          border: "2px solid #E8DDD5",
                          borderRadius: 14,
                          padding: 18,
                          fontSize: 21,
                          color: "#2D1E15",
                          lineHeight: 1.6,
                        }}
                      >
                        {turn.answer}
                      </div>
                    )}
                  </motion.div>
                );
              })}
              <div ref={endRef} />
            </div>
          </div>

          {/* Composer Wrap */}
          <div style={{ padding: "14px clamp(14px, 3vw, 36px) 20px", background: "#FFFFFF", borderTop: "2px solid #E8DDD5" }}>
            <div style={{ maxWidth: "min(1140px, 100%)", margin: "0 auto", width: "100%" }}>
              {/* Prompt Starters Chips */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 17.2, color: "#6E5B4F", fontWeight: 600 }}>Prompt Starters:</span>
                {COMPOSER_MODIFIERS.map((mod) => (
                  <button
                    key={mod.label}
                    onClick={() => {
                      setInput((prev) => (prev.startsWith(mod.prefix) ? prev : mod.prefix + prev));
                      inputRef.current?.focus();
                    }}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 9999,
                      background: "#FFFFFF",
                      border: "1.5px solid #E8DDD5",
                      fontSize: 17.2,
                      fontWeight: 500,
                      color: "#2D1E15",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
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
                    {mod.label}
                  </button>
                ))}
              </div>

              {/* Main Composer Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(input);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "#FFFFFF",
                  border: "2px solid #E8DDD5",
                  borderRadius: 16,
                  padding: "6px 8px 6px 14px",
                  boxShadow: "0 2px 8px rgba(45, 30, 21, 0.04)",
                }}
              >
                <button
                  type="button"
                  title="Attach document or context"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#6E5B4F",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 4,
                  }}
                >
                  <Paperclip size={18} />
                </button>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about your documents... (Press Enter to send, Shift+Enter for newline)"
                  disabled={busy}
                  rows={1}
                  style={{
                    flex: 1,
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 19.5,
                    color: "#2D1E15",
                    fontFamily: "var(--font-sans)",
                    resize: "none",
                    lineHeight: 1.5,
                    padding: "6px 0",
                  }}
                />

                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: input.trim() ? "#4A2818" : "#E8DDD5",
                    color: "#FFFFFF",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: input.trim() ? "pointer" : "not-allowed",
                    transition: "background 0.15s ease",
                    flexShrink: 0,
                  }}
                  onMouseOver={(e) => {
                    if (input.trim()) e.currentTarget.style.background = "#361D11";
                  }}
                  onMouseOut={(e) => {
                    if (input.trim()) e.currentTarget.style.background = "#4A2818";
                  }}
                >
                  <Send size={15} />
                </button>
              </form>
            </div>
          </div>
        </main>

        {/* ── 3. Right Inspector Pane ── */}
        <AnimatePresence>
          {inspectorOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 330, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                width: "min(340px, 92vw)",
                flexShrink: 0,
                background: "#FFFFFF",
                borderLeft: "2px solid #E8DDD5",
                display: "flex",
                flexDirection: "column",
                height: "100%",
                overflow: "hidden",
              }}
            >
              {/* Header Tabs */}
              <div style={{ padding: "12px 14px 0", borderBottom: "2px solid #E8DDD5" }}>
                <div style={{ display: "flex", gap: 14 }}>
                  <button
                    onClick={() => setInspectorTab("citations")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "0 0 10px",
                      fontSize: 18,
                      fontWeight: inspectorTab === "citations" ? 700 : 500,
                      color: inspectorTab === "citations" ? "#2D1E15" : "#6E5B4F",
                      cursor: "pointer",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <FileText size={13} color={inspectorTab === "citations" ? "#2D1E15" : "#6E5B4F"} />
                    Citations ({activeTurn?.result?.citations.length || 0})
                    {inspectorTab === "citations" && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: -2,
                          left: 0,
                          right: 0,
                          height: 2.5,
                          background: "#8B5E3C",
                          borderRadius: "2px 2px 0 0",
                        }}
                      />
                    )}
                  </button>

                  <button
                    onClick={() => setInspectorTab("concepts")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "0 0 10px",
                      fontSize: 18,
                      fontWeight: inspectorTab === "concepts" ? 700 : 500,
                      color: inspectorTab === "concepts" ? "#2D1E15" : "#6E5B4F",
                      cursor: "pointer",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Network size={13} color={inspectorTab === "concepts" ? "#2D1E15" : "#6E5B4F"} />
                    Concepts ({activeTurn?.result?.concepts_identified.length || 0})
                    {inspectorTab === "concepts" && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: -2,
                          left: 0,
                          right: 0,
                          height: 2.5,
                          background: "#8B5E3C",
                          borderRadius: "2px 2px 0 0",
                        }}
                      />
                    )}
                  </button>

                  <button
                    onClick={() => setInspectorTab("flashcards")}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "0 0 10px",
                      fontSize: 18,
                      fontWeight: inspectorTab === "flashcards" ? 700 : 500,
                      color: inspectorTab === "flashcards" ? "#2D1E15" : "#6E5B4F",
                      cursor: "pointer",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <Bookmark size={13} color={inspectorTab === "flashcards" ? "#2D1E15" : "#6E5B4F"} />
                    Flashcards ({flashcards.length})
                    {inspectorTab === "flashcards" && (
                      <div
                        style={{
                          position: "absolute",
                          bottom: -2,
                          left: 0,
                          right: 0,
                          height: 2.5,
                          background: "#8B5E3C",
                          borderRadius: "2px 2px 0 0",
                        }}
                      />
                    )}
                  </button>
                </div>
              </div>

              {/* Inspector Body */}
              <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
                {inspectorTab === "citations" && (
                  <div>
                    {!activeTurn?.result || activeTurn.result.citations.length === 0 ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "55vh",
                          textAlign: "center",
                          padding: "0 18px",
                        }}
                      >
                        <div
                          style={{
                            width: 60,
                            height: 60,
                            borderRadius: "50%",
                            background: "#FAF4EF",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: 16,
                          }}
                        >
                          <FileSearch size={30} color="#C49A6C" strokeWidth={1.6} />
                        </div>
                        <p style={{ fontSize: 19.5, color: "#6E5B4F", lineHeight: 1.5, margin: 0, maxWidth: 220 }}>
                          Ask a question to inspect citations and evidence quotes from your documents.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 17.2, color: "#6E5B4F", fontWeight: 600, marginBottom: 12 }}>
                          Citations grounded in response:
                        </div>
                        {activeTurn.result.citations.map((c) => (
                          <div
                            key={c.index}
                            onClick={() => setOpenCitation(c)}
                            style={{
                              background: "#FFFFFF",
                              border: "1.5px solid #E8DDD5",
                              borderRadius: 12,
                              padding: 12,
                              marginBottom: 10,
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                              <span
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 5,
                                  background: "#FAF0E6",
                                  color: "#8B5E3C",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 15,
                                  fontWeight: 700,
                                }}
                              >
                                {c.index}
                              </span>
                              <span style={{ fontSize: 15.8, color: "#6E5B4F", fontWeight: 600 }}>
                                {c.filename} {c.page_number ? `· p.${c.page_number}` : ""}
                              </span>
                            </div>
                            <div style={{ fontSize: 18, color: "#2D1E15", lineHeight: 1.45 }}>“{c.text}”</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {inspectorTab === "concepts" && (
                  <div>
                    {!activeTurn?.result || activeTurn.result.concepts_identified.length === 0 ? (
                      <div style={{ padding: "40px 10px", textAlign: "center", color: "#6E5B4F", fontSize: 19.5 }}>
                        No concepts identified in the selected answer.
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 17.2, color: "#6E5B4F", fontWeight: 600, marginBottom: 12 }}>
                          Detected conceptual nodes:
                        </div>
                        {activeTurn.result.concepts_identified.map((conceptName) => (
                          <div
                            key={conceptName}
                            style={{
                              padding: "10px 12px",
                              background: "#FAF7F5",
                              borderRadius: 10,
                              border: "1.5px solid #E8DDD5",
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: 19.5, color: "#2D1E15", marginBottom: 4 }}>
                              {conceptName}
                            </div>
                            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                              <button
                                onClick={() => router.push(`/graph?focus=concept_${conceptName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`)}
                                style={{
                                  padding: "4px 9px",
                                  borderRadius: 6,
                                  border: "1px solid #E8DDD5",
                                  background: "#FFFFFF",
                                  fontSize: 16.5,
                                  fontWeight: 600,
                                  color: "#2D1E15",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <Network size={11} /> View in Graph
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {inspectorTab === "flashcards" && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: "#2D1E15" }}>
                        Study Flashcards ({flashcards.length})
                      </span>
                      <button
                        onClick={exportFlashcards}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 6,
                          border: "1px solid #E8DDD5",
                          background: "#FFFFFF",
                          fontSize: 16.5,
                          fontWeight: 600,
                          color: "#2D1E15",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Download size={11} /> {flashcardExportCopied ? "Copied!" : "Export MD"}
                      </button>
                    </div>

                    {flashcards.map((card) => (
                      <div
                        key={card.id}
                        onClick={() =>
                          setFlashcards((prev) =>
                            prev.map((c) => (c.id === card.id ? { ...c, flipped: !c.flipped } : c))
                          )
                        }
                        style={{
                          background: "#FFFFFF",
                          border: "1.5px solid #E8DDD5",
                          borderRadius: 12,
                          padding: 12,
                          marginBottom: 10,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: 15, color: "#8B5E3C", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                          {card.flipped ? "Back: Answer" : "Front: Question"}
                        </div>
                        <div style={{ fontSize: 18.8, color: "#2D1E15", lineHeight: 1.45, fontWeight: 500 }}>
                          {card.flipped ? card.back : card.front}
                        </div>
                        <div style={{ fontSize: 15.8, color: "#6E5B4F", marginTop: 8 }}>
                          {card.source}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ── Citation Detail Modal ── */}
      <AnimatePresence>
        {openCitation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-backdrop"
            onClick={() => setOpenCitation(null)}
          >
            <motion.div
              initial={{ y: 50, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              style={{
                background: "#FFFFFF",
                border: "2px solid #E8DDD5",
                borderRadius: 18,
                padding: 24,
                maxWidth: 500,
                width: "90%",
                boxShadow: "0 20px 40px rgba(45, 30, 21, 0.16)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontSize: 22.5, fontWeight: 700, color: "#2D1E15", margin: 0 }}>
                  {openCitation.concept_name || "Document Citation"}
                </h3>
                <button
                  onClick={() => setOpenCitation(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 27, color: "#6E5B4F" }}
                >
                  <X size={18} />
                </button>
              </div>

              <blockquote
                style={{
                  margin: "0 0 14px",
                  padding: "12px 14px",
                  background: "#FAF7F5",
                  borderLeft: "3px solid #8B5E3C",
                  borderRadius: "0 8px 8px 0",
                  fontSize: 19.5,
                  color: "#2D1E15",
                  lineHeight: 1.5,
                }}
              >
                “{openCitation.text}”
              </blockquote>

              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 18, color: "#6E5B4F", marginBottom: 16 }}>
                <FileText size={14} color="#8B5E3C" />
                <span>
                  {openCitation.filename}
                  {openCitation.page_number && openCitation.page_number > 0 ? ` · page ${openCitation.page_number}` : ""}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`“${openCitation.text}” (${openCitation.filename})`);
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 9999,
                    border: "1.5px solid #E8DDD5",
                    background: "#FFFFFF",
                    fontSize: 18,
                    fontWeight: 600,
                    color: "#2D1E15",
                    cursor: "pointer",
                  }}
                >
                  Copy Citation
                </button>
                <button
                  onClick={() => setOpenCitation(null)}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 9999,
                    border: "none",
                    background: "#362419",
                    fontSize: 18,
                    fontWeight: 600,
                    color: "#FFFFFF",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Answer Card Subcomponent ──
function AnswerCard({
  turn,
  isActive,
  onCite,
  onInspect,
  onMakeFlashcard,
  onAskFollowUp,
}: {
  turn: Turn;
  isActive: boolean;
  onCite: (c: Citation) => void;
  onInspect: () => void;
  onMakeFlashcard: () => void;
  onAskFollowUp: (q: string) => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const result = turn.result!;

  const byIndex = useMemo(
    () => new Map(result.citations.map((c) => [c.index, c])),
    [result.citations]
  );

  const handleCopyAnswer = () => {
    navigator.clipboard.writeText(result.answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const followUps = useMemo(() => {
    const list: string[] = [];
    const firstConcept = result.concepts_identified?.[0];
    if (firstConcept) {
      list.push(`What are the prerequisites for ${firstConcept}?`);
      list.push(`How is ${firstConcept} connected to other concepts?`);
    }
    return list.slice(0, 2);
  }, [result]);

  return (
    <div
      style={{
        alignSelf: "flex-start",
        maxWidth: "96%",
        width: "100%",
        background: "#FFFFFF",
        border: isActive ? "2px solid #8B5E3C" : "2px solid #E8DDD5",
        borderRadius: 16,
        padding: "20px 22px",
        boxShadow: "0 2px 8px rgba(45, 30, 21, 0.04)",
        marginBottom: 16,
      }}
    >
      {/* Header Metadata */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 16.5,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 9999,
              background: "#FAF0E6",
              color: "#8B5E3C",
              border: "1.5px solid #EEDBCB",
            }}
          >
            Type {result.query_type} · {result.query_type_label}
          </span>
          <span
            style={{
              fontSize: 16.5,
              fontWeight: 600,
              padding: "3px 10px",
              borderRadius: 9999,
              background: "#FAF7F5",
              color: "#6E5B4F",
              border: "1.5px solid #E8DDD5",
            }}
          >
            {result.retriever_used}
          </span>
        </div>

        <button
          onClick={onInspect}
          style={{
            padding: "4px 10px",
            borderRadius: 6,
            background: "#FAF7F5",
            border: "1px solid #E8DDD5",
            fontSize: 17.2,
            fontWeight: 600,
            color: "#6E5B4F",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <FileText size={12} /> Inspect Evidence
        </button>
      </div>

      {/* Answer Body */}
      <div style={{ fontSize: 21.8, lineHeight: 1.65, color: "#2D1E15", marginBottom: 14 }}>
        {renderWithCitations(result.answer, byIndex, onCite)}
      </div>

      {/* Action Toolbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid #F3ECE6", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleCopyAnswer}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "#FAF7F5",
              border: "1px solid #E8DDD5",
              fontSize: 17.2,
              fontWeight: 600,
              color: "#6E5B4F",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy answer"}
          </button>
          <button
            onClick={onMakeFlashcard}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "#FAF7F5",
              border: "1px solid #E8DDD5",
              fontSize: 17.2,
              fontWeight: 600,
              color: "#6E5B4F",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Bookmark size={12} /> Make Flashcard
          </button>
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.answer));
              }
            }}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: "#FAF7F5",
              border: "1px solid #E8DDD5",
              fontSize: 17.2,
              fontWeight: 600,
              color: "#6E5B4F",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Volume2 size={12} /> Read aloud
          </button>
        </div>

        {followUps.length > 0 && (
          <div style={{ display: "flex", gap: 6 }}>
            {followUps.map((fu) => (
              <button
                key={fu}
                onClick={() => onAskFollowUp(fu)}
                style={{
                  padding: "3px 10px",
                  borderRadius: 9999,
                  background: "#FAF4EF",
                  border: "1px solid #E8DDD5",
                  fontSize: 16.5,
                  color: "#8B5E3C",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {fu}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function renderWithCitations(
  text: string,
  byIndex: Map<number, Citation>,
  onCite: (c: Citation) => void
) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const idx = parseInt(match[1], 10);
      const citation = byIndex.get(idx);
      return (
        <button
          key={i}
          onClick={() => citation && onCite(citation)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#8B5E3C",
            fontWeight: 700,
            fontSize: "0.9em",
            cursor: "pointer",
            margin: "0 2px",
          }}
          title={citation ? `${citation.filename} (p.${citation.page_number})` : `Citation [${idx}]`}
        >
          {part}
        </button>
      );
    }
    return part;
  });
}
