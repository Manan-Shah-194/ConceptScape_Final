import { authHeaders, clearSession, getSubjectId, setSubjectId, setWorkspaceId } from "./auth";
import type { ConceptEdge, ConceptNode, GraphExport } from "./graph";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

/** A failed call, carrying what the server said about it. */
export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Timeouts, in milliseconds. Reads stay short so an unreachable API is noticed
 * quickly; generation waits on a language model and needs real room.
 */
export const TIMEOUT_READ = 8000;
export const TIMEOUT_WRITE = 20000;
export const TIMEOUT_GENERATE = 120000;

/** The message the server sent, when it sent one. */
async function describeFailure(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail ?? body?.message;
    if (typeof detail === "string" && detail.trim()) return detail;
  } catch {
    // Not JSON — fall through to the status line.
  }
  return `${res.status} ${res.statusText || "request failed"}`;
}

function handleUnauthorized(res: Response): void {
  if (res.status !== 401 || typeof window === "undefined") return;
  clearSession();
  if (!window.location.pathname.startsWith("/login")) window.location.assign("/login");
}

function failure(err: unknown, timeoutMs: number): ApiError {
  if (err instanceof ApiError) return err;
  const aborted = err instanceof DOMException && err.name === "AbortError";
  return new ApiError(
    0,
    aborted
      ? `The request timed out after ${Math.round(timeoutMs / 1000)}s.`
      : `Could not reach the API at ${API_BASE}.`
  );
}

function isSubjectScopedCollectionRead(url: string): boolean {
  const path = url.split("?", 1)[0];
  return path.endsWith("/documents") || path.endsWith("/pipeline/status") || path.endsWith("/workspace/stats");
}

function isWorkspaceScopedCollectionRead(url: string): boolean {
  const path = url.split("?", 1)[0];
  return path.endsWith("/documents") || path.endsWith("/pipeline/status") ||
    path.endsWith("/workspace/stats") || path.endsWith("/subjects");
}

function hasSubjectHeader(options?: RequestInit): boolean {
  if (!options?.headers) return false;
  const headers = new Headers(options.headers);
  return headers.has("X-Subject-ID") && Boolean(headers.get("X-Subject-ID"));
}

/**
 * Read from the API.
 *
 * There is no fallback: a failure is raised so the caller can show what went
 * wrong. Substituting placeholder content on a 401 or a 503 hides an expired
 * session or an unbuilt corpus behind a screen that looks like it is working.
 */
