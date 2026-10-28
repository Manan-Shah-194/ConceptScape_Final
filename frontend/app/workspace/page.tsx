"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain,
  BookOpen,
  GraduationCap,
  BarChart3,
  FileText,
  Network,
  Users,
  Calendar,
  Star,
  MoreHorizontal,
  Plus,
  Search,
  ChevronDown,
  Pencil,
  Clock,
  HelpCircle,
  Sparkles,
  Shield,
  Check,
  Upload,
  Trash2,
  Copy,
  ExternalLink,
  Layers,
  ArrowRight,
  UserCheck,
  Mail,
  Database,
  Cpu,
  UploadCloud,
  CheckCircle2,
  RotateCcw,
  Eye,
  Video,
  Play,
  Presentation,
  Image as ImageIcon,
  Link2,
  AlertCircle,
  Loader2,
  Info,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { getToken, getUserProfile, getWorkspaceId, initialsOf, setWorkspaceId } from "@/lib/auth";
import {
  createWorkspace,
  deleteWorkspace,
  getGraph,
  listDocuments,
  listMembers,
  listWorkspaces,
  addMember,
  renameWorkspace,
  removeMember,
  leaveWorkspace,
} from "@/lib/api";

export type WorkspaceItem = {
  id: string;
  name: string;
  category: "Coursework" | "Research" | "Project" | "Personal";
  description: string;
  icon: "brain" | "book" | "gradCap" | "chart" | "layers";
  color: string;
  bgLight: string;
  docs: number;
  concepts: number;
  members: number;
  activeTime: string;
  createdDate: string;
  lastModified: string;
  isStarred: boolean;
  createdBy: {
    name: string;
    email: string;
    avatar: string;
  };
};

// Rich Darker Brown & Bronze Swatches
const COLOR_SWATCHES = [
  { name: "Rich Dark Brown", hex: "#171514", bg: "#FAF4EF", text: "#FFFFFF" },
  { name: "Deep Sienna Brown", hex: "#5A3825", bg: "#F8EFE8", text: "#FFFFFF" },
  { name: "Warm Copper Bronze", hex: "#B88358", bg: "#F6EFEA", text: "#FFFFFF" },
  { name: "Sand Bronze", hex: "#C59B77", bg: "#FAF6F2", text: "#FFFFFF" },
  { name: "Roasted Caramel", hex: "#8C5E3B", bg: "#F7F2EE", text: "#FFFFFF" },
  { name: "Charcoal Espresso", hex: "#3D342E", bg: "#F5F2F0", text: "#FFFFFF" },
  { name: "Platinum Taupe", hex: "#6E6157", bg: "#F8F6F4", text: "#FFFFFF" },
];

type TabKey = "overview" | "members" | "ai" | "documents" | "sharing";

/**
 * Presentation-only styling, derived from the workspace id.
 *
 * Colour and icon are not data the server stores, but they must stay the same
 * for a given workspace between visits — so they are derived from the id
 * rather than assigned at random or hardcoded per workspace.
 */
