"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  HelpCircle,
  RotateCw,
  CheckCircle2,
  XCircle,
  Volume2,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Network,
  Check,
  Sparkles,
  ShieldCheck,
  Quote,
  Bookmark,
  Award,
  Target,
  AlertTriangle,
  ArrowRight,
  Trophy,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import {
  explainConcept,
  getGraph,
  getLearningPath,
  getQuiz,
  submitQuiz,
  updateConceptProgress,
  type AskResponse,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { ConceptNode } from "@/lib/graph";

interface QuizQuestionItem {
  id: string;
  concept_id: string;
  concept_name: string;
  category: string;
  question_type: "multiple_choice" | "short_answer" | "relationship";
  question: string;
  options?: { id: string; text: string }[];
  correct_id?: string;
  correct_keywords?: string[];
  explanation: string;
  key_takeaway: string;
  citations: { filename: string; page_number?: number; text?: string }[];
}

export default function LearnPage() {
  const router = useRouter();
  // Populated from the graph; nothing is shown until the server answers.
  const [concepts, setConcepts] = useState<ConceptNode[]>([]);
  const [selectedId, setSelectedId] = useState("adam_optimizer");
  const [path, setPath] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"explain" | "flashcard" | "quiz">("explain");

  // Explanation state
  const [explainMode, setExplainMode] = useState<"simple" | "step_by_step" | "source_example" | "compare">("simple");
  const [explanation, setExplanation] = useState<AskResponse | null>(null);
  const [explainBusy, setExplainBusy] = useState(false);

  // Flashcard state
  const [isFlipped, setIsFlipped] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);

  // Quiz state
  const [quizType, setQuizType] = useState<"multiple_choice" | "short_answer" | "relationship">("multiple_choice");
  const [quizQuestionIdx, setQuizQuestionIdx] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [quiz, setQuiz] = useState<any>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<any>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [quizHistory, setQuizHistory] = useState<
    Array<{
      conceptId: string;
      conceptName: string;
      category: string;
      question: string;
      userAnswer: string;
      isCorrect: boolean;
      explanation: string;
      keyTakeaway: string;
      citations?: any[];
    }>
  >([]);

  // Status & error
  const [conceptStatus, setConceptStatus] = useState<Record<string, "learned" | "review" | "dont_know" | "revisit">>({
    loss_function: "learned",
    gradient_vector: "learned",
    adam_optimizer: "review",
  });
  const [deckFilter, setDeckFilter] = useState<"all" | "dont_know" | "review" | "learned">("all");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    getGraph()
      .then((data) => {
        if (data.nodes && data.nodes.length > 0) {
          setConcepts(data.nodes);
          // Prefer keeping adam_optimizer if present, else first node
          const target = data.nodes.find((n) => n.canonical_name.toLowerCase().includes("adam")) || data.nodes[0];
          setSelectedId(target.concept_id);
          loadPath(target.concept_id);
          loadExplanation(target.concept_id, "simple");
          loadQuiz(target.concept_id, "multiple_choice");
        }
      })
      .catch(() => {
        // Fallback to default demo concept state
        loadExplanation("adam_optimizer", "simple");
      });
  }, [router]);

  const activeConcept = useMemo(
    () => concepts.find((c) => c.concept_id === selectedId) || concepts[0] || null,
    [concepts, selectedId]
  );

  const deckStats = useMemo(() => {
    let dontKnow = 0;
    let review = 0;
    let learned = 0;
    concepts.forEach((c) => {
      const st = conceptStatus[c.concept_id];
      if (st === "learned") learned++;
      else if (st === "review" || st === "revisit") review++;
      else if (st === "dont_know") dontKnow++;
    });
    return {
      dontKnow,
      review,
      learned,
      total: concepts.length,
    };
  }, [concepts, conceptStatus]);

  const activeDeck = useMemo(() => {
    if (deckFilter === "all") return concepts;
    return concepts.filter((c) => {
      const st = conceptStatus[c.concept_id];
      if (deckFilter === "learned") return st === "learned";
      if (deckFilter === "review") return st === "review" || st === "revisit";
      if (deckFilter === "dont_know") return st === "dont_know";
      return false;
    });
  }, [concepts, conceptStatus, deckFilter]);

  const currentFlashcard = useMemo(() => {
    if (activeDeck.length === 0) return null;
    const safeIdx = Math.min(Math.max(0, cardIndex), activeDeck.length - 1);
    return activeDeck[safeIdx];
  }, [activeDeck, cardIndex]);

  async function loadPath(id: string) {
    try {
      const p = await getLearningPath(id);
      setPath(p);
    } catch {
      // safe fallback
    }
  }

  async function loadExplanation(id: string, mode: "simple" | "step_by_step" | "source_example" | "compare") {
    setExplainBusy(true);
    setExplainMode(mode);
    try {
      const res = await explainConcept(id, mode);
      if (res && res.answer) {
        setExplanation(res);
      }
      await updateConceptProgress(id, "started", 0.4);
    } catch {
      // In demo mode or if backend call fails, retain realistic explanation
      if (id === "adam_optimizer" || !explanation) {
        setExplanation(null);
      }
    } finally {
      setExplainBusy(false);
    }
  }

  const currentQuizList = useMemo(() => {
    return [] as QuizQuestionItem[];
  }, [quizType]);

  const pct = score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0;

  const gradeInfo = useMemo(() => {
    if (pct >= 90) {
      return {
        label: "Mastery Level",
        icon: "🏆",
        heading: "Outstanding Concept Mastery!",
        message: "You have demonstrated thorough and accurate comprehension of core optimization principles and mathematical formulations.",
        bg: "#DCFCE7",
        border: "#86EFAC",
        text: "#15803D",
      };
    }
    if (pct >= 70) {
      return {
        label: "Proficient Level",
        icon: "🌟",
        heading: "Strong Proficiency with Focused Nuances",
        message: "Great work! You have built a solid foundation. Reviewing the recommended topics below will help solidify full mastery.",
        bg: "#F5EEE8",
        border: "#DFC9B5",
        text: "#4A3024",
      };
    }
    if (pct >= 50) {
      return {
        label: "Developing Level",
        icon: "💡",
        heading: "Good Effort — Core Principles Developing",
        message: "You have grasped basic concepts. Targeted review of the recommended improvement topics below will reinforce key formulas and relationships.",
        bg: "#FEF3C7",
        border: "#FCD34D",
        text: "#B45309",
      };
    }
    return {
      label: "Needs Practice",
      heading: "Foundational Practice Recommended",
      message: "Optimization concepts build iteratively on one another. Take some time to review the flashcards and evidence citations below.",
      bg: "#FEE2E2",
      border: "#FCA5A5",
      text: "#DC2626",
    };
  }, [pct]);

  const improvementTopics = useMemo(() => {
    const list: Array<{
      conceptId: string;
      conceptName: string;
      category: string;
      reason: string;
      missedQuestion?: string;
      userAnswer?: string;
      keyTakeaway: string;
      citations?: any[];
    }> = [];

    const seenConceptIds = new Set<string>();

    // 1. Any missed question in quiz history
    quizHistory.forEach((h) => {
      if (!h.isCorrect && !seenConceptIds.has(h.conceptId)) {
        seenConceptIds.add(h.conceptId);
        list.push({
          conceptId: h.conceptId,
          conceptName: h.conceptName,
          category: h.category,
          reason: "Missed in Quiz",
          missedQuestion: h.question,
          userAnswer: h.userAnswer,
          keyTakeaway: h.keyTakeaway,
          citations: h.citations,
        });
      }
    });

    // 2. Also check workspace concepts marked 'dont_know' or 'review'
    concepts.forEach((c) => {
      const st = conceptStatus[c.concept_id];
      if ((st === "dont_know" || st === "review" || st === "revisit") && !seenConceptIds.has(c.concept_id)) {
        seenConceptIds.add(c.concept_id);
        list.push({
          conceptId: c.concept_id,
          conceptName: c.canonical_name,
          category: c.category,
          reason: st === "dont_know" ? "Marked as 'Don't Know' in Flashcards" : "Flagged for Review in Flashcards",
          keyTakeaway: c.evidence?.[0] || c.definition,
          citations: c.filenames?.map((f, i) => ({ filename: f, page_number: c.page_numbers?.[i] })),
        });
      }
    });

    return list;
  }, [quizHistory, concepts, conceptStatus]);

  const masteredTopics = useMemo(() => {
    const list: Array<{
      conceptId: string;
      conceptName: string;
      category: string;
    }> = [];
    const seen = new Set<string>();

    quizHistory.forEach((h) => {
      if (h.isCorrect && !seen.has(h.conceptId)) {
        seen.add(h.conceptId);
        list.push({
          conceptId: h.conceptId,
          conceptName: h.conceptName,
          category: h.category,
        });
      }
    });

    return list;
  }, [quizHistory]);

  async function loadQuiz(id: string, type: "multiple_choice" | "short_answer" | "relationship", questionIdx = 0) {
    setQuizBusy(true);
    setQuizType(type);
    setAnswer("");
    setFeedback(null);
    setQuizQuestionIdx(questionIdx);

    const matchingList: QuizQuestionItem[] = [];
    const targetQ = matchingList.find((q) => q.concept_id === id) || matchingList[questionIdx] || matchingList[0];

    try {
      const q = await getQuiz(id, type);
      if (q && q.question) {
        setQuiz({
          ...targetQ,
          ...q,
          concept_id: q.concept_id || targetQ?.concept_id || id,
          concept_name: q.concept_name || targetQ?.concept_name || concepts.find((c) => c.concept_id === id)?.canonical_name || "Optimization Concept",
          category: q.category || targetQ?.category || "optimization",
          key_takeaway: targetQ?.key_takeaway || "Review core concept fundamentals and source citations.",
        });
      } else {
        setQuiz(targetQ);
      }
    } catch {
      setQuiz(targetQ);
    } finally {
      setQuizBusy(false);
    }
  }

  function handleSelectConcept(id: string) {
    setSelectedId(id);
    setIsFlipped(false);
    const idx = concepts.findIndex((c) => c.concept_id === id);
    if (idx !== -1) setCardIndex(idx);
    loadPath(id);
    loadExplanation(id, explainMode);
    loadQuiz(id, quizType);
  }

  async function handleMarkProgress(
    status: "learned" | "review" | "dont_know" | "revisit",
    targetIdParam?: string
  ) {
    const targetId = targetIdParam || selectedId;
    if (!targetId) return;
    const normalizedStatus = status === "revisit" ? "review" : status;
    setConceptStatus((prev) => ({ ...prev, [targetId]: normalizedStatus }));
    try {
      const conf = normalizedStatus === "learned" ? 1.0 : normalizedStatus === "review" ? 0.5 : 0.1;
      await updateConceptProgress(targetId, normalizedStatus, conf);
    } catch {
      // safe
    }
  }

  async function handleQuizSubmit() {
    if (!quiz || !answer || quizBusy) return;
    setQuizBusy(true);

    const qType = quiz.question_type || quizType;
    let isCorrect = false;

    if (qType === "short_answer") {
      const keywords = quiz.correct_keywords || ["gradient", "derivative"];
      isCorrect = keywords.some((k: string) => answer.toLowerCase().includes(k.toLowerCase()));
    } else {
      const correctId = quiz.correct_id || "opt_a";
      isCorrect = answer === correctId;
    }

    try {
      const fb = await submitQuiz(quiz.concept_id || selectedId, qType, answer);
      const resCorrect = typeof fb?.correct === "boolean" ? fb.correct : isCorrect;
      const resFb = {
        correct: resCorrect,
        explanation: fb?.explanation || quiz.explanation,
        citations: fb?.citations || quiz.citations || [],
      };
      setFeedback(resFb);
      setScore((s) => ({
        correct: s.correct + (resCorrect ? 1 : 0),
        total: s.total + 1,
      }));

      const selectedOptionText = quiz.options?.find((o: any) => (o.id ?? o) === answer)?.text || answer;

      setQuizHistory((prev) => [
        ...prev,
        {
          conceptId: quiz.concept_id || selectedId,
          conceptName: quiz.concept_name || concepts.find((c) => c.concept_id === quiz.concept_id)?.canonical_name || "Concept",
          category: quiz.category || "optimization",
          question: quiz.question,
          userAnswer: selectedOptionText,
          isCorrect: resCorrect,
          explanation: resFb.explanation,
          keyTakeaway: quiz.key_takeaway || resFb.explanation,
          citations: resFb.citations,
        },
      ]);

      if (resCorrect) {
        handleMarkProgress("learned", quiz.concept_id || selectedId);
      } else {
        handleMarkProgress("review", quiz.concept_id || selectedId);
      }
    } catch {
      const resFb = {
        correct: isCorrect,
        explanation: quiz.explanation || (isCorrect ? "Correct! Good understanding of the concept." : "Needs review. Check the evidence citations."),
        citations: quiz.citations || [],
      };
      setFeedback(resFb);
      setScore((s) => ({
        correct: s.correct + (isCorrect ? 1 : 0),
        total: s.total + 1,
      }));

      const selectedOptionText = quiz.options?.find((o: any) => (o.id ?? o) === answer)?.text || answer;

      setQuizHistory((prev) => [
        ...prev,
        {
          conceptId: quiz.concept_id || selectedId,
          conceptName: quiz.concept_name || concepts.find((c) => c.concept_id === quiz.concept_id)?.canonical_name || "Concept",
          category: quiz.category || "optimization",
          question: quiz.question,
          userAnswer: selectedOptionText,
          isCorrect: isCorrect,
          explanation: resFb.explanation,
          keyTakeaway: quiz.key_takeaway || resFb.explanation,
          citations: resFb.citations,
        },
      ]);

      if (isCorrect) {
        handleMarkProgress("learned", quiz.concept_id || selectedId);
      } else {
        handleMarkProgress("review", quiz.concept_id || selectedId);
      }
    } finally {
      setQuizBusy(false);
    }
  }

  function handleNextQuestion() {
    const matchingList: QuizQuestionItem[] = [];
    const nextIdx = quizQuestionIdx + 1;
    if (nextIdx >= matchingList.length) {
      setQuizFinished(true);
    } else {
      setQuizQuestionIdx(nextIdx);
      const nextQ = matchingList[nextIdx];
      setSelectedId(nextQ.concept_id);
      loadQuiz(nextQ.concept_id, quizType, nextIdx);
    }
  }

  function handleFinishQuiz() {
    setQuizFinished(true);
  }

  function handleRetakeQuiz() {
    setQuizFinished(false);
    setQuizQuestionIdx(0);
    setScore({ correct: 0, total: 0 });
    setQuizHistory([]);
    setAnswer("");
    setFeedback(null);
    const matchingList: QuizQuestionItem[] = [];
    const firstQ = matchingList[0];
    if (firstQ) {
      setSelectedId(firstQ.concept_id);
      loadQuiz(firstQ.concept_id, quizType, 0);
    }
  }

  function handleGoToFlashcard(conceptId: string) {
    handleSelectConcept(conceptId);
    setDeckFilter("all");
    const idx = concepts.findIndex((c) => c.concept_id === conceptId);
    if (idx !== -1) setCardIndex(idx);
    setActiveTab("flashcard");
  }

  function handleGoToExplanation(conceptId: string) {
    handleSelectConcept(conceptId);
    setActiveTab("explain");
  }

  function handleChangeQuizType(type: "multiple_choice" | "short_answer" | "relationship") {
    setQuizType(type);
    setQuizQuestionIdx(0);
    setAnswer("");
    setFeedback(null);
    setQuizFinished(false);
    const matchingList: QuizQuestionItem[] = [];
    const firstQ = matchingList[0];
    if (firstQ) {
      setSelectedId(firstQ.concept_id);
      loadQuiz(firstQ.concept_id, type, 0);
    } else {
      loadQuiz(selectedId, type, 0);
    }
  }

  function handleSelectDeckFilter(filter: "all" | "dont_know" | "review" | "learned") {
    setDeckFilter(filter);
    setCardIndex(0);
    setIsFlipped(false);
    const filtered = concepts.filter((c) => {
      if (filter === "all") return true;
      const st = conceptStatus[c.concept_id];
      if (filter === "learned") return st === "learned";
      if (filter === "review") return st === "review" || st === "revisit";
      if (filter === "dont_know") return st === "dont_know";
      return false;
    });
    if (filtered.length > 0) {
      setSelectedId(filtered[0].concept_id);
    }
  }

  function handleNavigateCard(direction: "prev" | "next") {
    if (activeDeck.length === 0) return;
    let newIdx = direction === "next" ? cardIndex + 1 : cardIndex - 1;
    if (newIdx < 0) newIdx = activeDeck.length - 1;
    if (newIdx >= activeDeck.length) newIdx = 0;
    setCardIndex(newIdx);
    setIsFlipped(false);
    const target = activeDeck[newIdx];
    if (target) {
      setSelectedId(target.concept_id);
      loadPath(target.concept_id);
      loadExplanation(target.concept_id, explainMode);
      loadQuiz(target.concept_id, quizType);
    }
  }

  // Keyboard navigation for Flashcards
  useEffect(() => {
    if (activeTab !== "flashcard") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT") {
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setIsFlipped((f) => !f);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleNavigateCard("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNavigateCard("next");
      } else if (e.key === "1") {
        e.preventDefault();
        handleMarkProgress("dont_know");
        handleNavigateCard("next");
      } else if (e.key === "2") {
        e.preventDefault();
        handleMarkProgress("review");
        handleNavigateCard("next");
      } else if (e.key === "3" || e.key.toLowerCase() === "m") {
        e.preventDefault();
        handleMarkProgress("learned");
        handleNavigateCard("next");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, cardIndex, activeDeck, selectedId]);

  function handleReadAloud(text?: string) {
    if (typeof window !== "undefined" && text) {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/\[\d+\]/g, "");
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(cleanText));
    }
  }

  function renderExplanationWithCitations(text: string) {
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, i) => {
      if (/^\[\d+\]$/.test(part)) {
        return (
          <span
            key={i}
            style={{
              color: "#B98259",
              fontWeight: 700,
              fontSize: "0.95em",
              margin: "0 2px",
              cursor: "pointer",
            }}
            title={`Verified citation grounding ${part}`}
          >
            {part}
          </span>
        );
      }
      return part;
    });
  }

  // Only the citations the server actually returned. Falling back to a canned
  // set attached real-looking sources to an explanation that had none.
  const activeCitations = explanation?.citations ?? [];

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column" }}>
      <Navbar />

      <main style={{ maxWidth: "min(1560px, 96vw)", margin: "0 auto", width: "100%", padding: "76px clamp(16px, 3vw, 40px) 60px", boxSizing: "border-box", flex: 1 }}>
        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 16px",
              borderRadius: 10,
              background: "#FDF5F5",
              border: "2px solid #F5C6C6",
              color: "#B91C1C",
              fontSize: 18.8,
            }}
          >
            {error}
          </div>
        )}

        {/* 1. Top Header & Concept Selector Row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 14,
            marginBottom: 20,
          }}
        >
          {/* Left: Book icon + Concept Selector dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 280, flex: 1, maxWidth: 440 }}>
            <BookOpen size={22} color="#171514" strokeWidth={2.2} />
            <div
              style={{
                position: "relative",
                flex: 1,
                height: 42,
                background: "#FFFFFF",
                border: "2px solid #EAE4DE",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                padding: "0 14px",
                cursor: "pointer",
                transition: "border-color 0.15s ease",
              }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = "#171514")}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = "#EAE4DE")}
            >
              <select
                value={selectedId}
                onChange={(e) => handleSelectConcept(e.target.value)}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 21,
                  fontWeight: 700,
                  color: "#171514",
                  cursor: "pointer",
                  appearance: "none",
                  paddingRight: 24,
                }}
              >
                {concepts.map((c) => (
                  <option key={c.concept_id} value={c.concept_id}>
                    {c.canonical_name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} color="#77716D" style={{ position: "absolute", right: 14, pointerEvents: "none" }} />
            </div>
          </div>
        </motion.div>

        {/* 2. VERIFIED PREREQUISITE ROADMAP Box */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="hover-card-lift"
          style={{
            background: "#FFFFFF",
            border: "2px solid #EAE4DE",
            borderRadius: 16,
            padding: "16px 20px",
            marginBottom: 22,
            boxShadow: "0 1px 3px rgba(45, 30, 21, 0.03)",
          }}
        >
          <div
            style={{
              fontSize: 16.5,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#77716D",
              marginBottom: 12,
            }}
          >
            VERIFIED PREREQUISITE ROADMAP
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {/* Node 1: Loss Function (Completed) */}
            <button
              onClick={() => handleSelectConcept("loss_function")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 15px",
                borderRadius: 9999,
                background: "#F5EEE8",
                border: "1.5px solid #EAE4DE",
                fontSize: 18.8,
                fontWeight: 600,
                color: "#171514",
                cursor: "pointer",
              }}
            >
              <CheckCircle2 size={15} color="#B98259" />
              Loss Function
            </button>

            <span style={{ color: "#77716D", fontSize: 19.5 }}>→</span>

            {/* Node 2: Gradient Vector (Completed) */}
            <button
              onClick={() => handleSelectConcept("gradient_vector")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 15px",
                borderRadius: 9999,
                background: "#F5EEE8",
                border: "1.5px solid #EAE4DE",
                fontSize: 18.8,
                fontWeight: 600,
                color: "#171514",
                cursor: "pointer",
              }}
            >
              <CheckCircle2 size={15} color="#B98259" />
              Gradient Vector
            </button>

            <span style={{ color: "#77716D", fontSize: 19.5 }}>→</span>

            {/* Node 3: Current Active Concept (Highlighted with brown border) */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 18px",
                borderRadius: 9999,
                background: "#FFF9F5",
                border: "2px solid #B98259",
                fontSize: 19.5,
                fontWeight: 700,
                color: "#171514",
                boxShadow: "0 1px 4px rgba(196, 125, 59, 0.12)",
              }}
            >
              <Network size={16} color="#B98259" />
              {activeConcept?.canonical_name || "Adam Optimizer"}
            </div>

            <span style={{ color: "#77716D", fontSize: 19.5 }}>→</span>

            {/* Node 4: Gradient Descent */}
            <button
              onClick={() => handleSelectConcept("gradient_descent")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 15px",
                borderRadius: 9999,
                background: "#FAF7F4",
                border: "1.5px solid #EAE4DE",
                fontSize: 18.8,
                fontWeight: 500,
                color: "#77716D",
                cursor: "pointer",
              }}
            >
              Gradient Descent
            </button>

            <span style={{ color: "#77716D", fontSize: 19.5 }}>→</span>

            {/* Node 5: Momentum */}
            <button
              onClick={() => handleSelectConcept("momentum")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 15px",
                borderRadius: 9999,
                background: "#FAF7F4",
                border: "1.5px solid #EAE4DE",
                fontSize: 18.8,
                fontWeight: 500,
                color: "#77716D",
                cursor: "pointer",
              }}
            >
              Momentum
            </button>
          </div>
        </motion.div>

        {/* 3. Navigation Tabs (Explanations, 3D Flashcards, Practice Quiz) */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => setActiveTab("explain")}
            style={{
              padding: "10px 20px",
              borderRadius: 12,
              border: activeTab === "explain" ? "2px solid #E2D3C5" : "2px solid #EAE4DE",
              background: activeTab === "explain" ? "#F5EEE8" : "#FFFFFF",
              color: activeTab === "explain" ? "#171514" : "#77716D",
              fontSize: 20.2,
              fontWeight: activeTab === "explain" ? 700 : 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              position: "relative",
              boxShadow: activeTab === "explain" ? "0 2px 6px rgba(45, 30, 21, 0.04)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            <BookOpen size={16} color={activeTab === "explain" ? "#171514" : "#77716D"} />
            Explanations
            {activeTab === "explain" && (
              <div
                style={{
                  position: "absolute",
                  bottom: -2,
                  left: 20,
                  right: 20,
                  height: 2.5,
                  background: "#B98259",
                  borderRadius: "2px 2px 0 0",
                }}
              />
            )}
          </button>

          <button
            onClick={() => setActiveTab("flashcard")}
            style={{
              padding: "10px 20px",
              borderRadius: 12,
              border: activeTab === "flashcard" ? "2px solid #E2D3C5" : "2px solid #EAE4DE",
              background: activeTab === "flashcard" ? "#F5EEE8" : "#FFFFFF",
              color: activeTab === "flashcard" ? "#171514" : "#77716D",
              fontSize: 20.2,
              fontWeight: activeTab === "flashcard" ? 700 : 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              position: "relative",
              transition: "all 0.15s ease",
            }}
          >
            <Layers size={16} color={activeTab === "flashcard" ? "#171514" : "#77716D"} />
            3D Flashcards
          </button>

          <button
            onClick={() => setActiveTab("quiz")}
            style={{
              padding: "10px 20px",
              borderRadius: 12,
              border: activeTab === "quiz" ? "2px solid #E2D3C5" : "2px solid #EAE4DE",
              background: activeTab === "quiz" ? "#F5EEE8" : "#FFFFFF",
              color: activeTab === "quiz" ? "#171514" : "#77716D",
              fontSize: 20.2,
              fontWeight: activeTab === "quiz" ? 700 : 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              position: "relative",
              transition: "all 0.15s ease",
            }}
          >
            <HelpCircle size={16} color={activeTab === "quiz" ? "#171514" : "#77716D"} />
            Practice Quiz
          </button>
        </div>

        {/* Tab 1: Explanations */}
        {activeTab === "explain" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {/* Explanation Sub-Modes Pills */}
            <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              {[
                { id: "simple", label: "Simple" },
                { id: "step_by_step", label: "Step-by-Step" },
                { id: "source_example", label: "Source Example" },
                { id: "compare", label: "Comparative" },
              ].map((m) => {
                const isActive = explainMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => loadExplanation(selectedId, m.id as any)}
                    style={{
                      height: 34,
                      padding: "0 18px",
                      borderRadius: 9999,
                      border: isActive ? "1.5px solid #DFC9B5" : "1.5px solid #EAE4DE",
                      background: isActive ? "#F5EEE8" : "#FFFFFF",
                      color: isActive ? "#171514" : "#77716D",
                      fontSize: 18.8,
                      fontWeight: isActive ? 700 : 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseOver={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = "#171514";
                        e.currentTarget.style.background = "#FAF7F4";
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = "#EAE4DE";
                        e.currentTarget.style.background = "#FFFFFF";
                      }
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Main Explanation Card */}
            {explainBusy ? (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "2px solid #EAE4DE",
                  borderRadius: 18,
                  padding: "44px 24px",
                  textAlign: "center",
                  color: "#77716D",
                  fontSize: 21,
                }}
              >
                Generating grounded {explainMode.replace("_", " ")} explanation…
              </div>
            ) : explanation ? (
              <div
                style={{
                  background: "#FFFFFF",
                  border: "2px solid #EAE4DE",
                  borderRadius: 18,
                  padding: 26,
                  boxShadow: "0 1px 4px rgba(45, 30, 21, 0.03)",
                }}
              >
                {/* Badges Row */}
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: 9999,
                      background: "#FAF7F4",
                      border: "1.5px solid #EAE4DE",
                      fontSize: 16.5,
                      fontWeight: 700,
                      color: "#77716D",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    Mode: {explainMode.replace(/_/g, " ")}
                  </span>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: 9999,
                      background: "#FAF7F4",
                      border: "1.5px solid #EAE4DE",
                      fontSize: 16.5,
                      fontWeight: 600,
                      color: "#77716D",
                    }}
                  >
                    {activeCitations.length} cited source groundings
                  </span>
                </div>

                {/* Explanation Body Paragraph */}
                <div
                  style={{
                    fontSize: 22.5,
                    lineHeight: 1.65,
                    color: "#171514",
                    marginTop: 18,
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  {renderExplanationWithCitations(
                    explanation.answer ||
                    "Gradient Descent is an iterative optimization technique that adjusts model weights to minimize an objective loss function [1]. The algorithm traverses the cost surface by evaluating partial derivatives and stepping along the negative gradient direction [2]."
                  )}
                </div>

                {/* Read Aloud Button */}
                <div style={{ marginTop: 18, marginBottom: 24 }}>
                  <button
                    onClick={() => handleReadAloud(explanation.answer)}
                    style={{
                      height: 36,
                      padding: "0 18px",
                      borderRadius: 9999,
                      border: "1.5px solid #EAE4DE",
                      background: "#FFFFFF",
                      color: "#171514",
                      fontSize: 18.8,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.15s ease",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = "#171514";
                      e.currentTarget.style.background = "#FAF7F4";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = "#EAE4DE";
                      e.currentTarget.style.background = "#FFFFFF";
                    }}
                  >
                    <Volume2 size={15} color="#171514" />
                    Read aloud
                  </button>
                </div>

                {/* Separator Divider */}
                <div style={{ borderTop: "1px solid #F0E8E1", marginBottom: 20 }} />

                {/* Verified Evidence Groundings */}
                <div>
                  <div
                    style={{
                      fontSize: 16.5,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#77716D",
                      marginBottom: 16,
                    }}
                  >
                    VERIFIED EVIDENCE GROUNDINGS
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
                    {/* Vertical connecting line between citation badges */}
                    {activeCitations.length > 1 && (
                      <div
                        style={{
                          position: "absolute",
                          left: 14,
                          top: 26,
                          bottom: 26,
                          width: 2,
                          background: "#EAE4DE",
                          zIndex: 1,
                        }}
                      />
                    )}

                    {activeCitations.map((c, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 14,
                          position: "relative",
                          zIndex: 2,
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: "#F5EEE8",
                            color: "#6E452B",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 19.5,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {idx + 1}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 20.2, color: "#171514", lineHeight: 1.5, fontWeight: 500 }}>
                            “{c.text}”
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 18,
                              color: "#77716D",
                              marginTop: 4,
                            }}
                          >
                            <FileText size={13} color="#B98259" />
                            <span>
                              {c.filename} {c.page_number ? `· p${c.page_number}` : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>
        )}

        {/* Tab 2: 3D Flashcards */}
        {activeTab === "flashcard" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
            {/* 1. Category / Status Filter Section */}
            <div
              style={{
                maxWidth: 640,
                margin: "0 auto 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {/* All Cards */}
              <button
                onClick={() => handleSelectDeckFilter("all")}
                style={{
                  padding: "8px 18px",
                  borderRadius: 9999,
                  border: deckFilter === "all" ? "2px solid #4A3024" : "1.5px solid #EAE1D7",
                  background: deckFilter === "all" ? "#4A3024" : "#FFFFFF",
                  color: deckFilter === "all" ? "#FFFFFF" : "#4A3024",
                  fontSize: 18.8,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.15s ease",
                  boxShadow: deckFilter === "all" ? "0 2px 8px rgba(74, 48, 36, 0.2)" : "none",
                }}
              >
                <Layers size={16} />
                All Cards ({deckStats.total})
              </button>

              {/* I Don't Know Section (Red) */}
              <button
                onClick={() => handleSelectDeckFilter("dont_know")}
                style={{
                  padding: "8px 18px",
                  borderRadius: 9999,
                  border: deckFilter === "dont_know" ? "2px solid #DC2626" : "1.5px solid #FCA5A5",
                  background: deckFilter === "dont_know" ? "#DC2626" : "#FEF2F2",
                  color: deckFilter === "dont_know" ? "#FFFFFF" : "#DC2626",
                  fontSize: 18.8,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.15s ease",
                  boxShadow: deckFilter === "dont_know" ? "0 2px 8px rgba(220, 38, 38, 0.25)" : "none",
                }}
              >
                <XCircle size={16} strokeWidth={2.4} />
                I Don't Know ({deckStats.dontKnow})
              </button>

              {/* Marked for Review Section (Amber) */}
              <button
                onClick={() => handleSelectDeckFilter("review")}
                style={{
                  padding: "8px 18px",
                  borderRadius: 9999,
                  border: deckFilter === "review" ? "2px solid #D97706" : "1.5px solid #FCD34D",
                  background: deckFilter === "review" ? "#D97706" : "#FFFBEB",
                  color: deckFilter === "review" ? "#FFFFFF" : "#B45309",
                  fontSize: 18.8,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.15s ease",
                  boxShadow: deckFilter === "review" ? "0 2px 8px rgba(217, 119, 6, 0.25)" : "none",
                }}
              >
                <Bookmark size={16} strokeWidth={2.4} />
                Marked for Review ({deckStats.review})
              </button>

              {/* Know This Section (Green) */}
              <button
                onClick={() => handleSelectDeckFilter("learned")}
                style={{
                  padding: "8px 18px",
                  borderRadius: 9999,
                  border: deckFilter === "learned" ? "2px solid #16A34A" : "1.5px solid #86EFAC",
                  background: deckFilter === "learned" ? "#16A34A" : "#F0FDF4",
                  color: deckFilter === "learned" ? "#FFFFFF" : "#15803D",
                  fontSize: 18.8,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "all 0.15s ease",
                  boxShadow: deckFilter === "learned" ? "0 2px 8px rgba(220, 163, 74, 0.25)" : "none",
                }}
              >
                <Check size={16} strokeWidth={3} />
                Know This ({deckStats.learned})
              </button>
            </div>

            {/* Check if current filter has cards */}
            {activeDeck.length === 0 ? (
              <div
                style={{
                  maxWidth: 640,
                  margin: "30px auto",
                  padding: "40px 24px",
                  textAlign: "center",
                  background: "#FAF7F3",
                  border: "2px dashed #E0D5CB",
                  borderRadius: 20,
                }}
              >
                <BookOpen size={36} color="#B98259" style={{ margin: "0 auto 12px" }} />
                <h3 style={{ fontSize: 24, fontWeight: 700, color: "#2C1810", margin: "0 0 8px" }}>
                  No cards in "{deckFilter === "dont_know" ? "I Don't Know" : deckFilter === "review" ? "Marked for Review" : "Know This"}" yet
                </h3>
                <p style={{ fontSize: 18, color: "#77716D", margin: "0 0 18px" }}>
                  Use the assessment buttons below any card to categorize concepts into this review section.
                </p>
                <button
                  onClick={() => handleSelectDeckFilter("all")}
                  style={{
                    padding: "10px 24px",
                    borderRadius: 9999,
                    background: "#4A3024",
                    color: "#FFFFFF",
                    border: "none",
                    fontSize: 18.8,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  View All Cards
                </button>
              </div>
            ) : (
              (() => {
                const currentCard = currentFlashcard || activeDeck[0];
                const currentCardStatus = conceptStatus[currentCard.concept_id];

                // Dynamic theme colors for the current card
                let cardBorderColor = "#EAE1D8";
                let cardCategoryBg = "#FAF4EE";
                let cardCategoryBorder = "#EFE4D8";
                let cardCategoryColor = "#9C5B28";

                if (currentCardStatus === "dont_know") {
                  cardBorderColor = "#FCA5A5";
                  cardCategoryBg = "#FFF5F5";
                  cardCategoryBorder = "#FED7D7";
                  cardCategoryColor = "#DC2626";
                } else if (currentCardStatus === "review" || currentCardStatus === "revisit") {
                  cardBorderColor = "#FCD34D";
                  cardCategoryBg = "#FFFDF5";
                  cardCategoryBorder = "#FEF3C7";
                  cardCategoryColor = "#B45309";
                } else if (currentCardStatus === "learned") {
                  cardBorderColor = "#86EFAC";
                  cardCategoryBg = "#F4FDF7";
                  cardCategoryBorder = "#DCFCE7";
                  cardCategoryColor = "#15803D";
                }

                return (
                  <>
                    {/* Top Deck Info & Animated Progress Bar */}
                    <div
                      style={{
                        maxWidth: 640,
                        margin: "0 auto 18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 14,
                        padding: "0 6px",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          background: "#F7F2EC",
                          border: "1px solid #EAE1D7",
                          borderRadius: 9999,
                          padding: "7px 16px",
                          fontSize: 17.5,
                          fontWeight: 700,
                          color: "#4A3024",
                        }}
                      >
                        <Layers size={16} color="#4A3024" />
                        Card {cardIndex + 1} of {activeDeck.length}
                      </div>

                      {/* Progress Track */}
                      <div
                        style={{
                          flex: 1,
                          maxWidth: 240,
                          height: 8,
                          background: "#EAE4DE",
                          borderRadius: 9999,
                          overflow: "hidden",
                        }}
                        title={`${Math.round(((cardIndex + 1) / activeDeck.length) * 100)}% through current deck`}
                      >
                        <motion.div
                          style={{
                            height: "100%",
                            background:
                              currentCardStatus === "dont_know"
                                ? "#DC2626"
                                : currentCardStatus === "review" || currentCardStatus === "revisit"
                                  ? "#D97706"
                                  : currentCardStatus === "learned"
                                    ? "#16A34A"
                                    : "linear-gradient(90deg, #B98259, #4A3024)",
                            borderRadius: 9999,
                          }}
                          initial={{ width: 0 }}
                          animate={{
                            width: `${((cardIndex + 1) / activeDeck.length) * 100}%`,
                          }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                        />
                      </div>

                      {/* Mastery / Status Badge */}
                      {currentCardStatus === "dont_know" ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 7,
                            background: "#FEF2F2",
                            border: "1px solid #FCA5A5",
                            borderRadius: 9999,
                            padding: "7px 16px",
                            fontSize: 17,
                            fontWeight: 700,
                            color: "#DC2626",
                          }}
                        >
                          <XCircle size={16} strokeWidth={2.4} /> I Don't Know
                        </div>
                      ) : currentCardStatus === "review" || currentCardStatus === "revisit" ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 7,
                            background: "#FFFBEB",
                            border: "1px solid #FCD34D",
                            borderRadius: 9999,
                            padding: "7px 16px",
                            fontSize: 17,
                            fontWeight: 700,
                            color: "#B45309",
                          }}
                        >
                          <Bookmark size={16} strokeWidth={2.4} /> Marked for Review
                        </div>
                      ) : currentCardStatus === "learned" ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 7,
                            background: "#F0FDF4",
                            border: "1px solid #86EFAC",
                            borderRadius: 9999,
                            padding: "7px 16px",
                            fontSize: 17,
                            fontWeight: 700,
                            color: "#15803D",
                          }}
                        >
                          <Check size={16} strokeWidth={3} /> Know This
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 7,
                            background: "#FAF5EE",
                            border: "1px solid #EAE1D7",
                            borderRadius: 9999,
                            padding: "7px 16px",
                            fontSize: 17,
                            fontWeight: 600,
                            color: "#8C7D73",
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: "#B98259",
                              display: "inline-block",
                            }}
                          />
                          Not Reviewed
                        </div>
                      )}
                    </div>

                    {/* Stacked Tactile 3D Card Deck */}
                    <div className="flashcard-deck-wrapper">
                      {/* Stack underlays for tactile depth */}
                      <div className="flashcard-deck-shadow-2" />
                      <div className="flashcard-deck-shadow-1" />

                      {/* Active Card */}
                      <div
                        className="flashcard-container"
                        onClick={() => setIsFlipped((prev) => !prev)}
                        role="button"
                        tabIndex={0}
                        aria-label={`Flashcard for ${currentCard.canonical_name}. Press space to flip.`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setIsFlipped((f) => !f);
                          }
                        }}
                      >
                        <div className={`flashcard-inner ${isFlipped ? "flipped" : ""}`}>
                          {/* Front Face */}
                          <div
                            className="flashcard-front"
                            style={{
                              padding: "26px 30px",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              alignItems: "center",
                              background: "linear-gradient(180deg, #FFFFFF 0%, #FDFBF8 100%)",
                              border: `2px solid ${cardBorderColor}`,
                              boxShadow: "0 14px 34px -10px rgba(45, 30, 21, 0.08), 0 2px 6px rgba(45, 30, 21, 0.03)",
                              transition: "border-color 0.2s ease",
                            }}
                          >
                            {/* Top Row: Category & Index */}
                            <div
                              style={{
                                width: "100%",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  background: cardCategoryBg,
                                  border: `1px solid ${cardCategoryBorder}`,
                                  borderRadius: 9999,
                                  padding: "6px 14px",
                                  fontSize: 16.5,
                                  fontWeight: 700,
                                  letterSpacing: "0.05em",
                                  color: cardCategoryColor,
                                  textTransform: "uppercase",
                                  transition: "all 0.2s ease",
                                }}
                              >
                                <Sparkles size={15} color={cardCategoryColor} />
                                {currentCard.category ? currentCard.category : "CONCEPT"}
                              </div>
                              <span
                                style={{
                                  fontFamily: "var(--font-serif), Georgia, serif",
                                  fontSize: 18,
                                  fontWeight: 600,
                                  color: "#B4A69B",
                                }}
                              >
                                #{String(cardIndex + 1).padStart(2, "0")}
                              </span>
                            </div>

                            {/* Middle: Title & Aliases */}
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                textAlign: "center",
                                margin: "auto 0",
                                width: "100%",
                              }}
                            >
                              <h2
                                style={{
                                  fontFamily: "var(--font-serif), Georgia, serif",
                                  fontSize: 42,
                                  fontWeight: 700,
                                  color: "#2C1810",
                                  lineHeight: 1.25,
                                  margin: "0 0 12px 0",
                                }}
                              >
                                {currentCard.canonical_name}
                              </h2>

                              {currentCard.aliases && currentCard.aliases.length > 0 && (
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    gap: 8,
                                    marginTop: 4,
                                  }}
                                >
                                  <span style={{ fontSize: 17.5, color: "#8C7D73", fontWeight: 500 }}>aka:</span>
                                  {(currentCard.aliases.length > 1
                                    ? currentCard.aliases.slice(1)
                                    : currentCard.aliases
                                  ).map((alias, aIdx) => (
                                    <span
                                      key={aIdx}
                                      style={{
                                        fontSize: 17,
                                        background: "#F6F1EC",
                                        border: "1px solid #E7DDD4",
                                        color: "#5C4A3E",
                                        padding: "4px 12px",
                                        borderRadius: 9999,
                                        fontWeight: 600,
                                      }}
                                    >
                                      {alias}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Bottom Prompt Pill */}
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "9px 20px",
                                borderRadius: 9999,
                                background: "#FAF6F1",
                                border: "1px solid #EAE0D6",
                                color: "#77675D",
                                fontSize: 16.5,
                                fontWeight: 600,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                              }}
                            >
                              <RotateCw size={15} color="#9C5B28" />
                              Click or press space to reveal definition & evidence
                            </div>
                          </div>

                          {/* Back Face */}
                          <div
                            className="flashcard-back"
                            style={{
                              padding: "26px 30px",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              alignItems: "stretch",
                              background: "#FAF7F3",
                              border: `2px solid ${cardBorderColor}`,
                              boxShadow: "0 14px 34px -10px rgba(45, 30, 21, 0.08), 0 2px 6px rgba(45, 30, 21, 0.03)",
                              textAlign: "left",
                              transition: "border-color 0.2s ease",
                            }}
                          >
                            {/* Top Row: Evidence Badge & Flip back */}
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 12,
                              }}
                            >
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 7,
                                  background: "#F5ECE3",
                                  border: "1px solid #E6D8CA",
                                  borderRadius: 9999,
                                  padding: "6px 14px",
                                }}
                              >
                                <ShieldCheck size={16} color="#4A3024" strokeWidth={2.4} />
                                <span
                                  style={{
                                    fontSize: 16.5,
                                    textTransform: "uppercase",
                                    color: "#4A3024",
                                    fontWeight: 800,
                                    letterSpacing: "0.06em",
                                  }}
                                >
                                  Definition & Grounded Evidence
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: 16,
                                  color: "#8C7D73",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontWeight: 500,
                                }}
                              >
                                <RotateCw size={14} /> Flip front
                              </span>
                            </div>

                            {/* Definition Text */}
                            <p
                              style={{
                                fontSize: 22.5,
                                lineHeight: 1.6,
                                color: "#2C1810",
                                margin: "0 0 14px 0",
                                fontWeight: 500,
                              }}
                            >
                              {currentCard.definition || "No explicit definition recorded."}
                            </p>

                            {/* Evidence Grounding Quote Box */}
                            {currentCard.evidence?.[0] ? (
                              <div
                                style={{
                                  padding: "14px 18px",
                                  background: "#FFFFFF",
                                  border: "1.5px solid #EADED4",
                                  borderRadius: 14,
                                  color: "#4A3D36",
                                  width: "100%",
                                  boxSizing: "border-box",
                                  boxShadow: "0 2px 6px rgba(45, 30, 21, 0.03)",
                                }}
                              >
                                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                                  <Quote
                                    size={18}
                                    color="#B98259"
                                    style={{ flexShrink: 0, marginTop: 3, transform: "rotate(180deg)" }}
                                  />
                                  <span style={{ fontSize: 19.5, fontStyle: "italic", lineHeight: 1.55, color: "#3C2E26" }}>
                                    "{currentCard.evidence[0]}"
                                  </span>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    borderTop: "1px solid #F0E6DE",
                                    paddingTop: 8,
                                    fontSize: 16.5,
                                    color: "#8C7D73",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#9C5B28", fontWeight: 600 }}>
                                    <FileText size={15} color="#9C5B28" />
                                    {currentCard.filenames?.[0] || "Source document"}
                                    {currentCard.page_numbers?.[0] && (
                                      <span style={{ color: "#8C7D73", fontWeight: 500 }}>
                                        · Page {currentCard.page_numbers[0]}
                                      </span>
                                    )}
                                  </div>
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 5,
                                      color: "#1E7E34",
                                      fontWeight: 600,
                                      fontSize: 16,
                                    }}
                                  >
                                    <Check size={14} strokeWidth={3} /> Verified
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div
                                style={{
                                  padding: "12px 16px",
                                  background: "#FFFFFF",
                                  border: "1px dashed #E0D5CB",
                                  borderRadius: 12,
                                  fontSize: 17,
                                  color: "#8C7D73",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                }}
                              >
                                <FileText size={16} color="#B98259" />
                                Grounded in knowledge corpus: {currentCard.filenames?.join(", ") || "Course slides"}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. Self-Assessment Buttons (Red, Amber, Green) */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: 14,
                        marginTop: 24,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* I Don't Know (Red) */}
                      <button
                        onClick={() => {
                          handleMarkProgress("dont_know", currentCard.concept_id);
                          handleNavigateCard("next");
                        }}
                        style={{
                          height: 48,
                          padding: "0 24px",
                          borderRadius: 9999,
                          border: currentCardStatus === "dont_know" ? "2px solid #DC2626" : "1.5px solid #FCA5A5",
                          background: currentCardStatus === "dont_know" ? "#DC2626" : "#FEF2F2",
                          color: currentCardStatus === "dont_know" ? "#FFFFFF" : "#DC2626",
                          fontSize: 18.8,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          boxShadow:
                            currentCardStatus === "dont_know"
                              ? "0 4px 14px rgba(220, 38, 38, 0.28)"
                              : "0 1px 3px rgba(220, 38, 38, 0.08)",
                          transition: "all 0.15s ease",
                        }}
                        title="Mark concept as needing study (Key: 1)"
                      >
                        <XCircle size={18} strokeWidth={2.4} />
                        I Don't Know
                      </button>

                      {/* Marked for Review (Amber) */}
                      <button
                        onClick={() => {
                          handleMarkProgress("review", currentCard.concept_id);
                          handleNavigateCard("next");
                        }}
                        style={{
                          height: 48,
                          padding: "0 24px",
                          borderRadius: 9999,
                          border:
                            currentCardStatus === "review" || currentCardStatus === "revisit"
                              ? "2px solid #D97706"
                              : "1.5px solid #FCD34D",
                          background:
                            currentCardStatus === "review" || currentCardStatus === "revisit"
                              ? "#D97706"
                              : "#FFFBEB",
                          color:
                            currentCardStatus === "review" || currentCardStatus === "revisit"
                              ? "#FFFFFF"
                              : "#B45309",
                          fontSize: 18.8,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          boxShadow:
                            currentCardStatus === "review" || currentCardStatus === "revisit"
                              ? "0 4px 14px rgba(217, 119, 6, 0.28)"
                              : "0 1px 3px rgba(217, 119, 6, 0.08)",
                          transition: "all 0.15s ease",
                        }}
                        title="Mark concept for revision later (Key: 2)"
                      >
                        <Bookmark size={18} strokeWidth={2.4} />
                        Marked for Review
                      </button>

                      {/* Know This (Green) */}
                      <button
                        onClick={() => {
                          handleMarkProgress("learned", currentCard.concept_id);
                          handleNavigateCard("next");
                        }}
                        style={{
                          height: 48,
                          padding: "0 26px",
                          borderRadius: 9999,
                          border: currentCardStatus === "learned" ? "2px solid #16A34A" : "1.5px solid #86EFAC",
                          background: currentCardStatus === "learned" ? "#16A34A" : "#F0FDF4",
                          color: currentCardStatus === "learned" ? "#FFFFFF" : "#15803D",
                          fontSize: 18.8,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          boxShadow:
                            currentCardStatus === "learned"
                              ? "0 4px 14px rgba(22, 163, 74, 0.28)"
                              : "0 1px 3px rgba(22, 163, 74, 0.08)",
                          transition: "all 0.15s ease",
                        }}
                        title="Mark concept as mastered (Key: 3 or M)"
                      >
                        <Check size={20} strokeWidth={3} />
                        Know This
                      </button>
                    </div>

                    {/* 3. Card Navigation & Flip Controls */}
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginTop: 14 }}>
                      <button
                        onClick={() => handleNavigateCard("prev")}
                        style={{
                          height: 44,
                          padding: "0 22px",
                          borderRadius: 9999,
                          border: "1.5px solid #E0D5CB",
                          background: "#FFFFFF",
                          color: "#2C1810",
                          fontSize: 18,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          transition: "all 0.15s ease",
                          boxShadow: "0 1px 3px rgba(45, 30, 21, 0.04)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#F6EFEA")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                      >
                        <ChevronLeft size={18} /> Prev
                      </button>

                      <button
                        onClick={() => setIsFlipped((prev) => !prev)}
                        style={{
                          height: 44,
                          padding: "0 22px",
                          borderRadius: 9999,
                          border: "1.5px solid #E0D5CB",
                          background: "#FFFFFF",
                          color: "#2C1810",
                          fontSize: 18,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          transition: "all 0.15s ease",
                          boxShadow: "0 1px 3px rgba(45, 30, 21, 0.04)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#F6EFEA")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                      >
                        <RotateCw size={16} style={{ transform: isFlipped ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.4s ease" }} />
                        Flip Card
                      </button>

                      <button
                        onClick={() => handleNavigateCard("next")}
                        style={{
                          height: 44,
                          padding: "0 22px",
                          borderRadius: 9999,
                          border: "1.5px solid #E0D5CB",
                          background: "#FFFFFF",
                          color: "#2C1810",
                          fontSize: 18,
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          transition: "all 0.15s ease",
                          boxShadow: "0 1px 3px rgba(45, 30, 21, 0.04)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#F6EFEA")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                      >
                        Next <ChevronRight size={18} />
                      </button>
                    </div>

                  </>
                );
              })()
            )}
          </motion.div>
        )}

        {/* Tab 3: Practice Quiz */}
        {activeTab === "quiz" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            {/* Header: Mode Selector, Score & Session Finish */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { id: "multiple_choice", label: "Multiple Choice (5 Qs)" },
                  { id: "short_answer", label: "Short Answer (3 Qs)" },
                  { id: "relationship", label: "Relationship (2 Qs)" },
                ].map((t) => {
                  const isActive = quizType === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleChangeQuizType(t.id as any)}
                      style={{
                        height: 42,
                        padding: "0 22px",
                        borderRadius: 9999,
                        border: isActive ? "1.5px solid #DFC9B5" : "1.5px solid #EAE4DE",
                        background: isActive ? "#F5EEE8" : "#FFFFFF",
                        color: isActive ? "#2C1810" : "#77716D",
                        fontSize: 18.8,
                        fontWeight: isActive ? 700 : 500,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {!quizFinished && score.total > 0 && (
                  <button
                    onClick={handleFinishQuiz}
                    style={{
                      height: 42,
                      padding: "0 22px",
                      borderRadius: 9999,
                      background: "#4A3024",
                      color: "#FFFFFF",
                      border: "none",
                      fontSize: 18,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.15s ease",
                      boxShadow: "0 1px 3px rgba(74, 48, 36, 0.12)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#382319")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#4A3024")}
                  >
                    <Trophy size={17} /> Finish Quiz & View Results
                  </button>
                )}

                {quizFinished && (
                  <button
                    onClick={handleRetakeQuiz}
                    style={{
                      height: 42,
                      padding: "0 22px",
                      borderRadius: 9999,
                      background: "#FFFFFF",
                      color: "#2C1810",
                      border: "1.5px solid #DFC9B5",
                      fontSize: 18,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F5EEE8")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                  >
                    <RotateCw size={17} /> Retake Quiz
                  </button>
                )}
              </div>
            </div>

            {/* In-Session Quiz Question Flow */}
            {!quizFinished && (
              <>
                {/* Progress Bar & Question Step Counter */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 17, color: "#8C7D73", fontWeight: 600 }}>
                    <span>Question {Math.min(quizQuestionIdx + 1, currentQuizList.length)} of {currentQuizList.length}</span>
                    <span>{Math.round(((quizQuestionIdx + (feedback ? 1 : 0)) / Math.max(1, currentQuizList.length)) * 100)}% Completed</span>
                  </div>
                  <div style={{ height: 8, width: "100%", background: "#EAE4DE", borderRadius: 9999, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(((quizQuestionIdx + (feedback ? 1 : 0)) / Math.max(1, currentQuizList.length)) * 100)}%`,
                        background: "#B98259",
                        borderRadius: 9999,
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>

                {quizBusy ? (
                  <div
                    style={{
                      background: "#FFFFFF",
                      border: "2px solid #EAE4DE",
                      borderRadius: 18,
                      padding: "44px 24px",
                      textAlign: "center",
                      color: "#77716D",
                      fontSize: 18,
                    }}
                  >
                    Loading concept evaluation question…
                  </div>
                ) : quiz ? (
                  <div
                    style={{
                      background: "#FFFFFF",
                      border: "2px solid #EAE4DE",
                      borderRadius: 18,
                      padding: 28,
                      boxShadow: "0 1px 4px rgba(45, 30, 21, 0.03)",
                    }}
                  >
                    {/* Concept Badge */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                      <span
                        style={{
                          padding: "6px 14px",
                          borderRadius: 9999,
                          background: "#F5EEE8",
                          border: "1px solid #DFC9B5",
                          color: "#4A3024",
                          fontSize: 16.5,
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Layers size={16} color="#B98259" />
                        {quiz.concept_name || activeConcept?.canonical_name || "Optimization Concept"}
                      </span>
                      {quiz.category && (
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: 6,
                            background: "#FAF7F4",
                            border: "1px solid #EAE4DE",
                            color: "#8C7D73",
                            fontSize: 15,
                            fontWeight: 600,
                            textTransform: "uppercase",
                          }}
                        >
                          {quiz.category}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 24, fontWeight: 700, color: "#171514", lineHeight: 1.5, marginBottom: 22 }}>
                      {quiz.question}
                    </div>

                    {quiz.options && quiz.options.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                        {quiz.options.map((opt: any) => {
                          const optVal = opt.id ?? opt;
                          const optText = opt.text ?? opt;
                          const isSelected = answer === optVal;
                          return (
                            <button
                              key={optVal}
                              onClick={() => !feedback && setAnswer(optVal)}
                              disabled={!!feedback || quizBusy}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 14,
                                padding: "16px 22px",
                                borderRadius: 14,
                                background: isSelected ? "#F5EEE8" : "#FFFFFF",
                                border: isSelected ? "2px solid #B98259" : "1.5px solid #EAE4DE",
                                color: isSelected ? "#2C1810" : "#594A42",
                                fontSize: 21,
                                fontWeight: isSelected ? 600 : 500,
                                cursor: feedback ? "default" : "pointer",
                                textAlign: "left",
                                transition: "all 0.12s ease",
                              }}
                            >
                              <span
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: "50%",
                                  border: isSelected ? "2px solid #B98259" : "1.5px solid #D1C7BD",
                                  background: isSelected ? "#B98259" : "#FFFFFF",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#FFFFFF",
                                  fontSize: 14,
                                  fontWeight: "bold",
                                  flexShrink: 0,
                                }}
                              >
                                {isSelected && <Check size={15} strokeWidth={3} />}
                              </span>
                              <span style={{ lineHeight: 1.45 }}>{optText}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ marginBottom: 24 }}>
                        <input
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          placeholder="Type your answer here…"
                          disabled={!!feedback || quizBusy}
                          onKeyDown={(e) => e.key === "Enter" && !feedback && handleQuizSubmit()}
                          style={{
                            width: "100%",
                            height: 52,
                            padding: "0 18px",
                            borderRadius: 12,
                            border: "1.5px solid #EAE4DE",
                            fontSize: 21,
                            outline: "none",
                            color: "#171514",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    )}

                    {/* Quiz Action Buttons */}
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      {!feedback ? (
                        <button
                          onClick={handleQuizSubmit}
                          disabled={!answer || quizBusy}
                          style={{
                            height: 46,
                            padding: "0 28px",
                            borderRadius: 9999,
                            background: answer ? "#4A3024" : "#EAE4DE",
                            color: answer ? "#FFFFFF" : "#A89F97",
                            border: "none",
                            fontSize: 19,
                            fontWeight: 600,
                            cursor: answer ? "pointer" : "not-allowed",
                            transition: "all 0.15s ease",
                          }}
                        >
                          Submit Answer
                        </button>
                      ) : (
                        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                          {quizQuestionIdx < currentQuizList.length - 1 ? (
                            <button
                              onClick={handleNextQuestion}
                              style={{
                                height: 46,
                                padding: "0 26px",
                                borderRadius: 9999,
                                background: "#4A3024",
                                color: "#FFFFFF",
                                border: "none",
                                fontSize: 19,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              Next Question <ArrowRight size={18} />
                            </button>
                          ) : (
                            <button
                              onClick={handleFinishQuiz}
                              style={{
                                height: 46,
                                padding: "0 28px",
                                borderRadius: 9999,
                                background: "#4A3024",
                                color: "#FFFFFF",
                                border: "none",
                                fontSize: 19,
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 10,
                                boxShadow: "0 2px 8px rgba(74, 48, 36, 0.2)",
                              }}
                            >
                              <Trophy size={18} /> Finish Quiz & View Results
                            </button>
                          )}

                          <button
                            onClick={handleFinishQuiz}
                            style={{
                              height: 46,
                              padding: "0 22px",
                              borderRadius: 9999,
                              background: "#FFFFFF",
                              color: "#2C1810",
                              border: "1.5px solid #DFC9B5",
                              fontSize: 18,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Finish Quiz Now
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Question Feedback Alert */}
                    <AnimatePresence>
                      {feedback && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          style={{
                            marginTop: 20,
                            padding: "18px 24px",
                            borderRadius: 14,
                            background: feedback.correct ? "#F0FDF4" : "#FEF2F2",
                            border: feedback.correct ? "2px solid #86EFAC" : "2px solid #FECACA",
                            color: feedback.correct ? "#166534" : "#991B1B",
                            fontSize: 20,
                            lineHeight: 1.6,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, marginBottom: 8, fontSize: 20.5 }}>
                            {feedback.correct ? (
                              <>
                                <CheckCircle2 size={22} color="#16A34A" /> Correct Answer!
                              </>
                            ) : (
                              <>
                                <XCircle size={22} color="#DC2626" /> Needs Review
                              </>
                            )}
                          </div>
                          <div style={{ color: feedback.correct ? "#15803D" : "#7F1D1D" }}>{feedback.explanation}</div>
                          {feedback.citations && feedback.citations[0] && (
                            <div style={{ marginTop: 10, fontSize: 16.5, color: "#8C7D73", display: "flex", alignItems: "center", gap: 7 }}>
                              <FileText size={16} color="#B98259" />
                              Evidence source: <strong>{feedback.citations[0].filename}</strong>
                              {feedback.citations[0].page_number ? ` · Page ${feedback.citations[0].page_number}` : ""}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : null}
              </>
            )}

            {/* Final Score & Diagnostic Performance Report (Displayed upon Quiz Completion) */}
            {quizFinished && (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}>
                {/* 1. Score Hero Card */}
                <div
                  style={{
                    background: "#FFFFFF",
                    border: "2px solid #EAE4DE",
                    borderRadius: 20,
                    padding: "36px 32px",
                    boxShadow: "0 4px 20px rgba(45, 30, 21, 0.05)",
                    marginBottom: 24,
                  }}
                >
                  {/* Top Bar with Report Badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 16.5,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "#8C7D73",
                      }}
                    >
                      <Trophy size={19} color="#B98259" /> Quiz Performance Report
                    </span>

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 18px",
                        borderRadius: 9999,
                        background: gradeInfo.bg,
                        border: `1.5px solid ${gradeInfo.border}`,
                        color: gradeInfo.text,
                        fontSize: 18,
                        fontWeight: 700,
                      }}
                    >
                      <span>{gradeInfo.icon}</span> {gradeInfo.label}
                    </div>
                  </div>

                  {/* Score Visualization Row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 28,
                      flexWrap: "wrap",
                      paddingBottom: 24,
                      borderBottom: "1.5px solid #F0E8DF",
                    }}
                  >
                    {/* Big Circular Score Pill */}
                    <div
                      style={{
                        width: 135,
                        height: 135,
                        borderRadius: "50%",
                        background: gradeInfo.bg,
                        border: `3.5px solid ${gradeInfo.border}`,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        boxShadow: "0 4px 12px rgba(45, 30, 21, 0.06)",
                      }}
                    >
                      <span style={{ fontSize: 44, fontWeight: 800, color: gradeInfo.text, lineHeight: 1 }}>
                        {pct}%
                      </span>
                      <span style={{ fontSize: 18, fontWeight: 600, color: gradeInfo.text, marginTop: 6 }}>
                        {score.correct}/{Math.max(1, score.total)}
                      </span>
                    </div>

                    {/* Performance Message */}
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <h2 style={{ fontSize: 28, fontWeight: 700, color: "#2C1810", margin: "0 0 8px 0" }}>
                        {gradeInfo.heading}
                      </h2>
                      <p style={{ fontSize: 20, color: "#6B5E55", lineHeight: 1.6, margin: 0 }}>
                        {gradeInfo.message}
                      </p>
                    </div>
                  </div>

                  {/* 4 Mini Stat Tiles */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 16,
                      marginTop: 24,
                    }}
                  >
                    <div style={{ background: "#FAF7F4", border: "1.5px solid #EAE4DE", borderRadius: 14, padding: "16px 20px" }}>
                      <div style={{ fontSize: 16.5, fontWeight: 600, color: "#8C7D73", display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                        <TrendingUp size={17} color="#B98259" /> Accuracy
                      </div>
                      <div style={{ fontSize: 30, fontWeight: 800, color: "#2C1810" }}>{pct}%</div>
                    </div>

                    <div style={{ background: "#F0FDF4", border: "1.5px solid #BBF7D0", borderRadius: 14, padding: "16px 20px" }}>
                      <div style={{ fontSize: 16.5, fontWeight: 600, color: "#166534", display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                        <CheckCircle2 size={17} color="#16A34A" /> Correct
                      </div>
                      <div style={{ fontSize: 30, fontWeight: 800, color: "#166534" }}>{score.correct}</div>
                    </div>

                    <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 14, padding: "16px 20px" }}>
                      <div style={{ fontSize: 16.5, fontWeight: 600, color: "#991B1B", display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                        <AlertTriangle size={17} color="#DC2626" /> Needs Review
                      </div>
                      <div style={{ fontSize: 30, fontWeight: 800, color: "#991B1B" }}>{Math.max(0, score.total - score.correct)}</div>
                    </div>

                    <div style={{ background: "#FAF7F4", border: "1.5px solid #EAE4DE", borderRadius: 14, padding: "16px 20px" }}>
                      <div style={{ fontSize: 16.5, fontWeight: 600, color: "#8C7D73", display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
                        <BarChart3 size={17} color="#8C7D73" /> Total Answered
                      </div>
                      <div style={{ fontSize: 30, fontWeight: 800, color: "#2C1810" }}>{score.total}</div>
                    </div>
                  </div>
                </div>

                {/* 2. Recommended Improvement Topics (Core Requirement) */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          background: "#FEE2E2",
                          border: "1.5px solid #FCA5A5",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#DC2626",
                        }}
                      >
                        <Target size={22} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: 24, fontWeight: 700, color: "#2C1810", margin: 0 }}>
                          Recommended Improvement Topics
                        </h3>
                        <p style={{ fontSize: 17.5, color: "#77716D", margin: "3px 0 0 0" }}>
                          Targeted areas where focused review will quickly elevate your understanding
                        </p>
                      </div>
                    </div>

                    <span
                      style={{
                        padding: "6px 16px",
                        borderRadius: 9999,
                        background: improvementTopics.length > 0 ? "#FEE2E2" : "#DCFCE7",
                        color: improvementTopics.length > 0 ? "#DC2626" : "#15803D",
                        border: improvementTopics.length > 0 ? "1px solid #FCA5A5" : "1px solid #86EFAC",
                        fontSize: 16.5,
                        fontWeight: 700,
                      }}
                    >
                      {improvementTopics.length} {improvementTopics.length === 1 ? "Topic" : "Topics"} to Review
                    </span>
                  </div>

                  {improvementTopics.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                      {improvementTopics.map((topic) => (
                        <div
                          key={topic.conceptId}
                          style={{
                            background: "#FFFFFF",
                            border: topic.reason.includes("Missed") ? "1.5px solid #FCA5A5" : "1.5px solid #FCD34D",
                            borderRadius: 16,
                            padding: 24,
                            boxShadow: "0 2px 8px rgba(45, 30, 21, 0.03)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 14,
                          }}
                        >
                          {/* Card Header: Concept Name, Category & Status Badge */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{ fontSize: 23, fontWeight: 700, color: "#2C1810" }}>
                                {topic.conceptName}
                              </span>
                              <span
                                style={{
                                  padding: "4px 12px",
                                  borderRadius: 6,
                                  background: "#F5EEE8",
                                  color: "#6B5E55",
                                  fontSize: 15.5,
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                }}
                              >
                                {topic.category}
                              </span>
                            </div>

                            <span
                              style={{
                                padding: "6px 14px",
                                borderRadius: 9999,
                                background: topic.reason.includes("Missed") ? "#FEE2E2" : "#FEF3C7",
                                color: topic.reason.includes("Missed") ? "#DC2626" : "#B45309",
                                border: topic.reason.includes("Missed") ? "1px solid #FCA5A5" : "1px solid #FCD34D",
                                fontSize: 16,
                                fontWeight: 700,
                              }}
                            >
                              {topic.reason}
                            </span>
                          </div>

                          {/* Missed Question Context (if from quiz) */}
                          {topic.missedQuestion && (
                            <div
                              style={{
                                background: "#FFFBFB",
                                border: "1px dashed #FCA5A5",
                                borderRadius: 12,
                                padding: "14px 18px",
                                fontSize: 18,
                                color: "#4A3024",
                                lineHeight: 1.55,
                              }}
                            >
                              <strong>Quiz Question:</strong> {topic.missedQuestion}
                              {topic.userAnswer && (
                                <div style={{ marginTop: 6, color: "#991B1B", fontSize: 18 }}>
                                  <span style={{ fontWeight: 600 }}>Your Answer:</span> {topic.userAnswer}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Key Takeaway Box */}
                          <div
                            style={{
                              background: "#FAF6F2",
                              border: "1px solid #EADECE",
                              borderRadius: 12,
                              padding: "16px 20px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17.5, fontWeight: 700, color: "#4A3024", marginBottom: 6 }}>
                              <Sparkles size={16} color="#B98259" /> Key Takeaway to Master
                            </div>
                            <div style={{ fontSize: 19.5, color: "#594A42", lineHeight: 1.6 }}>
                              {topic.keyTakeaway}
                            </div>
                          </div>

                          {/* Citations & Actions */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, paddingTop: 4 }}>
                            <div style={{ fontSize: 16.5, color: "#8C7D73" }}>
                              {topic.citations && topic.citations[0] ? (
                                <span>
                                  📄 Grounded in <strong>{topic.citations[0].filename}</strong>
                                  {topic.citations[0].page_number ? ` (p. ${topic.citations[0].page_number})` : ""}
                                </span>
                              ) : (
                                <span>📄 Verified from indexed course materials</span>
                              )}
                            </div>

                            <div style={{ display: "flex", gap: 10 }}>
                              <button
                                onClick={() => handleGoToFlashcard(topic.conceptId)}
                                style={{
                                  height: 44,
                                  padding: "0 20px",
                                  borderRadius: 9999,
                                  background: "#4A3024",
                                  color: "#FFFFFF",
                                  border: "none",
                                  fontSize: 17.5,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#382319")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "#4A3024")}
                              >
                                <Layers size={16} /> Review Flashcard
                              </button>

                              <button
                                onClick={() => handleGoToExplanation(topic.conceptId)}
                                style={{
                                  height: 44,
                                  padding: "0 20px",
                                  borderRadius: 9999,
                                  background: "#FFFFFF",
                                  color: "#2C1810",
                                  border: "1.5px solid #DFC9B5",
                                  fontSize: 17.5,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 8,
                                  transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "#F5EEE8")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                              >
                                <BookOpen size={16} /> Read Explanation
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        background: "#F0FDF4",
                        border: "2px solid #BBF7D0",
                        borderRadius: 16,
                        padding: "26px 30px",
                        display: "flex",
                        alignItems: "center",
                        gap: 18,
                      }}
                    >
                      <div
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: "50%",
                          background: "#DCFCE7",
                          border: "2px solid #86EFAC",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#16A34A",
                          flexShrink: 0,
                        }}
                      >
                        <CheckCircle2 size={28} />
                      </div>
                      <div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#166534" }}>
                          All Concepts Mastered!
                        </div>
                        <div style={{ fontSize: 18.5, color: "#15803D", marginTop: 4 }}>
                          You answered every question correctly on this quiz and have no concepts flagged for review. Outstanding grasp of the material!
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Concepts Mastered Section */}
                {masteredTopics.length > 0 && (
                  <div style={{ marginBottom: 28 }}>
                    <h3 style={{ fontSize: 22, fontWeight: 700, color: "#2C1810", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
                      <CheckCircle2 size={20} color="#16A34A" /> Concepts Mastered in this Session ({masteredTopics.length})
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
                      {masteredTopics.map((m) => (
                        <div
                          key={m.conceptId}
                          style={{
                            background: "#F0FDF4",
                            border: "1.5px solid #BBF7D0",
                            borderRadius: 14,
                            padding: "14px 18px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 19, fontWeight: 700, color: "#166534" }}>{m.conceptName}</div>
                            <div style={{ fontSize: 15, color: "#15803D", textTransform: "uppercase", fontWeight: 600, marginTop: 2 }}>{m.category}</div>
                          </div>
                          <Check size={18} color="#16A34A" strokeWidth={3} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Bottom Actions */}
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    justifyContent: "center",
                    alignItems: "center",
                    flexWrap: "wrap",
                    paddingTop: 18,
                    borderTop: "1.5px solid #EAE4DE",
                  }}
                >
                  <button
                    onClick={handleRetakeQuiz}
                    style={{
                      height: 48,
                      padding: "0 26px",
                      borderRadius: 9999,
                      background: "#4A3024",
                      color: "#FFFFFF",
                      border: "none",
                      fontSize: 18.8,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.15s ease",
                      boxShadow: "0 2px 6px rgba(74, 48, 36, 0.15)",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#382319")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#4A3024")}
                  >
                    <RotateCw size={18} /> Retake Quiz Session
                  </button>

                  <button
                    onClick={() => {
                      setDeckFilter("review");
                      setActiveTab("flashcard");
                    }}
                    style={{
                      height: 48,
                      padding: "0 26px",
                      borderRadius: 9999,
                      background: "#FFFFFF",
                      color: "#2C1810",
                      border: "1.5px solid #DFC9B5",
                      fontSize: 18.8,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F5EEE8")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                  >
                    <Layers size={18} /> Study Review Flashcards
                  </button>

                  <button
                    onClick={() => setActiveTab("explain")}
                    style={{
                      height: 48,
                      padding: "0 26px",
                      borderRadius: 9999,
                      background: "#FFFFFF",
                      color: "#2C1810",
                      border: "1.5px solid #DFC9B5",
                      fontSize: 18.8,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F5EEE8")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                  >
                    <BookOpen size={18} /> Explore Explanations
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </main>
      <Footer />
    </div>
  );
}