async function apiFetch<T>(
  url: string,
  options?: RequestInit,
  timeoutMs: number = TIMEOUT_READ
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (res.status === 404 && isWorkspaceScopedCollectionRead(url)) {
      // Account/workspace ids can briefly be stale while a tab switches
      // accounts. First remove a stale subject, then recover the workspace
      // from the authenticated user's own workspace list.
      let retry = res;
      if (isSubjectScopedCollectionRead(url) && hasSubjectHeader(options) && getSubjectId()) {
        setSubjectId(null);
        retry = await fetch(url, { ...options, headers: authHeaders(), signal: controller.signal });
        if (retry.ok) return (await retry.json()) as T;
      }
      if (retry.status === 404) {
        const workspaceResponse = await fetch(`${API_BASE}/workspaces`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (workspaceResponse.ok) {
          const body = await workspaceResponse.json();
          const firstWorkspace = body?.workspaces?.[0];
          if (firstWorkspace?.id) {
            setWorkspaceId(firstWorkspace.id);
            setSubjectId(null);
            retry = await fetch(url, { ...options, headers: authHeaders(), signal: controller.signal });
            if (retry.ok) return (await retry.json()) as T;
          }
        }
      }
    }
    if (!res.ok) {
      handleUnauthorized(res);
      throw new ApiError(res.status, await describeFailure(res));
    }
    return (await res.json()) as T;
  } catch (err) {
    throw failure(err, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

/** Write to the API. Returns on success, raises otherwise. */
async function apiSend(
  url: string,
  options: RequestInit,
  timeoutMs: number = TIMEOUT_WRITE
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      handleUnauthorized(res);
      throw new ApiError(res.status, await describeFailure(res));
    }
  } catch (err) {
    throw failure(err, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

export type Citation = {
  index?: number;
  citation_id?: number;
  kind?: "concept" | "relationship" | "chunk";
  text: string;
  concept_name?: string;
  filename: string;
  page_number: number;
  chunk_id?: string;
  relationship?: string;
  similarity_score?: number;
};

export type AskResponse = {
  query?: string;
  query_type?: "A" | "B" | "C";
  query_type_label?: string;
  answer: string;
  sufficient_evidence?: boolean;
  flags?: string[];
  concepts_identified?: string[];
  retriever_used?: string;
  model_used?: string;
  used_citations?: number[];
  citations: Citation[];
  session_id?: string;
  entities?: { concept_id: string; canonical_name: string; confidence: number }[];
  confidence_score?: number;
  graph_context?: string;
};

export async function ask(query: string, sessionId?: string): Promise<AskResponse> {
  return apiFetch(
    `${API_BASE}/ask`,
    {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ query, ...(sessionId ? { session_id: sessionId } : {}) }),
    },
    TIMEOUT_GENERATE,
  );
}

export const FLAG_LABELS: Record<string, string> = {
  thin_evidence: "Few sources found — treat this answer with caution",
  no_evidence_retrieved: "Nothing in the indexed material matched this question",
  hallucinated_citation: "The model cited a source that does not exist; it was removed",
  invalid_citation_removed: "An invalid citation reference was removed",
  uncited_answer: "The answer made claims without citing a source",
  partial_evidence: "The evidence only partly covers this question",
  conflicting_sources: "Sources disagree with each other",
  ocr_quality: "Quoted text is garbled — it came from a scanned page",
  generation_failed: "Answer generation failed — all model providers were unavailable",
  parse_failure: "The model response could not be parsed",
};

// --- Health / Stats ---
export type HealthStatus = {
  status: string;
  artifacts: {
    concepts: boolean;
    relationships: boolean;
    graph: boolean;
    chunks: boolean;
  };
};

export async function getHealth(): Promise<HealthStatus> {
  return apiFetch(`${API_BASE}/health`, undefined);
}

// --- Upload & Pipeline API ---

export type Doc = {
  filename: string;
  size_bytes: number;
  suffix: string;
  status?: string;
  error?: string | null;
  version?: number;
  uploaded_at?: string | null;
  processed_at?: string | null;
};

export type Stage = { key: string; label: string; status: string; detail: string; seconds: number };

export type PipelineStatus = {
  running: boolean;
  current: string | null;
  error: string | null;
  stages: Stage[];
  elapsed: number;
};

export type WorkspaceStats = {
  documents: number;
  chunks: number;
  concepts: number;
  edges: number;
};

export async function getWorkspaceStats(workspaceId?: string): Promise<WorkspaceStats> {
  const headers = new Headers(authHeaders());
  if (workspaceId) {
    headers.set("X-Workspace-ID", workspaceId);
    headers.delete("X-Subject-ID");
  }
  return apiFetch(`${API_BASE}/workspace/stats`, { headers });
}

export async function listDocuments(): Promise<{ documents: Doc[] }> {
  return apiFetch(
    `${API_BASE}/documents`,
    { headers: authHeaders() });
}

export async function uploadDocument(file: File): Promise<void> {
  const body = new FormData();
  body.append("files", file);
  await apiSend(`${API_BASE}/documents`, { method: "POST", headers: authHeaders(), body });
}

export type ChatSession = { id: string; title: string; created_at?: string; messages?: any[] };

export async function listChatSessions(): Promise<ChatSession[]> {
  return apiFetch(
    `${API_BASE}/chat/sessions`,
    { headers: authHeaders() });
}

export async function getChatSession(
  id: string
): Promise<{ id: string; title: string; messages: { role: string; content: string; metadata?: AskResponse }[] }> {
  return apiFetch(
    `${API_BASE}/chat/sessions/${encodeURIComponent(id)}`,
    { headers: authHeaders() });
}

export async function renameChatSession(id: string, title: string): Promise<void> {
  await apiSend(`${API_BASE}/chat/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify({ title }),
  });
}

export async function deleteChatSession(id: string): Promise<void> {
  await apiSend(`${API_BASE}/chat/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function addYouTube(url: string): Promise<void> {
  await apiSend(`${API_BASE}/documents/youtube`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ url }),
  });
}

export async function listWorkspaces(): Promise<{ id: string; name: string; role: string }[]> {
  const response = await apiFetch<{ workspaces: { id: string; name: string; role: string }[] }>(
    `${API_BASE}/workspaces`,
    { headers: authHeaders() });
  return response.workspaces;
}

export async function createWorkspace(name: string): Promise<{ id: string; name: string }> {
  return apiFetch(`${API_BASE}/workspaces`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ name }),
  });
}