/** Human-readable size from the byte count the API reports. */
function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "\u2014";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A date the server supplied, or a dash when it supplied none. */
function formatWhen(iso?: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function appearanceFor(id: string): { icon: WorkspaceItem["icon"]; color: string; bgLight: string } {
  const icons: WorkspaceItem["icon"][] = ["brain", "book", "gradCap", "chart", "layers"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const swatch = COLOR_SWATCHES[hash % COLOR_SWATCHES.length];
  return {
    icon: icons[hash % icons.length],
    color: swatch.hex,
    bgLight: swatch.bg,
  };
}

/** Local, per-user preferences the API does not model. */
function readLocalMeta(id: string): { description: string; category: WorkspaceItem["category"]; isStarred: boolean } {
  if (typeof window === "undefined") return { description: "", category: "Project", isStarred: false };
  try {
    const raw = window.localStorage.getItem("conceptscape.workspace_meta");
    const all = raw ? JSON.parse(raw) : {};
    const mine = all[id] ?? {};
    return {
      description: mine.description ?? "",
      category: mine.category ?? "Project",
      isStarred: Boolean(mine.isStarred),
    };
  } catch {
    return { description: "", category: "Project", isStarred: false };
  }
}

/**
 * Build the view model from what the server actually returned.
 *
 * Fields the API does not provide — creation date, last-modified, activity —
 * are left empty so the interface can show a dash. Inventing "Active 2 hours
 * ago" for a workspace nobody has opened is worse than admitting it is unknown.
 */
function toWorkspaceItem(
  ws: { id: string; name: string; role: string },
  counts: { docs: number; concepts: number; members: number },
  owner: { name: string; email: string }
): WorkspaceItem {
  const look = appearanceFor(ws.id);
  const meta = readLocalMeta(ws.id);
  return {
    id: ws.id,
    name: ws.name,
    category: meta.category,
    description: meta.description,
    icon: look.icon,
    color: look.color,
    bgLight: look.bgLight,
    docs: counts.docs,
    concepts: counts.concepts,
    members: counts.members,
    activeTime: "",
    createdDate: "",
    lastModified: "",
    isStarred: meta.isStarred,
    createdBy: {
      name: owner.name,
      email: owner.email,
      avatar: initialsOf(owner.name, owner.email),
    },
  };
}

export default function WorkspaceSettingsPage() {
  const router = useRouter();

  // Starts empty and is filled from the API below. Seeding it with sample rows
  // meant the page rendered somebody else's workspaces for a moment on every
  // load, and kept showing them entirely if the request failed.
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedId, setSelectedId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const curr = getWorkspaceId();
      if (curr) return curr;
    }
    return "";
  });

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"active" | "name" | "concepts" | "docs">("active");
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [actionMenuWorkspaceId, setActionMenuWorkspaceId] = useState<string | null>(null);

  // Modals & Inline Edits
  const [showNewModal, setShowNewModal] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<WorkspaceItem["category"]>("Coursework");

  // New Workspace Form state
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<WorkspaceItem["category"]>("Coursework");
  const [newColor, setNewColor] = useState(COLOR_SWATCHES[0].hex);
  const [newBgLight, setNewBgLight] = useState(COLOR_SWATCHES[0].bg);
  const [newIcon, setNewIcon] = useState<WorkspaceItem["icon"]>("brain");

  // Members Tab State
  const [membersList, setMembersList] = useState<
    { id: string; name: string; email: string; role: string; avatar: string }[]
  >([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Editor");

  // Documents Section State
  const [docSearch, setDocSearch] = useState("");
  const [youtubeInput, setYoutubeInput] = useState("");
  const [docSimulating, setDocSimulating] = useState(false);
  const [docSimStage, setDocSimStage] = useState<number | null>(null);
  const [docSimStats, setDocSimStats] = useState({ docs: 6, chunks: 42, concepts: 18, edges: 20 });
  const [docWorkingLog, setDocWorkingLog] = useState("Ready. Drop documents or click 'Run Simulation' to demonstrate the 7-stage ingestion pipeline.");
  const [previewDoc, setPreviewDoc] = useState<{ name: string; size: string; version: string; type: string } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [workspaceDocuments, setWorkspaceDocuments] = useState<Array<{
    id: string;
    name: string;
    type: string;
    version: string;
    size: string;
    status: string;
    origin: "uploaded" | "shared";
    uploadedBy: string;
    date: string;
  }>>([]);
  const [docOriginFilter, setDocOriginFilter] = useState<"all" | "uploaded" | "shared">("all");

  // Save workspaces to localStorage
  // Load the caller's real workspaces, with the counts the server can answer for.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingWorkspaces(true);
      setLoadError("");
      try {
        const profile = getUserProfile();
        const owner = { name: profile.fullName, email: profile.email };
        const serverWorkspaces = await listWorkspaces();

        // Counts are scoped to the active workspace by the X-Workspace-ID
        // header, so only the selected one can be measured without switching
        // context. The rest show their own member count and dashes elsewhere.
        const active = getWorkspaceId();
        const built = await Promise.all(
          serverWorkspaces.map(async (ws) => {
            let docs = 0;
            let concepts = 0;
            let members = 1;
            try {
              members = (await listMembers(ws.id)).length || 1;
            } catch {
              // A workspace we cannot enumerate still lists with its own name.
            }
            if (ws.id === active) {
              try {
                docs = (await listDocuments()).documents.length;
              } catch { /* no documents yet */ }
              try {
                concepts = (await getGraph()).nodes.length;
              } catch { /* graph not built yet */ }
            }
            return toWorkspaceItem(ws, { docs, concepts, members }, owner);
          })
        );

        if (cancelled) return;
        setWorkspaces(built);
        if (built.length && !built.some((w) => w.id === selectedId)) {
          setSelectedId(built[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        setWorkspaces([]);
        setLoadError(
          err instanceof Error ? err.message : "Could not load your workspaces."
        );
      } finally {
        if (!cancelled) setLoadingWorkspaces(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Re-reading on every workspace edit would fight the local edits below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Documents actually present in this workspace.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const { documents } = await listDocuments();
        if (cancelled) return;
        setWorkspaceDocuments(
          documents.map((d, i) => ({
            id: `${d.filename}-${i}`,
            name: d.filename,
            type: (d.suffix || "").replace(".", "") || "file",
            version: `v${d.version ?? 1}`,
            size: formatBytes(d.size_bytes),
            status: d.status ?? "ready",
            origin: "uploaded" as const,
            uploadedBy: "You",
            date: formatWhen(d.uploaded_at),
          }))
        );
      } catch {
        if (!cancelled) setWorkspaceDocuments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Members of whichever workspace is selected.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listMembers(selectedId);
        if (cancelled) return;
        setMembersList(
          rows.map((m: any) => ({
            id: m.id,
            name: m.display_name || m.email || "Member",
            email: m.email ?? "",
            role: m.role ?? "Member",
            avatar: initialsOf(m.display_name ?? "", m.email ?? ""),
          }))
        );
      } catch {
        if (!cancelled) setMembersList([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Persist only what the server does not store: the user's own labelling.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const meta: Record<string, unknown> = {};
    for (const w of workspaces) {
      meta[w.id] = { description: w.description, category: w.category, isStarred: w.isStarred };
    }
    window.localStorage.setItem("conceptscape.workspace_meta", JSON.stringify(meta));
    if (selectedId) setWorkspaceId(selectedId);
  }, [workspaces, selectedId]);

  const selectedWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === selectedId) || workspaces[0];
  }, [workspaces, selectedId]);

  // Sync edit fields when selected workspace changes
  useEffect(() => {
    if (selectedWorkspace) {
      setEditName(selectedWorkspace.name);
      setEditDescription(selectedWorkspace.description);
      setEditCategory(selectedWorkspace.category);
    }
  }, [selectedWorkspace]);

  // Filtered & Sorted Workspaces
  const filteredWorkspaces = useMemo(() => {
    let result = workspaces.filter((w) =>
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.category.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (sortBy === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "concepts") {
      result.sort((a, b) => b.concepts - a.concepts);
    } else if (sortBy === "docs") {
      result.sort((a, b) => b.docs - a.docs);
    }
    return result;
  }, [workspaces, searchQuery, sortBy]);

  const toggleStar = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isStarred: !w.isStarred } : w))
    );
  };

  const updateSelectedColor = (hex: string, bg: string) => {
    setWorkspaces((prev) =>
      prev.map((w) => (w.id === selectedId ? { ...w, color: hex, bgLight: bg } : w))
    );
  };

  const handleSaveDetails = async () => {
    const name = editName.trim();
    if (!selectedId || !name) return;
    try {
      const updated = await renameWorkspace(selectedId, name);
      setWorkspaces((prev) => prev.map((w) => w.id === selectedId
        ? { ...w, name: updated.name, description: editDescription.trim() || w.description, category: editCategory, lastModified: "Just now" }
        : w));
      setIsEditingDetails(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not rename workspace.");
    }
  };

  const handleCreateWorkspace = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await createWorkspace(name);
      setNewName("");
      setNewDescription("");
      setShowNewModal(false);
      setSelectedId(created.id);
      setWorkspaceId(created.id);
      const serverWorkspaces = await listWorkspaces();
      const me = getUserProfile();
      const owner = { name: me.fullName, email: me.email };
      setWorkspaces(serverWorkspaces.map((ws) => toWorkspaceItem(ws, {
        docs: 0,
        concepts: 0,
        members: 1,
      }, owner)));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not create workspace.");
    }
  };

  const handleDeleteWorkspace = async (id: string) => {
    if (workspaces.length <= 1) {
      alert("You must keep at least one active workspace.");
      return;
    }
    if (confirm("Are you sure you want to delete this workspace and its documents?")) {
      try {
        await deleteWorkspace(id);
        const nextList = workspaces.filter((w) => w.id !== id);
        setWorkspaces(nextList);
        if (selectedId === id && nextList[0]) {
          setSelectedId(nextList[0].id);
          setWorkspaceId(nextList[0].id);
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Could not delete workspace.");
      }
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedId || !confirm("Remove this member from the workspace?")) return;
    try {
      await removeMember(selectedId, memberId);
      setMembersList((prev) => prev.filter((item) => item.id !== memberId));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not remove member.");
    }
  };

  const handleLeaveWorkspace = async () => {
    if (!selectedId || !confirm("Leave this workspace?")) return;
    try {
      await leaveWorkspace(selectedId);
      const remaining = workspaces.filter((workspace) => workspace.id !== selectedId);
      setWorkspaces(remaining);
      if (remaining[0]) {
        setSelectedId(remaining[0].id);
        setWorkspaceId(remaining[0].id);
      } else {
        setSelectedId("");
        window.localStorage.removeItem("conceptscape.workspace_id");
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not leave workspace.");
    }
  };

  const currentUserEmail = getUserProfile().email.trim().toLowerCase();
  const currentMember = membersList.find((member) => member.email.trim().toLowerCase() === currentUserEmail);
  const isWorkspaceOwner = currentMember?.role.trim().toLowerCase() === "owner";

  const renderIcon = (iconName: WorkspaceItem["icon"], size = 22, color = "#171514") => {
    switch (iconName) {
      case "brain":
        return <Brain size={size} color={color} strokeWidth={2.2} />;
      case "book":
        return <BookOpen size={size} color={color} strokeWidth={2.2} />;
      case "gradCap":
        return <GraduationCap size={size} color={color} strokeWidth={2.2} />;
      case "chart":
        return <BarChart3 size={size} color={color} strokeWidth={2.2} />;
      case "layers":
      default:
        return <Layers size={size} color={color} strokeWidth={2.2} />;
    }
  };

  const filteredWorkspaceDocs = useMemo(() => {
    return workspaceDocuments
      .filter((d) => {
        if (docOriginFilter === "uploaded") return d.origin === "uploaded";
        if (docOriginFilter === "shared") return d.origin === "shared";
        return true;
      })
      .filter((d) =>
        d.name.toLowerCase().includes(docSearch.toLowerCase()) ||
        (d.uploadedBy && d.uploadedBy.toLowerCase().includes(docSearch.toLowerCase()))
      );
  }, [workspaceDocuments, docSearch, docOriginFilter]);

  const docCounts = useMemo(() => {
    const uploaded = workspaceDocuments.filter((d) => d.origin === "uploaded").length;
    const shared = workspaceDocuments.filter((d) => d.origin === "shared").length;
    return { all: workspaceDocuments.length, uploaded, shared };
  }, [workspaceDocuments]);

  const PIPELINE_STAGES = [
    { id: 1, title: "1. Ingest & OCR", sub: "PDF/PPTX parsing", detail: "PaddleOCR bilingual extraction with angle recovery" },
    { id: 2, title: "2. Clean & Chunk", sub: "Token overlap", detail: "512-token overlap window normalization" },
    { id: 3, title: "3. Concept Extr.", sub: "LLM extraction", detail: "Gemini 1.5 Flash candidate concept taxonomy" },
    { id: 4, title: "4. Entity Resol.", sub: "Alias merging", detail: "Fuzzy cosine alignment & entity deduplication" },
    { id: 5, title: "5. Relation Extr.", sub: "Typed triples", detail: "Directed dependency triples (requires, produces)" },
    { id: 6, title: "6. Graph Build", sub: "Dagre layout", detail: "Radial Dagre coordinate topology layout" },
    { id: 7, title: "7. Hybrid RAG", sub: "Vector + BM25", detail: "BM25 keyword + dense vector hybrid index" },
  ];

  const triggerPipelineSimulation = (targetDocName?: string) => {
    if (docSimulating) return;
    setDocSimulating(true);
    setDocSimStage(0);
    setDocSimStats({ docs: workspaceDocuments.length, chunks: 8, concepts: 2, edges: 0 });
    setDocWorkingLog(
      targetDocName
        ? `Stage 1/7: Ingesting '${targetDocName}' via PaddleOCR bilingual engine...`
        : "Stage 1/7: Ingesting 6 documents & running PaddleOCR text extraction..."
    );

    const STAGES_TIMELINE = [
      {
        stage: 1,
        log: "Stage 2/7: Cleaning text & generating 42 chunks with 512-token overlap...",
        stats: { docs: workspaceDocuments.length, chunks: 42, concepts: 6, edges: 4 },
      },
      {
        stage: 2,
        log: "Stage 3/7: Gemini 1.5 Flash & LLaMA 3.3 extracting candidate concepts & formal definitions...",
        stats: { docs: workspaceDocuments.length, chunks: 42, concepts: 14, edges: 8 },
      },
      {
        stage: 3,
        log: "Stage 4/7: Normalizing entity aliases: Merged 'SGD' ↔ 'Stochastic Gradient Descent' (0.98 similarity)...",
        stats: { docs: workspaceDocuments.length, chunks: 42, concepts: 18, edges: 12 },
      },
      {
        stage: 4,
        log: "Stage 5/7: Extracting 20 directed relationships (requires, used_for, part_of, produces)...",
        stats: { docs: workspaceDocuments.length, chunks: 42, concepts: 18, edges: 20 },
      },
      {
        stage: 5,
        log: "Stage 6/7: Constructing knowledge graph topology in Dagre radial coordinate space...",
        stats: { docs: workspaceDocuments.length, chunks: 42, concepts: 18, edges: 20 },
      },
      {
        stage: 6,
        log: "Stage 7/7: Indexing BM25 + Dense vector embeddings for Grounded Hybrid RAG...",
        stats: { docs: workspaceDocuments.length, chunks: 42, concepts: 18, edges: 20 },
      },
    ];

    STAGES_TIMELINE.forEach((step, idx) => {
      setTimeout(() => {
        setDocSimStage(step.stage);
        setDocWorkingLog(step.log);
        setDocSimStats(step.stats);

        if (idx === STAGES_TIMELINE.length - 1) {
          setTimeout(() => {
            setDocSimulating(false);
            setDocSimStage(7); // all 7 stages completed
            setDocWorkingLog("✓ Ingestion pipeline completed successfully! 18 concepts and 20 edges indexed.");
          }, 1300);
        }
      }, (idx + 1) * 1150);
    });
  };

  const handleAddYouTube = () => {
    if (!youtubeInput.trim()) return;
    const cleanUrl = youtubeInput.trim();
    const newDoc = {
      id: `doc-${Date.now()}`,
      name: cleanUrl.includes("v=") ? `yt_video_${cleanUrl.split("v=")[1].slice(0, 8)}.yt` : "lecture_video.yt",
      type: "yt",
      version: "v1",
      size: "Video stream",
      status: "completed",
      origin: "uploaded" as const,
      uploadedBy: "You",
      date: "Just now",
    };
    setWorkspaceDocuments((prev) => [newDoc, ...prev]);
    setYoutubeInput("");
  };

  const handleFileUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const uploadedDocs = Array.from(files).map((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "pdf";
      return {
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: f.name,
        type: ext,
        version: "v1",
        size: `${Math.round(f.size / 1024)} KB`,
        status: "completed",
        origin: "uploaded" as const,
        uploadedBy: "You",
        date: "Just now",
      };
    });
    setWorkspaceDocuments((prev) => [...uploadedDocs, ...prev]);
  };

  const handleDeleteDocument = (id: string) => {
    setWorkspaceDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const handleReprocessDocument = (name: string) => {
    triggerPipelineSimulation(name);
  };

  const renderDocTypeIcon = (type: string) => {
    switch (type) {
      case "pptx":
      case "ppt":
        return <Presentation size={19} color="#B98259" />;
      case "yt":
      case "video":
        return <Video size={19} color="#B98259" />;
      case "png":
      case "jpg":
      case "jpeg":
        return <ImageIcon size={19} color="#B98259" />;
      case "pdf":
      default:
        return <FileText size={19} color="#B98259" />;
    }
  };

  // Nothing to show until the server answers. The page used to be seeded with
  // sample workspaces, which guaranteed a selection existed; now that the list
  // starts empty, the loading and empty cases have to be real states rather
  // than a render that assumes one is always present.
  if (!selectedWorkspace) {
    return (
      <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column" }}>
        <Navbar />
        <main style={{ maxWidth: "min(1560px, 96vw)", margin: "0 auto", padding: "120px clamp(16px, 3vw, 36px) 64px", flex: 1, width: "100%", textAlign: "center" }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, color: "#171514", marginBottom: 12 }}>
            {loadingWorkspaces ? "Loading your workspaces\u2026" : "No workspaces yet"}
          </h1>
          <p style={{ fontSize: 15, color: "#6E6157", maxWidth: 520, margin: "0 auto 28px" }}>
            {loadError
              ? loadError
              : loadingWorkspaces
                ? "Fetching the workspaces on your account."
                : "A workspace is created with your account. If none appears, sign in again."}
          </p>
          {!loadingWorkspaces && (
            <Link
              href="/login"
              style={{ display: "inline-block", padding: "12px 24px", borderRadius: 10, background: "#171514", color: "#FFFFFF", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
            >
              Go to sign in
            </Link>
          )}
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column" }}>
      {/* Top Navbar */}
      <Navbar />

      {/* Main Container */}
      <main style={{ maxWidth: "min(1560px, 96vw)", margin: "0 auto", padding: "80px clamp(16px, 3vw, 36px) 64px", boxSizing: "border-box", flex: 1, width: "100%" }}>
        {/* Page Title & Subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          style={{ marginBottom: 28 }}
        >
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 34,
              fontWeight: 600,
              letterSpacing: "-0.015em",
              color: "#4A2818",
              marginBottom: 6,
            }}
          >
            Workspace <em style={{ fontStyle: "italic", color: "#B87345", fontFamily: "var(--font-serif)" }}>Settings</em>
          </h1>
          <p style={{ fontSize: 20.2, color: "#6E5B4F", margin: 0 }}>
            Manage your learning spaces, collaborate with others, and customise your experience.
          </p>
        </motion.div>

        {/* 2-Column Responsive Split Pane */}
        <div className="workspace-grid">
          {/* ======================================================== */}
          {/* LEFT COLUMN: Your Workspaces                             */}
          {/* ======================================================== */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            style={{
              background: "#FFFFFF",
              border: "2px solid #EAE4DE",
              borderRadius: 20,
              padding: "24px",
              boxShadow: "0 1px 3px rgba(45, 30, 21, 0.03)",
            }}
          >
            {/* Header: Title + Count + New Workspace Button */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: "#4A3024",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#E5B892",
                    flexShrink: 0,
                  }}
                >
                  <Layers size={17} strokeWidth={2.4} />
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: "#171514", margin: 0, whiteSpace: "nowrap" }}>
                  Your Workspaces
                </h2>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#FFFFFF",
                    background: "#4A3024",
                    padding: "3px 9px",
                    borderRadius: 9999,
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {workspaces.length}
                </span>
              </div>

              {/* + New Workspace Pill Button */}
              <button
                onClick={() => setShowNewModal(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#4A3024",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: 9999,
                  padding: "8px 18px",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  transition: "background 0.15s ease",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#5A3C2F")}
                onMouseOut={(e) => (e.currentTarget.style.background = "#4A3024")}
              >
                <Plus size={15} strokeWidth={2.4} />
                New Workspace
              </button>
            </div>

            {/* Search Input & Sort Dropdown */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
              {/* Search */}
              <div style={{ position: "relative", flex: 1 }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#77716D",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type="text"
                  placeholder="Search workspaces..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: "100%",
                    height: 38,
                    padding: "0 14px 0 36px",
                    fontSize: 18.8,
                    borderRadius: 9999,
                    border: "2px solid #EAE4DE",
                    background: "#FAF7F4",
                    color: "#171514",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Sort Pill Dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowSortDropdown(!showSortDropdown)}
                  style={{
                    height: 38,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 16px",
                    fontSize: 18,
                    fontWeight: 600,
                    borderRadius: 9999,
                    border: "2px solid #171514",
                    background: "#FFFFFF",
                    color: "#171514",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxSizing: "border-box",
                  }}
                >
                  <span>
                    {sortBy === "active"
                      ? "Last active"
                      : sortBy === "name"
                        ? "Name"
                        : sortBy === "concepts"
                          ? "Most concepts"
                          : "Most docs"}
                  </span>
                  <ChevronDown size={14} color="#171514" />
                </button>

                {showSortDropdown && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 4px)",
                      background: "#FFFFFF",
                      border: "2px solid #EAE4DE",
                      borderRadius: 12,
                      boxShadow: "0 10px 25px rgba(45, 30, 21, 0.12)",
                      padding: "4px",
                      zIndex: 30,
                      minWidth: 150,
                    }}
                  >
                    {[
                      { key: "active", label: "Last active" },
                      { key: "name", label: "Name (A-Z)" },
                      { key: "concepts", label: "Most concepts" },
                      { key: "docs", label: "Most documents" },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => {
                          setSortBy(opt.key as any);
                          setShowSortDropdown(false);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          fontSize: 18,
                          color: sortBy === opt.key ? "#FFFFFF" : "#171514",
                          fontWeight: sortBy === opt.key ? 700 : 400,
                          background: sortBy === opt.key ? "#171514" : "transparent",
                          border: "none",
                          borderRadius: 8,
                          cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Workspaces List (Darker Brown selection) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredWorkspaces.map((ws) => {
                const isSelected = ws.id === selectedId;
                return (
                  <div
                    key={ws.id}
                    onClick={() => {
                      setSelectedId(ws.id);
                      setIsEditingDetails(false);
                    }}
                    style={{
                      position: "relative",
                      borderRadius: 16,
                      background: isSelected ? "#4A3024" : "#FFFFFF",
                      border: isSelected ? "2px solid #5C3D2E" : "2px solid #EAE4DE",
                      boxShadow: isSelected
                        ? "0 8px 24px rgba(74, 48, 36, 0.22)"
                        : "0 1px 2px rgba(45, 30, 21, 0.02)",
                      padding: "16px 18px",
                      cursor: "pointer",
                      transition: "all 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  >
                    {/* Top Row: Icon + Title + Star + 3-Dots */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      {/* Left Icon Square */}
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 12,
                          background: isSelected ? "#5E3D2E" : ws.bgLight,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {renderIcon(ws.icon, 23, isSelected ? "#E5B892" : ws.color)}
                      </div>

                      {/* Info & Menu */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 21.8,
                              fontWeight: 700,
                              color: isSelected ? "#FFFFFF" : "#171514",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              lineHeight: 1.3,
                            }}
                          >
                            {ws.name}
                          </div>

                          <div
                            style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
                          >
                            {/* Star Toggle */}
                            <button
                              onClick={(e) => toggleStar(ws.id, e)}
                              style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: 2,
                                display: "flex",
                                alignItems: "center",
                              }}
                              title={ws.isStarred ? "Starred" : "Star workspace"}
                            >
                              <Star
                                size={15}
                                fill={ws.isStarred ? "#E5B892" : "none"}
                                color={ws.isStarred ? "#E5B892" : isSelected ? "#7A6353" : "#C7B8AD"}
                              />
                            </button>

                            {/* 3-dots Menu */}
                            <div style={{ position: "relative" }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenuWorkspaceId(
                                    actionMenuWorkspaceId === ws.id ? null : ws.id
                                  );
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: 2,
                                  color: isSelected ? "#BFAFA3" : "#77716D",
                                  display: "flex",
                                  alignItems: "center",
                                }}
                              >
                                <MoreHorizontal size={16} />
                              </button>

                              {actionMenuWorkspaceId === ws.id && (
                                <div
                                  style={{
                                    position: "absolute",
                                    right: 0,
                                    top: "100%",
                                    background: "#FFFFFF",
                                    border: "2px solid #EAE4DE",
                                    borderRadius: 10,
                                    boxShadow: "0 10px 25px rgba(45, 30, 21, 0.15)",
                                    padding: 4,
                                    zIndex: 40,
                                    minWidth: 130,
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      setSelectedId(ws.id);
                                      setIsEditingDetails(true);
                                      setActionMenuWorkspaceId(null);
                                    }}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: 18,
                                      color: "#171514",
                                      background: "transparent",
                                      border: "none",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Pencil size={13} />
                                    Rename
                                  </button>
                                  <button
                                    onClick={() => {
                                      toggleStar(ws.id);
                                      setActionMenuWorkspaceId(null);
                                    }}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: 18,
                                      color: "#171514",
                                      background: "transparent",
                                      border: "none",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Star size={13} />
                                    {ws.isStarred ? "Unstar" : "Star"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleDeleteWorkspace(ws.id);
                                      setActionMenuWorkspaceId(null);
                                    }}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      width: "100%",
                                      padding: "6px 10px",
                                      fontSize: 18,
                                      color: "#C74747",
                                      background: "transparent",
                                      border: "none",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Trash2 size={13} />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Active Status line right under Title */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 16.5,
                            fontWeight: 500,
                            color: isSelected ? "#E5B892" : "#8C5E3B",
                            marginTop: 3,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#22C55E",
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                          <span>{ws.activeTime || "\u2014"}</span>
                        </div>

                        {/* Description */}
                        <div
                          style={{
                            fontSize: 18,
                            color: isSelected ? "#D4C4B7" : "#77716D",
                            marginTop: 4,
                            lineHeight: 1.45,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {ws.description}
                        </div>
                      </div>
                    </div>

                    {/* Footer Row: Document, Concepts, Members */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: isSelected ? "1px solid #5C3D2E" : "1px solid #F3ECE6",
                        fontSize: 17.2,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, color: isSelected ? "#C8B7A9" : "#77716D" }}>
                          <FileText size={13} color={isSelected ? "#BFAFA3" : "#77716D"} />
                          <b style={{ color: isSelected ? "#FFFFFF" : "#171514" }}>{ws.docs}</b> docs
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, color: isSelected ? "#C8B7A9" : "#77716D" }}>
                          <Network size={13} color={isSelected ? "#BFAFA3" : "#77716D"} />
                          <b style={{ color: isSelected ? "#FFFFFF" : "#171514" }}>{ws.concepts}</b> concepts
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4, color: isSelected ? "#C8B7A9" : "#77716D" }}>
                          <Users size={13} color={isSelected ? "#BFAFA3" : "#77716D"} />
                          <b style={{ color: isSelected ? "#FFFFFF" : "#171514" }}>{ws.members}</b> {ws.members === 1 ? "member" : "members"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* ======================================================== */}
          {/* RIGHT COLUMN: Workspace Overview & Detailed Settings     */}
          {/* ======================================================== */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.18 }}
            style={{
              background: "#FFFFFF",
              border: "2px solid #EAE4DE",
              borderRadius: 20,
              padding: "24px 28px",
              boxShadow: "0 1px 3px rgba(45, 30, 21, 0.03)",
            }}
          >
            {/* Top Workspace Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {/* Large Rounded Icon */}
                <div
                  style={{
                    width: 58,
                    height: 58,
                    borderRadius: 16,
                    background: selectedWorkspace.bgLight,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {renderIcon(selectedWorkspace.icon, 30, selectedWorkspace.color)}
                </div>

                {/* Name, Category Pill, Star, Description */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <h2
                      style={{
                        fontSize: 30,
                        fontWeight: 800,
                        color: "#171514",
                        letterSpacing: "-0.03em",
                        margin: 0,
                        lineHeight: 1.25,
                      }}
                    >
                      {selectedWorkspace.name}
                    </h2>

                    {/* Darker Brown Category Pill */}
                    <span
                      style={{
                        fontSize: 17.2,
                        fontWeight: 600,
                        color: "#FFFFFF",
                        background: "#4A3024",
                        padding: "3px 12px",
                        borderRadius: 9999,
                      }}
                    >
                      {selectedWorkspace.category}
                    </span>

                    {/* Active Status Badge in Right Header */}
                    <span
                      style={{
                        fontSize: 16.5,
                        fontWeight: 500,
                        color: "#77716D",
                        background: "#FAF4EF",
                        border: "2px solid #EAE4DE",
                        padding: "2px 10px",
                        borderRadius: 9999,
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
                      {selectedWorkspace.activeTime || "\u2014"}
                    </span>

                    {/* Star Icon */}
                    <button
                      onClick={() => toggleStar(selectedWorkspace.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <Star
                        size={16}
                        fill={selectedWorkspace.isStarred ? "#E5B892" : "none"}
                        color={selectedWorkspace.isStarred ? "#E5B892" : "#C7B8AD"}
                      />
                    </button>
                  </div>

                  <p style={{ fontSize: 19.5, color: "#77716D", margin: "4px 0 0 0" }}>
                    {selectedWorkspace.description}
                  </p>
                </div>
              </div>

              {/* More Actions Dropdown */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                  style={{
                    height: 38,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 16px",
                    fontSize: 18.8,
                    fontWeight: 600,
                    borderRadius: 9999,
                    border: "2px solid #171514",
                    background: "#FFFFFF",
                    color: "#171514",
                    cursor: "pointer",
                    boxSizing: "border-box",
                  }}
                >
                  <span>More actions</span>
                  <ChevronDown size={14} color="#171514" />
                </button>

                {showActionsDropdown && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 6px)",
                      background: "#FFFFFF",
                      border: "2px solid #EAE4DE",
                      borderRadius: 12,
                      boxShadow: "0 10px 25px rgba(45, 30, 21, 0.15)",
                      padding: 6,
                      zIndex: 40,
                      minWidth: 170,
                    }}
                  >
                    <button
                      onClick={() => {
                        setIsEditingDetails(true);
                        setShowActionsDropdown(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: 18.8,
                        color: "#171514",
                        background: "transparent",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                      }}
                    >
                      <Pencil size={14} />
                      Edit workspace
                    </button>
                    <Link
                      href="/graph"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: 18.8,
                        color: "#171514",
                        textDecoration: "none",
                        borderRadius: 8,
                      }}
                    >
                      <Network size={14} />
                      Explore graph
                    </Link>
                    <Link
                      href="/upload"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: 18.8,
                        color: "#171514",
                        textDecoration: "none",
                        borderRadius: 8,
                      }}
                    >
                      <Upload size={14} />
                      Upload files
                    </Link>
                    <div style={{ height: 1, background: "#F3ECE6", margin: "4px 0" }} />
                    <button
                      onClick={() => {
                        handleDeleteWorkspace(selectedWorkspace.id);
                        setShowActionsDropdown(false);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: 18.8,
                        color: "#C74747",
                        background: "transparent",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={14} />
                      Delete workspace
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Segmented Darker Brown Pill Tabs Navigation */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 22,
                paddingBottom: 16,
                borderBottom: "1px solid #EAE4DE",
                flexWrap: "wrap",
              }}
            >
              {[
                { key: "overview", label: "Overview", icon: Layers },
                { key: "members", label: "Members", icon: Users },
                { key: "ai", label: "AI & Learning", icon: Sparkles },
                { key: "documents", label: "Documents", icon: FileText },
                { key: "sharing", label: "Sharing & Privacy", icon: Shield },
              ].map((tab) => {
                const isActive = activeTab === tab.key;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as TabKey)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 16px",
                      background: isActive ? "#4A3024" : "transparent",
                      border: "none",
                      borderRadius: 9999,
                      color: isActive ? "#FFFFFF" : "#77716D",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 18.8,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    onMouseOver={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "#FAF4EF";
                        e.currentTarget.style.color = "#171514";
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "#77716D";
                      }
                    }}
                  >
                    <Icon size={14} color={isActive ? "#E5B892" : "#77716D"} strokeWidth={2.2} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENT: Overview */}
            {activeTab === "overview" && (
              <div style={{ marginTop: 24 }}>
                {/* 4 Stat Summary Cards (Rich Dark Brown Surfaces) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 14,
                  }}
                >
                  {/* Card 1: Documents */}
                  <div
                    style={{
                      background: "#4A3024",
                      border: "2px solid #5C3D2E",
                      borderRadius: 16,
                      padding: "16px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      boxShadow: "0 4px 14px rgba(74, 48, 36, 0.16)",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: "#5E3D2E",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#E5B892",
                        flexShrink: 0,
                      }}
                    >
                      <FileText size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ fontSize: 33, fontWeight: 800, color: "#FFFFFF", lineHeight: 1 }}>
                        {selectedWorkspace.docs}
                      </div>
                      <div style={{ fontSize: 18, color: "#D4C4B7", marginTop: 4, fontWeight: 500 }}>
                        Documents
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Concepts */}
                  <div
                    style={{
                      background: "#4A3024",
                      border: "2px solid #5C3D2E",
                      borderRadius: 16,
                      padding: "16px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      boxShadow: "0 4px 14px rgba(74, 48, 36, 0.16)",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: "#5E3D2E",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#E5B892",
                        flexShrink: 0,
                      }}
                    >
                      <Network size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ fontSize: 33, fontWeight: 800, color: "#FFFFFF", lineHeight: 1 }}>
                        {selectedWorkspace.concepts}
                      </div>
                      <div style={{ fontSize: 18, color: "#D4C4B7", marginTop: 4, fontWeight: 500 }}>
                        Concepts
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Members */}
                  <div
                    style={{
                      background: "#4A3024",
                      border: "2px solid #5C3D2E",
                      borderRadius: 16,
                      padding: "16px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      boxShadow: "0 4px 14px rgba(74, 48, 36, 0.16)",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: "#5E3D2E",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#E5B892",
                        flexShrink: 0,
                      }}
                    >
                      <Users size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ fontSize: 33, fontWeight: 800, color: "#FFFFFF", lineHeight: 1 }}>
                        {selectedWorkspace.members}
                      </div>
                      <div style={{ fontSize: 18, color: "#D4C4B7", marginTop: 4, fontWeight: 500 }}>
                        Members
                      </div>
                    </div>
                  </div>

                  {/* Card 4: Created */}
                  <div
                    style={{
                      background: "#4A3024",
                      border: "2px solid #5C3D2E",
                      borderRadius: 16,
                      padding: "16px 18px",
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      boxShadow: "0 4px 14px rgba(74, 48, 36, 0.16)",
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: "#5E3D2E",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#E5B892",
                        flexShrink: 0,
                      }}
                    >
                      <Calendar size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.1 }}>
                        {selectedWorkspace.createdDate || "\u2014"}
                      </div>
                      <div style={{ fontSize: 18, color: "#D4C4B7", marginTop: 4, fontWeight: 500 }}>
                        Created
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Workspace Details */}
                <div
                  style={{
                    background: "#FFFFFF",
                    border: "2px solid #EAE4DE",
                    borderRadius: 18,
                    padding: "22px 24px",
                    marginTop: 20,
                  }}
                >
                  {/* Details Header: Dark Brown Badge + Title + Edit Button */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "#4A3024",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#E5B892",
                        }}
                      >
                        <Layers size={16} strokeWidth={2.4} />
                      </div>
                      <h3 style={{ fontSize: 22.5, fontWeight: 700, color: "#171514", margin: 0 }}>
                        Workspace details
                      </h3>
                    </div>

                    <button
                      onClick={() => setIsEditingDetails(!isEditingDetails)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 16px",
                        fontSize: 18,
                        fontWeight: 600,
                        borderRadius: 9999,
                        border: "2px solid #4A3024",
                        background: "#FFFFFF",
                        color: "#4A3024",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = "#4A3024";
                        e.currentTarget.style.color = "#FFFFFF";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = "#FFFFFF";
                        e.currentTarget.style.color = "#4A3024";
                      }}
                    >
                      <Pencil size={13} />
                      {isEditingDetails ? "Cancel" : "Edit"}
                    </button>
                  </div>

                  {/* Form or Readonly View */}
                  {isEditingDetails ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 18, fontWeight: 600, color: "#171514", display: "block", marginBottom: 4 }}>
                          Workspace Name
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "9px 14px",
                            fontSize: 19.5,
                            borderRadius: 9999,
                            border: "2px solid #EAE4DE",
                            outline: "none",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 18, fontWeight: 600, color: "#171514", display: "block", marginBottom: 4 }}>
                          Description
                        </label>
                        <textarea
                          rows={2}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "9px 14px",
                            fontSize: 19.5,
                            borderRadius: 12,
                            border: "2px solid #EAE4DE",
                            fontFamily: "var(--font-sans)",
                            outline: "none",
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: 18, fontWeight: 600, color: "#171514", display: "block", marginBottom: 6 }}>
                          Category
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                          {(["Coursework", "Research", "Project", "Personal"] as const).map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setEditCategory(cat)}
                              style={{
                                flex: 1,
                                padding: "7px 10px",
                                fontSize: 18,
                                fontWeight: 600,
                                borderRadius: 9999,
                                border: editCategory === cat ? "2px solid #4A3024" : "2px solid #EAE4DE",
                                background: editCategory === cat ? "#4A3024" : "#FFFFFF",
                                color: editCategory === cat ? "#FFFFFF" : "#77716D",
                                cursor: "pointer",
                              }}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                        <button
                          onClick={handleSaveDetails}
                          style={{
                            padding: "8px 20px",
                            background: "#4A3024",
                            color: "#FFFFFF",
                            border: "none",
                            borderRadius: 9999,
                            fontSize: 18.8,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Save changes
                        </button>
                        <button
                          onClick={() => setIsEditingDetails(false)}
                          style={{
                            padding: "8px 16px",
                            background: "#FAF4EF",
                            color: "#77716D",
                            border: "2px solid #EAE4DE",
                            borderRadius: 9999,
                            fontSize: 18.8,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {/* Name */}
                      <div style={{ display: "flex", alignItems: "center", minHeight: 38, borderBottom: "1px solid #F7F3EE" }}>
                        <div style={{ width: 140, fontSize: 19.5, fontWeight: 600, color: "#77716D", flexShrink: 0 }}>
                          Name
                        </div>
                        <div style={{ fontSize: 19.5, fontWeight: 600, color: "#171514" }}>
                          {selectedWorkspace.name}
                        </div>
                      </div>

                      {/* Description */}
                      <div style={{ display: "flex", alignItems: "flex-start", minHeight: 44, padding: "8px 0", borderBottom: "1px solid #F7F3EE" }}>
                        <div style={{ width: 140, fontSize: 19.5, fontWeight: 600, color: "#77716D", flexShrink: 0, paddingTop: 1 }}>
                          Description
                        </div>
                        <div style={{ fontSize: 19.5, color: "#54433A", flex: 1, lineHeight: 1.5 }}>
                          {selectedWorkspace.description}
                        </div>
                      </div>

                      {/* Category */}
                      <div style={{ display: "flex", alignItems: "center", minHeight: 38, borderBottom: "1px solid #F7F3EE" }}>
                        <div style={{ width: 140, fontSize: 19.5, fontWeight: 600, color: "#77716D", flexShrink: 0 }}>
                          Category
                        </div>
                        <span
                          style={{
                            fontSize: 17.2,
                            fontWeight: 600,
                            color: "#FFFFFF",
                            background: "#4A3024",
                            padding: "2px 12px",
                            borderRadius: 9999,
                          }}
                        >
                          {selectedWorkspace.category}
                        </span>
                      </div>

                      {/* Icon & Colour with 7 Swatches */}
                      <div style={{ display: "flex", alignItems: "center", minHeight: 46, borderBottom: "1px solid #F7F3EE" }}>
                        <div style={{ width: 140, fontSize: 19.5, fontWeight: 600, color: "#77716D", flexShrink: 0 }}>
                          Icon & colour
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                          {/* Mini icon preview */}
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: selectedWorkspace.bgLight,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {renderIcon(selectedWorkspace.icon, 18, selectedWorkspace.color)}
                          </div>

                          {/* 7 Color Swatches */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {COLOR_SWATCHES.map((swatch) => {
                              const isCurrent = selectedWorkspace.color === swatch.hex;
                              return (
                                <button
                                  key={swatch.hex}
                                  onClick={() => updateSelectedColor(swatch.hex, swatch.bg)}
                                  title={swatch.name}
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: "50%",
                                    background: swatch.hex,
                                    border: isCurrent ? "2px solid #FFFFFF" : "1px solid rgba(45,30,21,0.15)",
                                    boxShadow: isCurrent ? "0 0 0 2px #4A3024" : "none",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    padding: 0,
                                    transition: "all 0.12s ease",
                                  }}
                                >
                                  {isCurrent && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Created By & Timestamps */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          paddingTop: 16,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <div style={{ width: 140, fontSize: 19.5, fontWeight: 600, color: "#77716D", flexShrink: 0 }}>
                            Created by
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "#4A3024",
                                color: "#FFFFFF",
                                fontSize: 18,
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {selectedWorkspace.createdBy.avatar}
                            </div>
                            <span style={{ fontSize: 19.5, fontWeight: 600, color: "#171514" }}>
                              {selectedWorkspace.createdBy.name}
                            </span>
                            <span style={{ fontSize: 18, color: "#77716D" }}>
                              · {selectedWorkspace.createdBy.email}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 18 }}>
                          <div>
                            <span style={{ color: "#77716D", fontSize: 16.5 }}>Created on</span>
                            <div style={{ fontWeight: 600, color: "#171514", marginTop: 2 }}>
                              {selectedWorkspace.createdDate || "\u2014"}
                            </div>
                          </div>
                          <div>
                            <span style={{ color: "#77716D", fontSize: 16.5 }}>Last modified</span>
                            <div style={{ fontWeight: 600, color: "#171514", marginTop: 2 }}>
                              {selectedWorkspace.lastModified || "\u2014"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Recent Activity */}
                <div
                  style={{
                    background: "#FFFFFF",
                    border: "2px solid #EAE4DE",
                    borderRadius: 18,
                    padding: "22px 24px",
                    marginTop: 20,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 20,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: "#4A3024",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#E5B892",
                        }}
                      >
                        <Clock size={16} strokeWidth={2.4} />
                      </div>
                      <h3 style={{ fontSize: 22.5, fontWeight: 700, color: "#171514", margin: 0 }}>
                        Recent activity
                      </h3>
                    </div>

                    <button
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#171514",
                        fontSize: 18.8,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.textDecoration = "underline")}
                      onMouseOut={(e) => (e.currentTarget.style.textDecoration = "none")}
                    >
                      View all
                    </button>
                  </div>

                  {/* Connected Vertical Timeline */}
                  <div style={{ position: "relative" }}>
                    {([] as { id: string; title: string; subtitle: string | null; time: string; icon: any; iconColor: string }[]).map((act, index, arr) => {
                      const Icon = act.icon;
                      const isLast = index === arr.length - 1;
                      return (
                        <div
                          key={act.id}
                          style={{
                            position: "relative",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 16,
                            marginBottom: isLast ? 0 : 20,
                          }}
                        >
                          {/* Continuous Connecting Line */}
                          {!isLast && (
                            <div
                              style={{
                                position: "absolute",
                                left: 16,
                                top: 34,
                                bottom: -20,
                                width: 2,
                                background: "#EAE4DE",
                                zIndex: 1,
                              }}
                            />
                          )}

                          {/* Circular Timeline Dot (Darker Brown) */}
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: "50%",
                              background: "#4A3024",
                              color: act.iconColor,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              zIndex: 2,
                              flexShrink: 0,
                            }}
                          >
                            <Icon size={15} strokeWidth={2.2} />
                          </div>

                          {/* Activity Description */}
                          <div style={{ flex: 1, paddingTop: 2 }}>
                            <div style={{ fontSize: 19.5, fontWeight: 600, color: "#171514" }}>
                              {act.title}
                            </div>
                            {act.subtitle && (
                              <div style={{ fontSize: 18, color: "#77716D", marginTop: 2 }}>
                                {act.subtitle}
                              </div>
                            )}
                          </div>

                          {/* Timestamp */}
                          <div style={{ fontSize: 17.2, color: "#77716D", paddingTop: 4, flexShrink: 0 }}>
                            {act.time}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: Members */}
            {activeTab === "members" && (
              <div style={{ marginTop: 24 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: 24, fontWeight: 700, color: "#171514", margin: 0 }}>
                      Workspace members
                    </h3>
                    <p style={{ fontSize: 18.8, color: "#77716D", margin: "4px 0 0 0" }}>
                      Collaborate and manage access permissions for this workspace.
                    </p>
                  </div>
                  {currentMember && !isWorkspaceOwner && (
                    <button
                      onClick={handleLeaveWorkspace}
                      style={{ padding: "8px 14px", borderRadius: 9999, border: "1px solid #C74747", background: "#FFF5F5", color: "#991B1B", fontWeight: 600, cursor: "pointer" }}
                    >
                      Leave workspace
                    </button>
                  )}
                </div>

                {/* Invite Box */}
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    background: "#FAF7F4",
                    border: "2px solid #EAE4DE",
                    borderRadius: 14,
                    padding: 12,
                    marginBottom: 20,
                  }}
                >
                  <input
                    type="email"
                    placeholder="Enter colleague's email address..."
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    style={{
                      flex: 1,
                      height: 38,
                      padding: "0 16px",
                      fontSize: 18.8,
                      borderRadius: 9999,
                      border: "2px solid #EAE4DE",
                      background: "#FFFFFF",
                      color: "#171514",
                      boxSizing: "border-box",
                    }}
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    style={{
                      height: 38,
                      padding: "0 16px",
                      fontSize: 18.8,
                      borderRadius: 9999,
                      border: "2px solid #EAE4DE",
                      background: "#FFFFFF",
                      color: "#171514",
                      boxSizing: "border-box",
                    }}
                  >
                    <option value="Editor">Editor</option>
                    <option value="Reviewer">Reviewer</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                  <button
                    onClick={async () => {
                      const email = inviteEmail.trim();
                      if (!email || !selectedId) return;
                      try {
                        await addMember(selectedId, email);
                        setInviteEmail("");
                        const rows = await listMembers(selectedId);
                        setMembersList(rows.map((m) => ({
                          id: m.id,
                          name: m.display_name || m.email || "Member",
                          email: m.email,
                          role: m.role,
                          avatar: initialsOf(m.display_name || "", m.email),
                        })));
                      } catch (err) {
                        setLoadError(err instanceof Error ? err.message : "Could not add workspace member.");
                      }
                    }}
                    style={{
                      height: 38,
                      padding: "0 20px",
                      background: "#4A3024",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: 9999,
                      fontSize: 18.8,
                      fontWeight: 600,
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    Invite
                  </button>
                </div>

                {/* Members Table */}
                <div style={{ border: "2px solid #EAE4DE", borderRadius: 14, overflow: "hidden" }}>
                  {membersList.map((m, idx) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 20px",
                        background: idx % 2 === 0 ? "#FFFFFF" : "#FAF7F4",
                        borderBottom: idx === membersList.length - 1 ? "none" : "1px solid #F3ECE6",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: "50%",
                            background: m.role === "Owner" ? "#4A3024" : "#5A3825",
                            color: "#FFFFFF",
                            fontSize: 19.5,
                            fontWeight: 700,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {m.avatar}
                        </div>
                        <div>
                          <div style={{ fontSize: 19.5, fontWeight: 700, color: "#171514" }}>
                            {m.name}
                          </div>
                          <div style={{ fontSize: 17.2, color: "#77716D" }}>{m.email}</div>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span
                          style={{
                            fontSize: 17.2,
                            fontWeight: 600,
                            padding: "3px 12px",
                            borderRadius: 9999,
                            background: m.role === "Owner" ? "#4A3024" : "#FAF4EF",
                            color: m.role === "Owner" ? "#FFFFFF" : "#171514",
                            border: "2px solid #EAE4DE",
                          }}
                        >
                          {m.role}
                        </span>
                        {isWorkspaceOwner && m.role.trim().toLowerCase() !== "owner" && (
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#C74747",
                              cursor: "pointer",
                              padding: 4,
                            }}
                            title="Remove member"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB CONTENT: AI & Learning */}
            {activeTab === "ai" && (
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                {/* LLM Engine */}
                <div
                  style={{
                    border: "2px solid #EAE4DE",
                    borderRadius: 16,
                    padding: 22,
                    background: "#FFFFFF",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "#4A3024",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#E5B892",
                      }}
                    >
                      <Cpu size={16} strokeWidth={2.4} />
                    </div>
                    <h3 style={{ fontSize: 22.5, fontWeight: 700, color: "#171514", margin: 0 }}>
                      Primary Reasoning Model
                    </h3>
                  </div>
                  <p style={{ fontSize: 18.8, color: "#77716D", margin: "0 0 16px 0" }}>
                    Select the model powering concept graph synthesis and multi-hop reasoning.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div
                      style={{
                        border: "2px solid #5C3D2E",
                        background: "#4A3024",
                        color: "#FFFFFF",
                        borderRadius: 14,
                        padding: 16,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 19.5, fontWeight: 700, color: "#FFFFFF" }}>
                          Google Gemini 1.5 Flash
                        </span>
                        <Check size={16} color="#E5B892" strokeWidth={3} />
                      </div>
                      <p style={{ fontSize: 17.2, color: "#D4C4B7", margin: "6px 0 0 0", lineHeight: 1.45 }}>
                        Sub-second multi-hop verification with 1M context window. (Active)
                      </p>
                    </div>

                    <div
                      style={{
                        border: "2px solid #EAE4DE",
                        background: "#FFFFFF",
                        borderRadius: 14,
                        padding: 16,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 19.5, fontWeight: 700, color: "#171514" }}>
                          Groq Llama 3.3 70B
                        </span>
                      </div>
                      <p style={{ fontSize: 17.2, color: "#77716D", margin: "6px 0 0 0", lineHeight: 1.45 }}>
                        Ultra-low latency open-weights inference fallback.
                      </p>
                    </div>
                  </div>
                </div>

                {/* OCR Engine */}
                <div
                  style={{
                    border: "2px solid #EAE4DE",
                    borderRadius: 16,
                    padding: 22,
                    background: "#FFFFFF",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: "#4A3024",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#E5B892",
                      }}
                    >
                      <Database size={16} strokeWidth={2.4} />
                    </div>
                    <h3 style={{ fontSize: 22.5, fontWeight: 700, color: "#171514", margin: 0 }}>
                      PaddleOCR Document Processing Pipeline
                    </h3>
                  </div>
                  <p style={{ fontSize: 18.8, color: "#77716D", margin: "0 0 14px 0" }}>
                    Bilingual English/Devanagari text extraction with 90°/180° rotation recovery and bounding-box spatial indexing.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 18 }}>
                    <span style={{ background: "#4A3024", color: "#FFFFFF", padding: "4px 12px", borderRadius: 9999, fontWeight: 600 }}>
                      Operational
                    </span>
                    <span style={{ color: "#77716D" }}>Confidence threshold: 92%</span>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT: Documents */}
            {activeTab === "documents" && (
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                {/* 1. Drag & Drop Documents Here Card */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    handleFileUpload(e.dataTransfer.files);
                  }}
                  onClick={() => document.getElementById("workspace-hidden-file-input")?.click()}
                  style={{
                    background: isDragOver ? "#FFF9F5" : "#FFFFFF",
                    border: isDragOver ? "2px dashed #B98259" : "2px dashed #D9C3B0",
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
                    if (!isDragOver) {
                      e.currentTarget.style.borderColor = "#D9C3B0";
                      e.currentTarget.style.background = "#FFFFFF";
                    }
                  }}
                >
                  <input
                    id="workspace-hidden-file-input"
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <UploadCloud size={46} color="#C49A6C" strokeWidth={1.6} />
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#171514", marginTop: 8 }}>
                    Drag & Drop Documents Here
                  </div>
                  <div style={{ fontSize: 18.8, color: "#77716D", marginTop: 4 }}>
                    Supports PDF, PPTX, JPG, PNG, and YouTube links below
                  </div>
                </div>

                {/* 2. Add YouTube Video Section */}
                <div>
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
                      value={youtubeInput}
                      onChange={(e) => setYoutubeInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddYouTube()}
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
                      onClick={handleAddYouTube}
                      disabled={!youtubeInput.trim()}
                      style={{
                        height: 32,
                        padding: "0 18px",
                        borderRadius: 9999,
                        background: youtubeInput.trim() ? "#B98259" : "#EAE4DE",
                        color: "#FFFFFF",
                        border: "none",
                        fontSize: 18.8,
                        fontWeight: 600,
                        cursor: youtubeInput.trim() ? "pointer" : "not-allowed",
                        transition: "background 0.15s ease",
                      }}
                      onMouseOver={(e) => {
                        if (youtubeInput.trim()) e.currentTarget.style.background = "#6E472D";
                      }}
                      onMouseOut={(e) => {
                        if (youtubeInput.trim()) e.currentTarget.style.background = "#B98259";
                      }}
                    >
                      Add video
                    </button>
                  </div>
                </div>

                {/* 3. Uploaded & Shared Workspace Documents Section */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#171514",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          margin: 0,
                        }}
                      >
                        WORKSPACE DOCUMENTS ({filteredWorkspaceDocs.length})
                      </h4>

                      {/* Origin Filter Pills: All, Uploaded by You, Shared */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        {[
                          { key: "all", label: `All Documents (${docCounts.all})` },
                          { key: "uploaded", label: `Uploaded by You (${docCounts.uploaded})` },
                          { key: "shared", label: `Shared with You (${docCounts.shared})` },
                        ].map((filterTab) => {
                          const active = docOriginFilter === filterTab.key;
                          return (
                            <button
                              key={filterTab.key}
                              onClick={() => setDocOriginFilter(filterTab.key as any)}
                              style={{
                                height: 32,
                                padding: "0 14px",
                                borderRadius: 9999,
                                fontSize: 16.5,
                                fontWeight: active ? 700 : 500,
                                background: active ? "#171514" : "#FAF7F4",
                                color: active ? "#FFFFFF" : "#77716D",
                                border: active ? "1.5px solid #171514" : "1.5px solid #EAE4DE",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                            >
                              {filterTab.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

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
                        value={docSearch}
                        onChange={(e) => setDocSearch(e.target.value)}
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
                    {filteredWorkspaceDocs.length === 0 ? (
                      <div style={{ padding: "32px 20px", textAlign: "center", color: "#77716D", fontSize: 19.5 }}>
                        No matching documents found.
                      </div>
                    ) : (
                      filteredWorkspaceDocs.map((doc, idx) => (
                        <div
                          key={doc.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "13px 18px",
                            background: idx % 2 === 0 ? "#FFFFFF" : "#FAF7F4",
                            borderBottom: idx === filteredWorkspaceDocs.length - 1 ? "none" : "1px solid #F3ECE6",
                            transition: "background 0.15s ease",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 10,
                                background: "#FAF4EF",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {renderDocTypeIcon(doc.type)}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 20.2, fontWeight: 700, color: "#171514" }}>
                                  {doc.name}
                                </span>
                                {doc.origin === "shared" ? (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      background: "#FFF4EB",
                                      color: "#B98259",
                                      border: "1px solid #F0D9C7",
                                      padding: "2px 8px",
                                      borderRadius: 9999,
                                      fontSize: 13.5,
                                      fontWeight: 600,
                                    }}
                                  >
                                    <Users size={12} strokeWidth={2.2} /> Shared by {doc.uploadedBy}
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      background: "#FFF4EB",
                                      color: "#B98259",
                                      border: "1px solid #F0D9C7",
                                      padding: "2px 8px",
                                      borderRadius: 9999,
                                      fontSize: 13.5,
                                      fontWeight: 600,
                                    }}
                                  >
                                    <Upload size={12} strokeWidth={2.2} /> Uploaded by You
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 17.2, color: "#77716D", marginTop: 2 }}>
                                {doc.status} · {doc.version} {doc.size ? `· ${doc.size}` : ""} {doc.date ? `· ${doc.date}` : ""}
                              </div>
                            </div>
                          </div>

                          {/* 4 Action Buttons on Right: Eye, Rotate, Upload, Trash */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              title="Preview source document"
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
                              onClick={() => handleReprocessDocument(doc.name)}
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
                              <Upload size={14} />
                              <input
                                type="file"
                                hidden
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    setWorkspaceDocuments((prev) =>
                                      prev.map((item) =>
                                        item.id === doc.id
                                          ? {
                                              ...item,
                                              name: f.name,
                                              size: `${Math.round(f.size / 1024)} KB`,
                                              origin: "uploaded",
                                              uploadedBy: "You",
                                              date: "Just now",
                                            }
                                          : item
                                      )
                                    );
                                  }
                                }}
                              />
                            </label>

                            <button
                              onClick={() => handleDeleteDocument(doc.id)}
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
                                cursor: "pointer",
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
                </div>
              </div>
            )}

            {/* TAB CONTENT: Sharing & Privacy */}
            {activeTab === "sharing" && (
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Share Link */}
                <div
                  style={{
                    border: "2px solid #EAE4DE",
                    borderRadius: 16,
                    padding: 22,
                    background: "#FFFFFF",
                  }}
                >
                  <h3 style={{ fontSize: 22.5, fontWeight: 700, color: "#171514", margin: "0 0 6px 0" }}>
                    Public Sharing Link
                  </h3>
                  <p style={{ fontSize: 18.8, color: "#77716D", margin: "0 0 16px 0" }}>
                    Anyone with this link can view the concept graph and take practice quizzes.
                  </p>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      type="text"
                      readOnly
                      value={`https://conceptscape.app/share/${selectedWorkspace.id}`}
                      style={{
                        flex: 1,
                        height: 38,
                        padding: "0 16px",
                        fontSize: 18.8,
                        borderRadius: 9999,
                        border: "2px solid #EAE4DE",
                        background: "#FAF7F4",
                        color: "#171514",
                        boxSizing: "border-box",
                      }}
                    />
                    <button
                      onClick={() => alert("Share link copied to clipboard!")}
                      style={{
                        height: 38,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "0 20px",
                        background: "#4A3024",
                        color: "#FFFFFF",
                        border: "none",
                        borderRadius: 9999,
                        fontSize: 18.8,
                        fontWeight: 600,
                        cursor: "pointer",
                        boxSizing: "border-box",
                      }}
                    >
                      <Copy size={14} />
                      Copy Link
                    </button>
                  </div>
                </div>

                {/* Export Knowledge Graph */}
                <div
                  style={{
                    border: "2px solid #EAE4DE",
                    borderRadius: 16,
                    padding: 22,
                    background: "#FFFFFF",
                  }}
                >
                  <h3 style={{ fontSize: 22.5, fontWeight: 700, color: "#171514", margin: "0 0 6px 0" }}>
                    Export Knowledge Graph
                  </h3>
                  <p style={{ fontSize: 18.8, color: "#77716D", margin: "0 0 16px 0" }}>
                    Download workspace concepts and semantic dependencies in your preferred schema.
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    {["GraphML Format", "JSON-LD Graph", "Obsidian Markdown Vault"].map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => alert(`Exporting ${fmt}...`)}
                        style={{
                          height: 38,
                          padding: "0 18px",
                          fontSize: 18,
                          fontWeight: 600,
                          borderRadius: 9999,
                          border: "2px solid #171514",
                          background: "#FFFFFF",
                          color: "#171514",
                          cursor: "pointer",
                          boxSizing: "border-box",
                        }}
                      >
                        {fmt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Danger Zone */}
                <div
                  style={{
                    border: "2px solid #F5C6C6",
                    borderRadius: 16,
                    padding: 22,
                    background: "#FFF5F5",
                  }}
                >
                  <h3 style={{ fontSize: 22.5, fontWeight: 700, color: "#991B1B", margin: "0 0 6px 0" }}>
                    Danger Zone
                  </h3>
                  <p style={{ fontSize: 18.8, color: "#7F1D1D", margin: "0 0 14px 0" }}>
                    Deleting this workspace permanently removes all indexed concept nodes, citations, and quizzes.
                  </p>
                  <button
                    onClick={() => handleDeleteWorkspace(selectedWorkspace.id)}
                    style={{
                      height: 38,
                      padding: "0 20px",
                      background: "#C74747",
                      color: "#FFFFFF",
                      border: "none",
                      borderRadius: 9999,
                      fontSize: 18.8,
                      fontWeight: 600,
                      cursor: "pointer",
                      boxSizing: "border-box",
                    }}
                  >
                    Delete this workspace
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <Footer />

      {/* ======================================================== */}
      {/* MODAL: Create New Workspace                              */}
      {/* ======================================================== */}
      {showNewModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(35, 22, 13, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}
          onClick={() => setShowNewModal(false)}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 20,
              width: "100%",
              maxWidth: 500,
              padding: 28,
              boxShadow: "0 20px 40px rgba(45, 30, 21, 0.25)",
              border: "2px solid #EAE4DE",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 30, fontWeight: 800, color: "#171514", margin: "0 0 6px 0" }}>
              Create New Workspace
            </h2>
            <p style={{ fontSize: 19.5, color: "#77716D", margin: "0 0 20px 0" }}>
              Organize notes, lecture slides, and concept graphs for a specific course or project.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 18.8, fontWeight: 600, color: "#171514", display: "block", marginBottom: 6 }}>
                  Workspace Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Distributed Systems Lab"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{
                    width: "100%",
                    height: 40,
                    padding: "0 16px",
                    fontSize: 19.5,
                    borderRadius: 9999,
                    border: "2px solid #EAE4DE",
                    background: "#FAF7F4",
                    color: "#171514",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 18.8, fontWeight: 600, color: "#171514", display: "block", marginBottom: 6 }}>
                  Category
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["Coursework", "Research", "Project", "Personal"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewCategory(cat)}
                      style={{
                        flex: 1,
                        padding: "8px 10px",
                        fontSize: 18,
                        fontWeight: 600,
                        borderRadius: 9999,
                        border: newCategory === cat ? "2px solid #171514" : "2px solid #EAE4DE",
                        background: newCategory === cat ? "#171514" : "#FFFFFF",
                        color: newCategory === cat ? "#FFFFFF" : "#77716D",
                        cursor: "pointer",
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 18.8, fontWeight: 600, color: "#171514", display: "block", marginBottom: 6 }}>
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="What is this workspace focused on?"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    fontSize: 19.5,
                    borderRadius: 12,
                    border: "2px solid #EAE4DE",
                    background: "#FAF7F4",
                    color: "#171514",
                    fontFamily: "var(--font-sans)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Icon Choice */}
              <div>
                <label style={{ fontSize: 18.8, fontWeight: 600, color: "#171514", display: "block", marginBottom: 6 }}>
                  Workspace Icon
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  {(["brain", "book", "gradCap", "chart", "layers"] as const).map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setNewIcon(ic)}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        border: newIcon === ic ? "2px solid #171514" : "2px solid #EAE4DE",
                        background: newIcon === ic ? "#171514" : "#FFFFFF",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {renderIcon(ic, 22, newIcon === ic ? "#E5B892" : newColor)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Swatch Choice */}
              <div>
                <label style={{ fontSize: 18.8, fontWeight: 600, color: "#171514", display: "block", marginBottom: 6 }}>
                  Theme Color
                </label>
                <div style={{ display: "flex", gap: 10 }}>
                  {COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch.hex}
                      type="button"
                      onClick={() => {
                        setNewColor(swatch.hex);
                        setNewBgLight(swatch.bg);
                      }}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: swatch.hex,
                        border: newColor === swatch.hex ? "2px solid #FFFFFF" : "1px solid rgba(45,30,21,0.15)",
                        boxShadow: newColor === swatch.hex ? "0 0 0 2px #171514" : "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                      }}
                    >
                      {newColor === swatch.hex && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  style={{
                    padding: "9px 18px",
                    background: "#FAF4EF",
                    color: "#77716D",
                    border: "2px solid #EAE4DE",
                    borderRadius: 9999,
                    fontSize: 19.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateWorkspace}
                  style={{
                    padding: "9px 22px",
                    background: "#4A3024",
                    color: "#FFFFFF",
                    border: "none",
                    borderRadius: 9999,
                    fontSize: 19.5,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Create Workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div
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
          onClick={() => setPreviewDoc(null)}
        >
          <div
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
                    background: "#4A3024",
                    color: "#E5B892",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {renderDocTypeIcon(previewDoc.type)}
                </div>
                <div>
                  <h3 style={{ fontSize: 21.8, fontWeight: 700, color: "#171514", margin: 0 }}>
                    {previewDoc.name}
                  </h3>
                  <span style={{ fontSize: 17.2, color: "#77716D" }}>
                    {previewDoc.version} • {previewDoc.size}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
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
                  const docName = previewDoc.name;
                  setPreviewDoc(null);
                  handleReprocessDocument(docName);
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
                onClick={() => setPreviewDoc(null)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 9999,
                  border: "none",
                  background: "#4A3024",
                  color: "#FFFFFF",
                  fontSize: 18.8,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