export async function renameWorkspace(id: string, name: string): Promise<{ id: string; name: string; role: string }> {
  return apiFetch(`${API_BASE}/workspaces/${id}`, {
    method: "PATCH",
    headers: authHeaders(true),
    body: JSON.stringify({ name }),
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  await apiSend(`${API_BASE}/workspaces/${id}`, { method: "DELETE", headers: authHeaders() });
}

export async function listMembers(
  workspaceId: string
): Promise<{ id: string; email: string; display_name: string; role: string }[]> {
  const response = await apiFetch<{ members: { id: string; email: string; display_name: string; role: string }[] }>(
    `${API_BASE}/workspaces/${workspaceId}/members`,
    { headers: authHeaders() });
  return response.members;
}

export async function addMember(workspaceId: string, email: string): Promise<void> {
  await apiSend(`${API_BASE}/workspaces/${workspaceId}/members`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ email }),
  });
}

export async function removeMember(workspaceId: string, memberId: string): Promise<void> {
  await apiSend(`${API_BASE}/workspaces/${workspaceId}/members/${encodeURIComponent(memberId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function leaveWorkspace(workspaceId: string): Promise<void> {
  await apiSend(`${API_BASE}/workspaces/${workspaceId}/leave`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export type NotificationItem = {
  id: string;
  kind: string;
  status: string;
  payload: Record<string, string>;
  created_at: string;
};

export async function listNotifications(): Promise<NotificationItem[]> {
  const response = await apiFetch<{ notifications: NotificationItem[] }>(`${API_BASE}/notifications`, {
    headers: authHeaders(),
  });
  return response.notifications;
}

export async function respondToNotification(id: string, action: "accept" | "decline"): Promise<void> {
  await apiSend(`${API_BASE}/notifications/${encodeURIComponent(id)}/respond`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ action }),
  });
}

export async function removeDocument(filename: string): Promise<void> {
  await apiSend(`${API_BASE}/documents/${encodeURIComponent(filename)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function replaceDocument(filename: string, file: File): Promise<void> {
  await uploadDocument(file);
}

export async function reprocessDocument(filename: string): Promise<void> {
  await apiSend(`${API_BASE}/documents/${encodeURIComponent(filename)}/reprocess`, {
    method: "POST",
    headers: authHeaders(),
  });
}

export async function restoreDocumentVersion(filename: string, version: number): Promise<void> {
  await apiSend(
    `${API_BASE}/documents/${encodeURIComponent(filename)}/versions/${version}/restore`,
    { method: "POST", headers: authHeaders() }
  );
}

export function documentPreviewUrl(filename: string): string {
  return `${API_BASE}/documents/${encodeURIComponent(filename)}/preview`;
}

export async function loadDocumentPreview(filename: string): Promise<string> {
  const r = await fetch(documentPreviewUrl(filename), { headers: authHeaders() });
  if (!r.ok) throw new Error(`Could not load preview for ${filename}.`);
  return URL.createObjectURL(await r.blob());
}

export async function getStatus(): Promise<PipelineStatus> {
  return apiFetch(
    `${API_BASE}/pipeline/status`,
    { headers: authHeaders() });
}

export async function getGraph(
  filters: { document?: string; relation_type?: string; min_confidence?: number; connected_only?: boolean } = {}
): Promise<GraphExport> {
  return apiFetch(
    `${API_BASE}/graph`,
    { headers: authHeaders() });
}

export async function getGraphNeighbors(conceptId: string, hops = 1): Promise<{ nodes: any[]; edges: any[] }> {
  return apiFetch(
    `${API_BASE}/graph/neighbors/${encodeURIComponent(conceptId)}?hops=${hops}`,
    { headers: authHeaders() });
}

export async function getGraphPaths(sourceId: string, targetId: string, maxHops = 4): Promise<{ paths: any[] }> {
  return apiFetch(
    `${API_BASE}/graph/paths?source_id=${encodeURIComponent(sourceId)}&target_id=${encodeURIComponent(targetId)}&max_hops=${maxHops}`,
    { headers: authHeaders() });
}

export async function getPrerequisiteGraph(conceptId: string): Promise<{ nodes: any[]; edges: any[] }> {
  return apiFetch(
    `${API_BASE}/graph/prerequisites/${encodeURIComponent(conceptId)}`,
    { headers: authHeaders() });
}

export async function getLearningPath(conceptId: string): Promise<any> {
  return apiFetch(
    `${API_BASE}/learning-paths/${encodeURIComponent(conceptId)}`,
    { headers: authHeaders() },
    TIMEOUT_GENERATE,
  );
}

export async function explainConcept(
  conceptId: string,
  mode: "simple" = "simple",
  sessionId?: string
): Promise<AskResponse> {
  return apiFetch(
    `${API_BASE}/explain`,
    {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ concept_id: conceptId, mode, ...(sessionId ? { session_id: sessionId } : {}) }),
    },
    TIMEOUT_GENERATE,
  );
}

export async function getQuiz(conceptId: string, type = "multiple_choice"): Promise<any> {
  return apiFetch(
    `${API_BASE}/quiz/${encodeURIComponent(conceptId)}?question_type=${type}`,
    { headers: authHeaders() },
    TIMEOUT_GENERATE,
  );
}

export async function submitQuiz(conceptId: string, questionType: string, question: any, answer: string): Promise<any> {
  return apiFetch(
    `${API_BASE}/quiz/attempts`,
    {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        concept_id: conceptId,
        question_type: questionType,
        question_id: question.id,
        question: question.question,
        expected_answer: question.expected_answer || "",
        correct_option_id: question.correct_option_id || "",
        options: question.options || [],
        answer,
      }),
    },
    TIMEOUT_GENERATE,
  );
}

export async function updateConceptProgress(
  conceptId: string,
  status: string,
  confidence: number
): Promise<void> {
  await apiSend(`${API_BASE}/progress/concepts/${encodeURIComponent(conceptId)}`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ status, confidence }),
  });
}

export async function updatePathProgress(conceptId: string, status: string): Promise<void> {
  await apiSend(`${API_BASE}/progress/paths/${encodeURIComponent(conceptId)}`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ status }),
  });
}

export async function getProgress(): Promise<any> {
  return apiFetch(
    `${API_BASE}/progress`,
    { headers: authHeaders() });
}

export type Subject = { id: string; name: string; document_count?: number };

export async function listSubjects(): Promise<Subject[]> {
  const response = await apiFetch<{ subjects: Subject[] }>(`${API_BASE}/subjects`, { headers: authHeaders() });
  const saved = getSubjectId();
  if (saved && !response.subjects.some((subject) => subject.id === saved)) setSubjectId(null);
  return response.subjects;
}

export async function createSubject(name: string): Promise<Subject> {
  return apiFetch<Subject>(`${API_BASE}/subjects`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({ name }) });
}

export async function deleteSubject(id: string): Promise<void> {
  await apiSend(`${API_BASE}/subjects/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
}

export async function runPipeline(): Promise<void> {
  await apiSend(`${API_BASE}/pipeline/run`, { method: "POST", headers: authHeaders() });
}

/** Render a source position in the unit it was measured in. */
export function formatLocation(type: string, n: number): string {
  if (!n && n !== 0) return "";
  if (type === "timestamp") {
    const m = Math.floor(n / 60),
      s = n % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  if (type === "slide") return `slide ${n}`;
  if (type === "page") return `p${n}`;
  return String(n);
}
