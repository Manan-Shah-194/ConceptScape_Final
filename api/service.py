import json
import logging
import os
import hashlib
import shutil
import time
import zipfile
import io
from collections import defaultdict
from fastapi.responses import FileResponse, Response
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from api.pipeline_runner import PipelineRunner, SETTINGS_LOCK
from auth.dependencies import current_user, workspace_for_user
from auth.schemas import LoginRequest, RegisterRequest, WorkspaceMemberRequest, WorkspaceRequest
from auth.security import create_access_token, hash_password, verify_password
from config import settings
from ingestion.youtube_parser import extract_video_id
from logging_setup import configure_logging
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from sqlalchemy.orm import Session
from storage.database import SessionLocal, get_db, init_db
from storage.models import (ChatMessage, ChatSession, ConceptProgress, DocumentRecord, DocumentVersion,
                            LearningPathProgress, Notification, PipelineJob, QuizAttempt, AuditLog, Subject, User, Workspace)
from storage.paths import ensure_subject_paths, ensure_workspace_paths
from learning.quiz import evaluate_answer, generate_quiz as generate_ai_quiz

configure_logging()

app = FastAPI(title="ConceptScape API", version="1.0")
_rate_buckets: dict[str, list[float]] = defaultdict(list)
_metrics = {"requests_total": 0, "errors_total": 0, "pipeline_jobs_total": 0}
_redis_limiter = None
if settings.redis_url:
    try:
        import redis
        _redis_limiter = redis.from_url(settings.redis_url, decode_responses=True)
    except Exception:
        logging.exception("Redis rate limiting unavailable; using local fallback")
if settings.sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.environment, traces_sample_rate=0.1)
    except Exception:
        logging.exception("Sentry initialisation failed")


@app.middleware("http")
async def security_and_metrics(request: Request, call_next):
    now = time.time()
    client = request.client.host if request.client else "unknown"
    limited = False
    if request.url.path not in {"/health", "/metrics"}:
        if _redis_limiter is not None:
            key = f"conceptscape:rate:{client}:{int(now // 60)}"
            try:
                count = _redis_limiter.incr(key)
                _redis_limiter.expire(key, 70)
                limited = count > settings.rate_limit_per_minute
            except Exception:
                logging.exception("Redis rate limit request failed")
        else:
            bucket = _rate_buckets[client]
            _rate_buckets[client] = [stamp for stamp in bucket if now - stamp < 60]
            limited = len(_rate_buckets[client]) >= settings.rate_limit_per_minute
            _rate_buckets[client].append(now)
    if limited:
        return Response("Rate limit exceeded", status_code=429, headers={"Retry-After": "60"})
    _metrics["requests_total"] += 1
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        _metrics["errors_total"] += 1
        raise
    response.headers["X-Request-ID"] = request.headers.get("X-Request-ID", os.urandom(8).hex())
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-src 'self' blob:; img-src 'self' data: blob:"
    if response.status_code >= 500:
        _metrics["errors_total"] += 1
    logging.info(json.dumps({"event": "request", "method": request.method, "path": request.url.path,
                             "status": response.status_code, "duration_ms": round((time.perf_counter() - started) * 1000, 2)}))
    return response


@app.on_event("startup")
def create_product_tables() -> None:
    if settings.environment in {"staging", "production"}:
        if not settings.jwt_secret or settings.jwt_secret.startswith("generate-") or settings.jwt_secret.startswith("REPLACE"):
            raise RuntimeError("A real CONCEPTSCAPE_JWT_SECRET is required outside development")
        if "sqlite" in settings.database_url:
            logging.warning("Production is using SQLite; configure PostgreSQL for durable multi-instance deployment")
    init_db()
    db = SessionLocal()
    try:
        db.query(PipelineJob).filter(PipelineJob.status.in_(["queued", "running"])).update(
            {PipelineJob.status: "interrupted", PipelineJob.error: "API restarted before this job completed"},
            synchronize_session=False,
        )
        db.commit()
    finally:
        db.close()

# The Next.js dev server runs on a different origin, so the browser needs
# explicit permission to call this service.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.api_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: Optional[int] = None
    session_id: Optional[str] = None


class YouTubeRequest(BaseModel):
    url: str = Field(..., min_length=11, max_length=500)


class ChatRenameRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class ExplainRequest(BaseModel):
    concept_id: str = Field(..., min_length=1, max_length=160)
    mode: str = Field(default="simple", pattern="^simple$")
    session_id: Optional[str] = None


class ProgressRequest(BaseModel):
    status: str = Field(..., pattern="^(started|learned|revisit)$")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class PathProgressRequest(BaseModel):
    status: str = Field(..., pattern="^(not_started|in_progress|completed)$")


class QuizAttemptRequest(BaseModel):
    concept_id: str = Field(..., min_length=1, max_length=160)
    question_type: str = Field(default="multiple_choice", pattern="^(multiple_choice|short_answer|relationship)$")
    question_id: str = Field(..., min_length=1, max_length=160)
    question: str = Field(..., min_length=1, max_length=2000)
    expected_answer: str = Field(default="", max_length=4000)
    correct_option_id: str = Field(default="", max_length=100)
    options: List[Dict[str, str]] = Field(default_factory=list)
    answer: str = Field(..., min_length=1, max_length=2000)


class SubjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)


@app.post("/auth/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    email = req.email.strip().casefold()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(email=email, password_hash=hash_password(req.password), display_name=req.display_name.strip())
    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists") from exc
    db.refresh(user)
    workspace = Workspace(name=f"{user.display_name}'s workspace", created_by=user.id)
    workspace.members.append(user)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return {"user": {"id": user.id, "email": user.email, "display_name": user.display_name},
            "access_token": create_access_token(user.id), "token_type": "bearer",
            "workspace": {"id": workspace.id, "name": workspace.name}}


@app.post("/auth/login")
def login(req: LoginRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    user = db.query(User).filter(User.email == req.email.strip().casefold()).first()
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    workspace = user.workspaces[0] if user.workspaces else None
    return {"user": {"id": user.id, "email": user.email, "display_name": user.display_name},
            "access_token": create_access_token(user.id), "token_type": "bearer",
            "workspace": ({"id": workspace.id, "name": workspace.name} if workspace else None)}


@app.get("/auth/me")
def me(user: User = Depends(current_user)) -> Dict[str, Any]:
    return {"id": user.id, "email": user.email, "display_name": user.display_name}


@app.post("/workspaces")
def create_workspace(
    req: WorkspaceRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    workspace = Workspace(name=req.name.strip(), created_by=user.id)
    workspace.members.append(user)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return {"id": workspace.id, "name": workspace.name, "role": "owner"}


@app.get("/workspaces")
def list_workspaces(user: User = Depends(current_user)) -> Dict[str, Any]:
    return {"workspaces": [{"id": w.id, "name": w.name, "role": "owner" if w.created_by == user.id else "member"}
                            for w in user.workspaces]}


@app.patch("/workspaces/{workspace_id}")
def rename_workspace(workspace_id: str, req: WorkspaceRequest,
                     user: User = Depends(current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    workspace = workspace_for_user(workspace_id, user, db)
    _require_owner(workspace, user)
    workspace.name = req.name.strip()
    _audit(db, workspace.id, user.id, "workspace.rename", "workspace", workspace.id, {"name": workspace.name})
    db.commit()
    return {"id": workspace.id, "name": workspace.name, "role": "owner"}


@app.delete("/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    workspace = workspace_for_user(workspace_id, user, db)
    _require_owner(workspace, user)
    workspace_root = ensure_workspace_paths(workspace.id)["root"]
    _audit(db, workspace.id, user.id, "workspace.delete", "workspace", workspace.id)
    db.delete(workspace)
    db.commit()
    if workspace_root.exists():
        shutil.rmtree(workspace_root)
    return {"deleted": workspace_id}


def current_workspace(
    x_workspace_id: str | None = Header(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Workspace:
    if not x_workspace_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "X-Workspace-ID header is required")
    workspace = workspace_for_user(x_workspace_id, user, db)
    ensure_workspace_paths(workspace.id)
    return workspace


def subject_for_workspace(subject_id: str, workspace: Workspace, db: Session) -> Subject:
    subject = db.query(Subject).filter_by(id=subject_id, workspace_id=workspace.id).first()
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subject not found in this workspace")
    return subject


@app.get("/subjects")
def list_subjects(workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    subjects = db.query(Subject).filter_by(workspace_id=workspace.id).order_by(Subject.name.asc()).all()
    return {"subjects": [{"id": item.id, "name": item.name, "document_count": len(item.documents)} for item in subjects]}


@app.post("/subjects")
def create_subject(req: SubjectRequest, workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    name = req.name.strip()
    if db.query(Subject).filter_by(workspace_id=workspace.id, name=name).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "A subject with this name already exists")
    subject = Subject(workspace_id=workspace.id, name=name)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return {"id": subject.id, "name": subject.name, "document_count": 0}


@app.delete("/subjects/{subject_id}")
def delete_subject(subject_id: str, workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    subject = subject_for_workspace(subject_id, workspace, db)
    if subject.documents:
        raise HTTPException(status.HTTP_409_CONFLICT, "Move or delete the subject's documents before deleting the subject")
    db.delete(subject)
    db.commit()
    return {"deleted": subject_id}


def _require_owner(workspace: Workspace, user: User) -> None:
    if workspace.created_by != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the workspace owner can manage members")


def _audit(db: Session, workspace_id: str, user_id: str | None, action: str, target_type: str, target_id: str, metadata: Optional[dict] = None) -> None:
    db.add(AuditLog(workspace_id=workspace_id, user_id=user_id, action=action, target_type=target_type,
                    target_id=target_id, metadata_json=json.dumps(metadata or {}, ensure_ascii=False)))


@app.get("/audit")
def audit_logs(limit: int = Query(default=100, ge=1, le=500), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    rows = db.query(AuditLog).filter_by(workspace_id=workspace.id).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return {"events": [{"action": row.action, "target_type": row.target_type, "target_id": row.target_id,
                        "user_id": row.user_id, "metadata": json.loads(row.metadata_json) if row.metadata_json else {},
                        "created_at": row.created_at.isoformat()} for row in rows]}


@app.get("/admin/overview")
def admin_overview(user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    _require_owner(workspace, user)
    jobs = db.query(PipelineJob).filter_by(workspace_id=workspace.id).order_by(PipelineJob.created_at.desc()).limit(20).all()
    documents = db.query(DocumentRecord).filter_by(workspace_id=workspace.id).all()
    return {"workspace": {"id": workspace.id, "name": workspace.name},
            "members": len(workspace.members), "documents": len(documents),
            "document_status": {status: sum(1 for item in documents if item.status == status) for status in {item.status for item in documents}},
            "jobs": [{"id": job.id, "status": job.status, "error": job.error, "created_at": job.created_at.isoformat()} for job in jobs],
            "metrics": _metrics}


@app.get("/workspaces/{workspace_id}/members")
def list_workspace_members(workspace_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    workspace = workspace_for_user(workspace_id, user, db)
    return {"members": [{"id": member.id, "email": member.email, "display_name": member.display_name,
                         "role": "owner" if member.id == workspace.created_by else "member"}
                        for member in workspace.members]}


@app.get("/notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    rows = db.query(Notification).filter_by(user_id=user.id).order_by(Notification.created_at.desc()).limit(50).all()
    return {"notifications": [{"id": row.id, "kind": row.kind, "status": row.status,
                                "payload": json.loads(row.payload_json or "{}"),
                                "created_at": row.created_at.isoformat()} for row in rows]}


@app.post("/notifications/{notification_id}/respond")
def respond_notification(notification_id: str, decision: Dict[str, str],
                          user: User = Depends(current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    row = db.query(Notification).filter_by(id=notification_id, user_id=user.id).first()
    if row is None or row.kind != "workspace_invite" or row.status != "unread":
        raise HTTPException(404, "Notification not found or already handled")
    action = decision.get("action", "").lower()
    if action not in {"accept", "decline"}:
        raise HTTPException(400, "Action must be accept or decline")
    payload = json.loads(row.payload_json or "{}")
    workspace = db.query(Workspace).filter_by(id=payload.get("workspace_id")).first()
    inviter = db.query(User).filter_by(id=payload.get("inviter_id")).first()
    if workspace is None or inviter is None:
        raise HTTPException(404, "Workspace or inviter no longer exists")
    if action == "accept" and user not in workspace.members:
        workspace.members.append(user)
    row.status = "accepted" if action == "accept" else "declined"
    feedback = Notification(user_id=inviter.id, kind="workspace_invite_result", status="unread",
                            payload_json=json.dumps({"workspace_id": workspace.id, "workspace_name": workspace.name,
                                                     "user_id": user.id, "user_name": user.display_name,
                                                     "decision": action}))
    db.add(feedback)
    db.commit()
    return {"status": row.status, "workspace_id": workspace.id if action == "accept" else None}


@app.post("/workspaces/{workspace_id}/members")
def add_workspace_member(workspace_id: str, req: WorkspaceMemberRequest,
                         user: User = Depends(current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    workspace = workspace_for_user(workspace_id, user, db)
    _require_owner(workspace, user)
    member = db.query(User).filter(User.email == req.email.strip().casefold()).first()
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account exists for that email")
    if member in workspace.members:
        raise HTTPException(status.HTTP_409_CONFLICT, "That user is already a workspace member")
    existing = db.query(Notification).filter_by(user_id=member.id, kind="workspace_invite", status="unread").all()
    if any(json.loads(item.payload_json or "{}").get("workspace_id") == workspace.id for item in existing):
        raise HTTPException(status.HTTP_409_CONFLICT, "That user already has a pending invitation")
    db.add(Notification(user_id=member.id, kind="workspace_invite", status="unread",
                        payload_json=json.dumps({"workspace_id": workspace.id, "workspace_name": workspace.name,
                                                 "inviter_id": user.id, "inviter_name": user.display_name})))
    _audit(db, workspace.id, user.id, "workspace.invite_sent", "user", member.id, {"email": member.email})
    db.commit()
    return {"invited": True, "email": member.email}


@app.delete("/workspaces/{workspace_id}/members/{member_id}")
def remove_workspace_member(workspace_id: str, member_id: str,
                            user: User = Depends(current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    workspace = workspace_for_user(workspace_id, user, db)
    _require_owner(workspace, user)
    if member_id == workspace.created_by:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The workspace owner cannot be removed")
    member = next((item for item in workspace.members if item.id == member_id), None)
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace member not found")
    workspace.members.remove(member)
    _audit(db, workspace.id, user.id, "workspace.member_remove", "user", member.id)
    db.commit()
    return {"removed": member_id}


@app.post("/workspaces/{workspace_id}/leave")
def leave_workspace(workspace_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Dict[str, Any]:
    workspace = workspace_for_user(workspace_id, user, db)
    if user.id == workspace.created_by:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The workspace owner cannot leave. Transfer ownership or delete the workspace.")
    if user not in workspace.members:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "You are not a member of this workspace")
    workspace.members.remove(user)
    _audit(db, workspace.id, user.id, "workspace.leave", "user", user.id)
    db.commit()
    return {"left": workspace_id}


@app.get("/chat/sessions")
def list_chat_sessions(workspace: Workspace = Depends(current_workspace)) -> Dict[str, Any]:
    return {"sessions": [{"id": s.id, "title": s.title, "created_at": s.created_at.isoformat()}
                         for s in sorted(workspace.chat_sessions, key=lambda item: item.created_at, reverse=True)]}


@app.post("/chat/sessions")
def create_chat_session(workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    session = ChatSession(workspace_id=workspace.id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "title": session.title}


@app.get("/chat/sessions/{session_id}")
def get_chat_session(session_id: str, workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    session = db.query(ChatSession).filter_by(id=session_id, workspace_id=workspace.id).first()
    if session is None:
        raise HTTPException(404, "Chat session not found")
    return {"id": session.id, "title": session.title,
            "messages": [{"role": m.role, "content": m.content,
                          "metadata": json.loads(m.metadata_json) if m.metadata_json else None,
                          "created_at": m.created_at.isoformat()}
                         for m in session.messages]}


@app.patch("/chat/sessions/{session_id}")
def rename_chat_session(session_id: str, req: ChatRenameRequest,
                        workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    session = db.query(ChatSession).filter_by(id=session_id, workspace_id=workspace.id).first()
    if session is None:
        raise HTTPException(404, "Chat session not found")
    session.title = req.title.strip()
    db.commit()
    return {"id": session.id, "title": session.title}


@app.delete("/chat/sessions/{session_id}")
def delete_chat_session(session_id: str, workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    session = db.query(ChatSession).filter_by(id=session_id, workspace_id=workspace.id).first()
    if session is None:
        raise HTTPException(404, "Chat session not found")
    db.delete(session)
    db.commit()
    return {"deleted": session_id}


# The RAG pipeline loads a 2.2GB embedding model and opens Qdrant and Neo4j
# connections, so it is built once on demand and reused. Constructing it per
# request would make every question take tens of seconds.
_pipelines: dict[str, Any] = {}
_pipeline_errors: dict[str, str] = {}
_pipeline_loaded_at: dict[str, float] = {}


def _pipeline_scope(scope_id: str) -> tuple[str, str | None, dict[str, Path], str]:
    """Resolve a workspace or workspace::subject scope to isolated artifacts."""
    if "::" in scope_id:
        workspace_id, subject_id = scope_id.split("::", 1)
        paths = ensure_subject_paths(workspace_id, subject_id)
        collection = f"workspace_{workspace_id}_subject_{subject_id}"
        return workspace_id, subject_id, paths, collection
    paths = ensure_workspace_paths(scope_id)
    return scope_id, None, paths, f"workspace_{scope_id}"


def get_pipeline(scope_id: str):
    if scope_id not in _pipelines and scope_id not in _pipeline_errors:
        _, subject_id, paths, collection = _pipeline_scope(scope_id)
        required_artifacts = [
            paths["data"] / "normalized_concepts.json",
            paths["data"] / "relationships.json",
            paths["output"] / "preprocessed_chunks.json",
        ]
        missing_artifacts = [path.name for path in required_artifacts if not path.is_file()]
        if missing_artifacts:
            scope_label = "this subject" if subject_id else "this workspace"
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"The pipeline for {scope_label} is incomplete ({', '.join(missing_artifacts)} missing). "
                "Run the pipeline before asking a grounded question.",
            )
        try:
            from rag.pipeline import RAGPipeline
            from config import settings
            logging.info("Initialising RAG pipeline (first request warms the embedding model)…")
            previous_paths = (settings.output_dir, settings.data_dir, settings.qdrant_path,
                              settings.qdrant_collection_prefix)
            with SETTINGS_LOCK:
                try:
                    settings.output_dir = str(paths["output"])
                    settings.data_dir = str(paths["data"])
                    settings.qdrant_path = str(paths["vectors"])
                    settings.qdrant_collection_prefix = collection
                    _pipelines[scope_id] = RAGPipeline()
                    _pipeline_loaded_at[scope_id] = time.time()
                finally:
                    (settings.output_dir, settings.data_dir, settings.qdrant_path,
                     settings.qdrant_collection_prefix) = previous_paths
            logging.info("RAG pipeline ready")
        except Exception as e:
            _pipeline_errors[scope_id] = str(e)
            logging.error(f"Could not initialise RAG pipeline: {e}")
    if scope_id not in _pipelines:
        detail = _pipeline_errors.get(scope_id)
        raise HTTPException(503, "Grounded RAG is unavailable for the active workspace/subject. "
                            "Check the pipeline status and provider configuration." +
                            (f" Details: {detail[:180]}" if detail else ""))
    return _pipelines[scope_id]


def _load(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        raise HTTPException(
            404,
            f"{os.path.basename(path)} not found. Run the pipeline first "
            f"(run_ingestion → run_preprocessing → run_extraction → "
            f"run_normalization → run_relationships → run_build_graph).",
        )
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@app.get("/health")
def health() -> Dict[str, Any]:
    """Reports which artefacts exist, so the UI can explain what is missing."""
    files = {
        "concepts": os.path.join(settings.data_dir, "normalized_concepts.json"),
        "relationships": os.path.join(settings.data_dir, "relationships.json"),
        "graph": os.path.join(settings.data_dir, "graph_export.json"),
        "chunks": os.path.join(settings.output_dir, "preprocessed_chunks.json"),
    }
    database_ok = True
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception:
        database_ok = False
    qdrant_ok = True
    qdrant_mode = "not_checked"
    qdrant_error = None
    try:
        from retrieval.vector_store import VectorStore
        vector_store = VectorStore()
        vector_store.connect().get_collections()
        qdrant_mode = "local_fallback" if vector_store.is_local_fallback else ("remote" if vector_store.url else "embedded_local")
        vector_store.close()
    except Exception as exc:
        qdrant_ok = False
        qdrant_mode = "unavailable"
        qdrant_error = str(exc)[:200]
    return {
        "status": "ok" if database_ok and qdrant_ok else "degraded",
        "artifacts": {k: os.path.exists(v) for k, v in files.items()},
        "dependencies": {"database": database_ok, "storage": os.path.isdir(settings.data_dir),
                          "qdrant": qdrant_ok, "qdrant_mode": qdrant_mode,
                          "qdrant_error": qdrant_error},
        "pipeline_loaded": bool(_pipelines),
        "pipeline_error": next(iter(_pipeline_errors.values()), None),
    }


@app.get("/graph")
def graph(document: str | None = Query(default=None), relation_type: str | None = Query(default=None),
          min_confidence: float = Query(default=0.0, ge=0.0, le=1.0), connected_only: bool = False,
          source: str | None = Query(default=None), x_subject_id: str | None = Header(default=None), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    if x_subject_id:
        subject_for_workspace(x_subject_id, workspace, db)
    try:
        data = _learning_graph(workspace, x_subject_id, db)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            return {"nodes": [], "edges": []}
        raise
    if x_subject_id:
        subject_files = {item.filename for item in db.query(DocumentRecord).filter_by(workspace_id=workspace.id, subject_id=x_subject_id).all()}
        data["nodes"] = [node for node in data.get("nodes", []) if subject_files.intersection(node.get("filenames", []))]
        node_ids = {node.get("concept_id") for node in data["nodes"]}
        data["edges"] = [edge for edge in data.get("edges", []) if edge.get("source_concept_id") in node_ids and edge.get("target_concept_id") in node_ids]
    edges = data.get("edges", [])
    if relation_type:
        edges = [e for e in edges if e.get("type") == relation_type]
    if min_confidence:
        edges = [e for e in edges if float(e.get("mean_confidence", 0.0)) >= min_confidence]
    if document:
        needle = document.casefold()
        edges = [e for e in edges if any(needle in str(name).casefold() for name in e.get("evidence_filenames", []))]
    if source:
        needle = source.casefold()
        edges = [e for e in edges if any(needle in str(name).casefold() for name in e.get("evidence_filenames", []))]
    node_ids = {e.get("source_concept_id") for e in edges} | {e.get("target_concept_id") for e in edges}
    nodes = [n for n in data.get("nodes", []) if n.get("concept_id") in node_ids] if connected_only else data.get("nodes", [])
    if document:
        needle = document.casefold()
        nodes = [n for n in nodes if any(needle in str(name).casefold() for name in n.get("filenames", [])) or n.get("concept_id") in node_ids]
    return {"nodes": nodes, "edges": edges}


@app.get("/workspace/stats")
def workspace_stats(x_subject_id: str | None = Header(default=None),
                    workspace: Workspace = Depends(current_workspace),
                    db: Session = Depends(get_db)) -> Dict[str, int]:
    """Return live artifact counts for the current workspace or subject.

    These values are read from the persisted document records and graph/chunk
    artifacts; no demo or simulation totals are used by the upload UI.
    """
    if x_subject_id:
        # A browser tab can retain a subject id while the user signs into a
        # different account. The workspace header is already authenticated,
        # so do not turn that stale subject into a 404 for the stats poll.
        subject = db.query(Subject).filter_by(id=x_subject_id, workspace_id=workspace.id).first()
        if subject is not None:
            paths = ensure_subject_paths(workspace.id, x_subject_id)
            _materialize_subject_artifacts(workspace, x_subject_id, db)
            document_query = db.query(DocumentRecord).filter_by(
                workspace_id=workspace.id, subject_id=x_subject_id
            )
        else:
            x_subject_id = None
            paths = ensure_workspace_paths(workspace.id)
            document_query = db.query(DocumentRecord).filter_by(workspace_id=workspace.id)
    else:
        paths = ensure_workspace_paths(workspace.id)
        document_query = db.query(DocumentRecord).filter_by(workspace_id=workspace.id)

    chunks = 0
    chunk_file = paths["output"] / "preprocessed_chunks.json"
    if chunk_file.is_file():
        try:
            payload = _load(str(chunk_file))
            if isinstance(payload, list):
                chunks = len(payload)
            elif isinstance(payload, dict) and isinstance(payload.get("chunks"), list):
                chunks = len(payload["chunks"])
        except (OSError, ValueError, TypeError):
            logging.warning("Could not read chunk artifact for workspace stats", exc_info=True)

    try:
        graph_data = _learning_graph(workspace, x_subject_id, db)
    except HTTPException as exc:
        # A new account/workspace may not have run the pipeline yet. Stats are
        # still valid in that state: documents/chunks can be counted while the
        # graph counters remain zero instead of turning the polling endpoint
        # into a misleading 404.
        if exc.status_code != status.HTTP_404_NOT_FOUND:
            raise
        graph_data = {"nodes": [], "edges": []}
    return {
        "documents": document_query.count(),
        "chunks": chunks,
        "concepts": len(graph_data.get("nodes", [])),
        "edges": len(graph_data.get("edges", [])),
    }


def _materialize_subject_artifacts(workspace: Workspace, subject_id: str, db: Session) -> None:
    """Create an isolated subject view from already processed workspace artifacts.

    This is an offline migration for documents processed before subject-scoped
    pipeline folders existed. It only filters existing provenance by the
    document-to-subject mapping; it never calls an LLM or invents concepts.
    New documents still require the normal subject pipeline run.
    """
    subject_paths = ensure_subject_paths(workspace.id, subject_id)
    graph_path = subject_paths["data"] / "graph_export.json"
    if graph_path.is_file():
        return
    subject_files = {
        item.filename for item in db.query(DocumentRecord)
        .filter_by(workspace_id=workspace.id, subject_id=subject_id).all()
    }
    if not subject_files:
        return
    source_paths = ensure_workspace_paths(workspace.id)
    source_concepts_path = source_paths["data"] / "normalized_concepts.json"
    source_relationships_path = source_paths["data"] / "relationships.json"
    source_chunks_path = source_paths["output"] / "preprocessed_chunks.json"
    source_graph_path = source_paths["data"] / "graph_export.json"
    if not all(path.is_file() for path in (source_concepts_path, source_relationships_path, source_chunks_path, source_graph_path)):
        return

    with source_concepts_path.open(encoding="utf-8") as handle:
        concepts_payload = json.load(handle)
    concepts = [item for item in concepts_payload.get("concepts", [])
                if subject_files.intersection(item.get("filenames", []))]
    concept_ids = {item.get("concept_id") for item in concepts}

    with source_relationships_path.open(encoding="utf-8") as handle:
        relationships_payload = json.load(handle)
    relationships = [item for item in relationships_payload.get("relationships", [])
                     if item.get("source_concept_id") in concept_ids
                     and item.get("target_concept_id") in concept_ids]

    with source_chunks_path.open(encoding="utf-8") as handle:
        chunks_payload = json.load(handle)
    chunks = [item for item in chunks_payload.get("chunks", [])
              if item.get("filename") in subject_files]

    with source_graph_path.open(encoding="utf-8") as handle:
        graph_payload = json.load(handle)
    nodes = [item for item in graph_payload.get("nodes", []) if item.get("concept_id") in concept_ids]
    edges = [item for item in graph_payload.get("edges", [])
             if item.get("source_concept_id") in concept_ids
             and item.get("target_concept_id") in concept_ids]

    subject_paths["data"].mkdir(parents=True, exist_ok=True)
    subject_paths["output"].mkdir(parents=True, exist_ok=True)
    (subject_paths["data"] / "normalized_concepts.json").write_text(
        json.dumps({**concepts_payload, "subject_id": subject_id, "concepts": concepts}, ensure_ascii=False),
        encoding="utf-8",
    )
    (subject_paths["data"] / "relationships.json").write_text(
        json.dumps({**relationships_payload, "subject_id": subject_id, "relationships": relationships}, ensure_ascii=False),
        encoding="utf-8",
    )
    (subject_paths["output"] / "preprocessed_chunks.json").write_text(
        json.dumps({**chunks_payload, "subject_id": subject_id, "chunks": chunks}, ensure_ascii=False),
        encoding="utf-8",
    )
    graph_path.write_text(json.dumps({"nodes": nodes, "edges": edges}, ensure_ascii=False), encoding="utf-8")
    logging.info("Materialized %s subject artifacts for %d mapped documents", subject_id, len(subject_files))


def _graph_data(workspace: Workspace, subject_id: str | None = None) -> Dict[str, Any]:
    if subject_id:
        subject_graph = ensure_subject_paths(workspace.id, subject_id)["data"] / "graph_export.json"
        return _load(str(subject_graph))
    return _load(str(ensure_workspace_paths(workspace.id)["data"] / "graph_export.json"))


@app.get("/graph/neighbors/{concept_id}")
def graph_neighbors(concept_id: str, hops: int = Query(default=1, ge=1, le=5),
                    x_subject_id: str | None = Header(default=None), workspace: Workspace = Depends(current_workspace),
                    db: Session = Depends(get_db)) -> Dict[str, Any]:
    if x_subject_id:
        subject_for_workspace(x_subject_id, workspace, db)
    try:
        data = _learning_graph(workspace, x_subject_id, db)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            return {"nodes": [], "edges": []}
        raise
    keep = {concept_id}
    for _ in range(hops):
        keep |= {e["target_concept_id"] for e in data.get("edges", []) if e.get("source_concept_id") in keep}
        keep |= {e["source_concept_id"] for e in data.get("edges", []) if e.get("target_concept_id") in keep}
    return {"nodes": [n for n in data.get("nodes", []) if n.get("concept_id") in keep],
            "edges": [e for e in data.get("edges", []) if e.get("source_concept_id") in keep and e.get("target_concept_id") in keep]}


@app.get("/graph/paths")
def graph_paths(source_id: str, target_id: str, max_hops: int = Query(default=4, ge=1, le=8),
                x_subject_id: str | None = Header(default=None), workspace: Workspace = Depends(current_workspace),
                db: Session = Depends(get_db)) -> Dict[str, Any]:
    if x_subject_id:
        subject_for_workspace(x_subject_id, workspace, db)
    try:
        data = _learning_graph(workspace, x_subject_id, db)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            return {"paths": []}
        raise
    adjacency: dict[str, list[tuple[str, dict]]] = {}
    for edge in data.get("edges", []):
        adjacency.setdefault(edge["source_concept_id"], []).append((edge["target_concept_id"], edge))
        adjacency.setdefault(edge["target_concept_id"], []).append((edge["source_concept_id"], edge))
    queue = [(source_id, [source_id], [])]
    paths = []
    while queue:
        current, nodes, edges = queue.pop(0)
        if current == target_id:
            paths.append({"concept_ids": nodes, "edges": edges})
            continue
        if len(edges) >= max_hops:
            continue
        for nxt, edge in adjacency.get(current, []):
            if nxt not in nodes:
                queue.append((nxt, nodes + [nxt], edges + [edge]))
    return {"paths": paths[:20]}


@app.get("/graph/prerequisites/{concept_id}")
def graph_prerequisites(concept_id: str, x_subject_id: str | None = Header(default=None),
                        workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    if x_subject_id:
        subject_for_workspace(x_subject_id, workspace, db)
    try:
        data = _learning_graph(workspace, x_subject_id, db)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_404_NOT_FOUND:
            return {"nodes": [], "edges": []}
        raise
    keep = {concept_id}
    changed = True
    while changed:
        changed = False
        for edge in data.get("edges", []):
            if edge.get("target_concept_id") in keep and edge.get("type") in {"requires", "depends_on", "prerequisite_of"}:
                if edge.get("source_concept_id") not in keep:
                    keep.add(edge["source_concept_id"]); changed = True
    return {"nodes": [n for n in data.get("nodes", []) if n.get("concept_id") in keep],
            "edges": [e for e in data.get("edges", []) if e.get("source_concept_id") in keep and e.get("target_concept_id") in keep]}


def _learning_graph(workspace: Workspace, subject_id: str | None = None, db: Session | None = None) -> Dict[str, Any]:
    if subject_id and db is not None:
        subject_for_workspace(subject_id, workspace, db)
        _materialize_subject_artifacts(workspace, subject_id, db)
    data = _graph_data(workspace, subject_id)
    if subject_id and db is not None:
        subject_files = {item.filename for item in db.query(DocumentRecord).filter_by(workspace_id=workspace.id, subject_id=subject_id).all()}
        data["nodes"] = [node for node in data.get("nodes", []) if subject_files.intersection(node.get("filenames", []))]
        node_ids = {node.get("concept_id") for node in data["nodes"]}
        data["edges"] = [edge for edge in data.get("edges", []) if edge.get("source_concept_id") in node_ids and edge.get("target_concept_id") in node_ids]
    return data


@app.get("/learning-paths/{concept_id}")
def learning_path(concept_id: str, x_subject_id: str | None = Header(default=None), user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    data = _learning_graph(workspace, x_subject_id, db)
    nodes = {n["concept_id"]: n for n in data.get("nodes", [])}
    if concept_id not in nodes:
        raise HTTPException(404, "Concept not found")
    prerequisite_types = {"requires", "depends_on", "prerequisite_of"}
    before: list[dict] = []
    after: list[dict] = []
    seen_before: set[str] = set()
    seen_after: set[str] = set()
    frontier = [concept_id]
    while frontier:
        current = frontier.pop(0)
        for edge in data.get("edges", []):
            if edge.get("type") not in prerequisite_types:
                continue
            if edge.get("target_concept_id") == current and edge.get("source_concept_id") not in seen_before and edge.get("source_concept_id") != concept_id:
                source = edge["source_concept_id"]; seen_before.add(source); frontier.append(source)
                before.append({"concept": nodes.get(source), "edge": edge})
            if edge.get("source_concept_id") == current and edge.get("target_concept_id") not in seen_after and edge.get("target_concept_id") != concept_id:
                target = edge["target_concept_id"]; seen_after.add(target)
                after.append({"concept": nodes.get(target), "edge": edge})
    progress = {item.concept_id: item.status for item in db.query(LearningPathProgress).filter_by(workspace_id=workspace.id, user_id=user.id).all()}
    for item in before + after:
        item["status"] = progress.get(item["concept"]["concept_id"], "not_started")
    return {"concept": nodes[concept_id], "learn_before": before, "learn_next": after,
            "cycle_safe": True, "note": "Only evidence-backed prerequisite edges are included; repeated nodes are suppressed."}


@app.post("/explain")
def explain(req: ExplainRequest, x_subject_id: str | None = Header(default=None), user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    data = _learning_graph(workspace, x_subject_id, db)
    concept = next((n for n in data.get("nodes", []) if n.get("concept_id") == req.concept_id), None)
    if concept is None or not concept.get("evidence"):
        raise HTTPException(422, "This concept has no verified evidence for a grounded explanation")
    prompt = (
        "Explain this concept clearly and in depth for a learner. Start with a plain-language definition, "
        "then explain how it works, why it matters, and include a concrete example only when the retrieved "
        "source evidence supports one. Use several well-structured paragraphs and only the retrieved evidence; "
        "do not invent facts. Concept: " + concept["canonical_name"]
    )
    scope_id = f"{workspace.id}::{x_subject_id}" if x_subject_id else workspace.id
    answer = get_pipeline(scope_id).ask(prompt).to_dict()
    session = db.query(ChatSession).filter_by(id=req.session_id, workspace_id=workspace.id).first() if req.session_id else None
    if session is None:
        session = ChatSession(workspace_id=workspace.id, title=f"Explain: {concept['canonical_name']}")
        db.add(session); db.flush()
    db.add(ChatMessage(session_id=session.id, role="user", content=prompt))
    db.add(ChatMessage(session_id=session.id, role="assistant", content=answer.get("answer", ""), metadata_json=json.dumps(answer, ensure_ascii=False)))
    db.commit()
    return {"mode": req.mode, "concept_id": req.concept_id, "session_id": session.id, **answer}


@app.get("/metrics")
def metrics() -> Response:
    payload = "\n".join(f"conceptscape_{key} {value}" for key, value in _metrics.items()) + "\n"
    return Response(payload, media_type="text/plain; version=0.0.4")


@app.get("/quiz/{concept_id}")
def generate_quiz(concept_id: str, question_type: str = "multiple_choice", x_subject_id: str | None = Header(default=None), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    if question_type not in {"multiple_choice", "short_answer", "relationship"}:
        raise HTTPException(400, "Unsupported question type")
    data = _learning_graph(workspace, x_subject_id, db)
    concept = next((node for node in data.get("nodes", []) if node.get("concept_id") == concept_id), None)
    if concept is None:
        raise HTTPException(404, "Concept not found in the active workspace graph")
    related_ids = {
        edge.get("target_concept_id") if edge.get("source_concept_id") == concept_id else edge.get("source_concept_id")
        for edge in data.get("edges", [])
        if concept_id in {edge.get("source_concept_id"), edge.get("target_concept_id")}
    }
    related = [node for node in data.get("nodes", []) if node.get("concept_id") in related_ids]
    try:
        generated = generate_ai_quiz(concept, related, question_type)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    citations = [{"text": text, "filename": (concept.get("filenames") or [""])[0],
                  "location": (concept.get("locations") or [{}])[0]} for text in (concept.get("evidence") or [])[:3]]
    return {"concept_id": concept_id, "concept_name": concept.get("canonical_name"),
            "question_type": question_type, "questions": generated["questions"],
            "citations": citations, "model_used": generated["model_used"]}


@app.post("/quiz/attempts")
def submit_quiz_attempt(req: QuizAttemptRequest, x_subject_id: str | None = Header(default=None), user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    data = _learning_graph(workspace, x_subject_id, db)
    concept = next((node for node in data.get("nodes", []) if node.get("concept_id") == req.concept_id), None)
    if concept is None:
        raise HTTPException(404, "Concept not found in the active workspace graph")
    question = {"id": req.question_id, "question": req.question, "expected_answer": req.expected_answer,
                "correct_option_id": req.correct_option_id, "options": req.options}
    evidence = "\n".join(concept.get("evidence") or [])
    try:
        evaluation = evaluate_answer(question, req.answer, evidence)
    except Exception as exc:
        raise HTTPException(503, f"Answer evaluation failed: {exc}") from exc
    correct = bool(evaluation.get("correct"))
    score = 1.0 if correct else 0.0
    citations = [{"text": text, "filename": (concept.get("filenames") or [""])[0],
                  "location": (concept.get("locations") or [{}])[0]} for text in (concept.get("evidence") or [])[:3]]
    attempt = QuizAttempt(workspace_id=workspace.id, user_id=user.id, concept_id=req.concept_id,
                          question_id=req.question_id, question_type=req.question_type,
                          answer=req.answer, correct=correct, score=score,
                          explanation=evaluation.get("explanation", "Review the cited evidence."),
                          citations_json=json.dumps(citations, ensure_ascii=False))
    db.add(attempt)
    progress = db.query(ConceptProgress).filter_by(workspace_id=workspace.id, user_id=user.id, concept_id=req.concept_id).first()
    if progress is None:
        progress = ConceptProgress(workspace_id=workspace.id, user_id=user.id, concept_id=req.concept_id)
        db.add(progress)
    previous_views = progress.view_count or 0
    previous_confidence = progress.confidence or 0.0
    progress.confidence = (previous_confidence + score) / 2 if previous_views else score
    progress.view_count = previous_views + 1
    progress.needs_review = not correct
    progress.status = "learned" if correct else "revisit"
    db.commit()
    return {"correct": correct, "score": score, "explanation": attempt.explanation,
            "correct_answer": evaluation.get("correct_answer", req.expected_answer),
            "key_takeaway": evaluation.get("key_takeaway", ""), "citations": citations}


@app.post("/progress/concepts/{concept_id}")
def update_concept_progress(concept_id: str, req: ProgressRequest, user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    # The Learn page can still be displaying a concept from a freshly rebuilt
    # graph while the in-memory pipeline/artifact cache is being refreshed.
    # Progress is scoped to the authenticated workspace, so do not reject a
    # valid client concept id merely because that cache is momentarily stale.
    progress = db.query(ConceptProgress).filter_by(workspace_id=workspace.id, user_id=user.id, concept_id=concept_id).first()
    if progress is None:
        progress = ConceptProgress(workspace_id=workspace.id, user_id=user.id, concept_id=concept_id)
        db.add(progress)
    progress.status = req.status
    progress.confidence = req.confidence
    progress.view_count = (progress.view_count or 0) + 1
    progress.needs_review = req.status == "revisit"
    progress.last_viewed_at = datetime.now(timezone.utc)
    db.commit()
    return {"concept_id": concept_id, "status": progress.status, "confidence": progress.confidence}


@app.post("/progress/paths/{concept_id}")
def update_path_progress(concept_id: str, req: PathProgressRequest, user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    progress = db.query(LearningPathProgress).filter_by(workspace_id=workspace.id, user_id=user.id, concept_id=concept_id).first()
    if progress is None:
        progress = LearningPathProgress(workspace_id=workspace.id, user_id=user.id, concept_id=concept_id)
        db.add(progress)
    progress.status = req.status
    db.commit()
    return {"concept_id": concept_id, "status": progress.status}


@app.get("/progress")
def progress_dashboard(x_subject_id: str | None = Header(default=None), user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    items = db.query(ConceptProgress).filter_by(workspace_id=workspace.id, user_id=user.id).all()
    paths = db.query(LearningPathProgress).filter_by(workspace_id=workspace.id, user_id=user.id).all()
    attempts = db.query(QuizAttempt).filter_by(workspace_id=workspace.id, user_id=user.id).all()
    try:
        graph_payload = _learning_graph(workspace, x_subject_id, db)
    except HTTPException as exc:
        if exc.status_code != status.HTTP_404_NOT_FOUND:
            raise
        graph_payload = {"nodes": [], "edges": []}
    graph_nodes = {node["concept_id"]: node for node in graph_payload.get("nodes", [])}
    # A subject scope must apply to learning state as well as graph data.
    # Otherwise progress rows from another subject leak into the selected view.
    items = [item for item in items if item.concept_id in graph_nodes]
    paths = [item for item in paths if item.concept_id in graph_nodes]
    attempts = [item for item in attempts if item.concept_id in graph_nodes]
    progress_by_concept = {item.concept_id: item for item in items}
    concept_rows = [{
        "concept_id": concept_id,
        "concept_name": node.get("canonical_name") or node.get("label") or concept_id,
        "status": progress_by_concept[concept_id].status if concept_id in progress_by_concept else "not_started",
        "confidence": float(progress_by_concept[concept_id].confidence or 0.0) if concept_id in progress_by_concept else 0.0,
        "view_count": int(progress_by_concept[concept_id].view_count or 0) if concept_id in progress_by_concept else 0,
        "needs_review": bool(progress_by_concept[concept_id].needs_review) if concept_id in progress_by_concept else False,
    } for concept_id, node in graph_nodes.items()]
    by_document: dict[str, list[float]] = {}
    by_topic: dict[str, list[float]] = {}
    by_subject: dict[str, list[float]] = {}
    subject_names = {
        item.filename: (item.subject.name if item.subject is not None else "Unassigned")
        for item in db.query(DocumentRecord).filter_by(workspace_id=workspace.id).all()
    }
    for concept_id, concept in graph_nodes.items():
        progress = progress_by_concept.get(concept_id)
        confidence = float(progress.confidence or 0.0) if progress is not None else 0.0
        for filename in concept.get("filenames", []) or ["Unknown source"]:
            by_document.setdefault(filename, []).append(confidence)
            by_subject.setdefault(subject_names.get(filename, "Unassigned"), []).append(confidence)
        topics = [str(topic).strip() for topic in (concept.get("keywords") or []) if str(topic).strip()]
        if not topics:
            topics = [concept.get("canonical_name") or "Other"]
        for topic in topics[:5]:
            by_topic.setdefault(topic, []).append(confidence)
    summarize = lambda values: round(sum(values) / len(values), 3) if values else 0.0
    correct = sum(1 for item in attempts if item.correct)
    return {"total_concepts": len(graph_nodes), "tracked_concepts": len(items),
            "learned_concepts": sum(1 for item in items if item.status == "learned"),
            "overall_mastery": summarize([float(item.confidence or 0.0) for item in items]),
            "concepts": concept_rows,
            "quiz": {"attempts": len(attempts), "correct": sum(1 for item in attempts if item.correct),
                     "accuracy": (correct / len(attempts)) if attempts else 0.0},
            "paths": [{"concept_id": item.concept_id,
                       "concept_name": graph_nodes.get(item.concept_id, {}).get("canonical_name") or graph_nodes.get(item.concept_id, {}).get("label") or item.concept_id,
                       "status": item.status} for item in paths],
            "needs_review": [item.concept_id for item in items if item.needs_review],
            "by_document": [{"name": name, "mastery": summarize(values), "concepts": len(values)} for name, values in sorted(by_document.items())],
            "by_subject": [{"name": name, "mastery": summarize(values), "concepts": len(values)} for name, values in sorted(by_subject.items())],
            "by_topic": [{"name": name, "mastery": summarize(values), "concepts": len(values)} for name, values in sorted(by_topic.items())]}


@app.get("/concepts")
def concepts(q: str = "", limit: int = 200, workspace: Workspace = Depends(current_workspace)) -> Dict[str, Any]:
    paths = ensure_workspace_paths(workspace.id)
    data = _load(str(paths["data"] / "normalized_concepts.json"))
    items: List[dict] = data.get("concepts", [])
    if q:
        needle = q.casefold()
        items = [
            c for c in items
            if needle in c.get("canonical_name", "").casefold()
            or any(needle in a.casefold() for a in c.get("aliases", []))
            or any(needle in k.casefold() for k in c.get("keywords", []))
        ]
    return {"total": len(items), "concepts": items[:limit]}


@app.get("/concepts/{concept_id}")
def concept_detail(concept_id: str, workspace: Workspace = Depends(current_workspace)) -> Dict[str, Any]:
    paths = ensure_workspace_paths(workspace.id)
    data = _load(str(paths["data"] / "normalized_concepts.json"))
    concept = next((c for c in data.get("concepts", []) if c["concept_id"] == concept_id), None)
    if concept is None:
        raise HTTPException(404, f"No concept with id {concept_id}")

    rels = _load(str(paths["data"] / "relationships.json")).get("relationships", [])
    related = [
        r for r in rels
        if r["source_concept_id"] == concept_id or r["target_concept_id"] == concept_id
    ]
    return {"concept": concept, "relationships": related}


# ── documents & pipeline ─────────────────────────────────────────────────

ALLOWED_SUFFIXES = {
    ".pdf", ".pptx", ".ppt", ".png", ".jpg", ".jpeg", ".webp", ".yt", ".youtube"
}


def _safe_name(filename: str) -> str:
    """
    Reduce an uploaded filename to a bare, safe basename.

    An upload endpoint that trusts the client's filename is a directory
    traversal waiting to happen — "../../etc/passwd" must not escape the
    documents folder.
    """
    name = os.path.basename(filename or "").strip().replace("\x00", "")
    name = name.lstrip(".")  # no hidden files, no "..".
    if not name:
        raise HTTPException(400, "Invalid filename")
    if Path(name).suffix.lower() not in ALLOWED_SUFFIXES:
        raise HTTPException(
            400,
            f"Unsupported file type '{Path(name).suffix}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_SUFFIXES))}",
        )
    return name


def _content_type_error(name: str, content: bytes) -> Optional[str]:
    suffix = Path(name).suffix.lower()
    valid = suffix in {".yt", ".youtube"} and extract_video_id(content.decode("utf-8", errors="ignore").strip())
    valid = valid or (suffix == ".pdf" and content.startswith(b"%PDF"))
    valid = valid or (suffix == ".png" and content.startswith(b"\x89PNG\r\n\x1a\n"))
    valid = valid or (suffix in {".jpg", ".jpeg"} and content.startswith(b"\xff\xd8\xff"))
    valid = valid or (suffix == ".webp" and content[:4] == b"RIFF" and content[8:12] == b"WEBP")
    if suffix == ".ppt" and content.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        valid = True
    if suffix == ".pptx" and content.startswith(b"PK"):
        try:
            valid = zipfile.is_zipfile(io.BytesIO(content)) and "[Content_Types].xml" in zipfile.ZipFile(io.BytesIO(content)).namelist()
        except Exception:
            valid = False
    return None if valid else "File content does not match its extension or is not a supported document"


def _malware_error(content: bytes) -> Optional[str]:
    if not settings.clamav_host:
        return None
    try:
        import clamd
        scanner = clamd.ClamdNetworkSocket(host=settings.clamav_host, port=settings.clamav_port)
        result = scanner.instream(io.BytesIO(content))
        status, signature = result.get("stream", ("OK", ""))
        return f"Malware detected: {signature}" if status == "FOUND" else None
    except Exception as exc:
        logging.exception("ClamAV scan failed")
        return f"Malware scanner unavailable: {exc}"


def _invalidate_pipeline(workspace_id: str) -> None:
    """Drop the cached RAG pipeline so the next question sees the new corpus."""
    _pipelines.pop(workspace_id, None)
    _pipeline_errors.pop(workspace_id, None)
    _pipeline_loaded_at.pop(workspace_id, None)
    logging.info("Pipeline cache invalidated — next question reloads the corpus")


_runners: dict[str, PipelineRunner] = {}


def _finish_latest_job(scope_id: str) -> None:
    workspace_id, subject_id, _, _ = _pipeline_scope(scope_id)
    runner = _runners.get(scope_id)
    state = runner.state if runner else {}
    db = SessionLocal()
    try:
        query = (db.query(PipelineJob)
               .filter(PipelineJob.workspace_id == workspace_id,
                       PipelineJob.subject_id == subject_id,
                       PipelineJob.status.in_(["queued", "running"]))
               .order_by(PipelineJob.created_at.desc()).first())
        job = query
        if job:
            job.status = "failed" if state.get("error") else "completed"
            job.current = state.get("current")
            job.error = state.get("error")
            job.finished_at = datetime.now(timezone.utc)
            if job.status == "completed":
                document_query = db.query(DocumentRecord).filter_by(workspace_id=workspace_id, subject_id=subject_id)
                if subject_id is None:
                    document_query = db.query(DocumentRecord).filter_by(workspace_id=workspace_id)
                document_query.update(
                    {DocumentRecord.status: "processed", DocumentRecord.error: None,
                     DocumentRecord.processed_at: datetime.now(timezone.utc)},
                    synchronize_session=False,
                )
            else:
                document_query = db.query(DocumentRecord).filter_by(workspace_id=workspace_id, status="queued", subject_id=subject_id)
                if subject_id is None:
                    document_query = db.query(DocumentRecord).filter_by(workspace_id=workspace_id, status="queued")
                document_query.update(
                    {DocumentRecord.status: "error", DocumentRecord.error: job.error},
                    synchronize_session=False,
                )
            db.commit()
    finally:
        db.close()


def get_runner(workspace_id: str) -> PipelineRunner:
    runner = _runners.get(workspace_id)
    if runner is None:
        runner = PipelineRunner(on_complete=lambda wid: (_invalidate_pipeline(wid), _finish_latest_job(wid)))
        _runners[workspace_id] = runner
    return runner


@app.get("/documents")
def documents(q: str = "", status_filter: str | None = None, x_subject_id: str | None = Header(default=None), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    d = ensure_workspace_paths(workspace.id)["documents"]
    if not d.is_dir():
        return {"documents": []}
    if x_subject_id:
        if db.query(Subject).filter_by(id=x_subject_id, workspace_id=workspace.id).first() is None:
            return {"documents": [], "total": 0}
    records = {record.filename: record for record in db.query(DocumentRecord).filter_by(workspace_id=workspace.id).all()
               if not x_subject_id or record.subject_id == x_subject_id}
    items = []
    for f in sorted(d.iterdir()):
        if not f.is_file() or f.suffix.lower() not in ALLOWED_SUFFIXES:
            continue
        record = records.get(f.name)
        if x_subject_id and record is None:
            continue
        item = {"filename": f.name, "size_bytes": f.stat().st_size, "suffix": f.suffix.lower(),
                "status": record.status if record else "uploaded", "error": record.error if record else None,
                "version": record.version if record else 1,
                "uploaded_at": record.created_at.isoformat() if record else None,
                "processed_at": record.processed_at.isoformat() if record and record.processed_at else None}
        if q and q.casefold() not in f.name.casefold():
            continue
        if status_filter and item["status"] != status_filter:
            continue
        items.append(item)
    # Keep newly uploaded/unprocessed documents visible at the top. Once the
    # pipeline marks them processed they naturally move below the pending
    # queue, with the newest processed document first within its group.
    items.sort(
        key=lambda item: (
            0 if item["status"] not in {"processed", "error"} else 1,
            -(datetime.fromisoformat(item["uploaded_at"]).timestamp()
              if item.get("uploaded_at") else 0),
        )
    )
    return {"documents": items, "total": len(items)}


@app.post("/documents")
async def upload(files: List[UploadFile] = File(...), x_subject_id: str | None = Header(default=None), user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    d = ensure_workspace_paths(workspace.id)["documents"]
    d.mkdir(parents=True, exist_ok=True)
    subject = subject_for_workspace(x_subject_id, workspace, db) if x_subject_id else None

    saved, rejected = [], []
    for f in files:
        try:
            name = _safe_name(f.filename)
        except HTTPException as e:
            rejected.append({"filename": f.filename, "reason": e.detail})
            continue

        content = await f.read()
        if len(content) > settings.upload_max_bytes:
            rejected.append({
                "filename": name,
                "reason": f"Too large ({len(content) // 1_000_000}MB); "
                          f"limit is {settings.upload_max_bytes // 1_000_000}MB",
            })
            continue
        mismatch = _content_type_error(name, content)
        if mismatch:
            rejected.append({"filename": name, "reason": mismatch})
            continue
        malware = _malware_error(content)
        if malware:
            rejected.append({"filename": name, "reason": malware})
            continue

        destination = d / name
        if destination.exists():
            rejected.append({
                "filename": name,
                "reason": "A document with this filename already exists. Rename it before uploading.",
            })
            continue

        destination.write_bytes(content)
        db.add(DocumentRecord(
            workspace_id=workspace.id,
            subject_id=subject.id if subject else None,
            filename=name,
            source_type=Path(name).suffix.lower().lstrip("."),
            content_hash=hashlib.sha256(content).hexdigest(),
        ))
        # The document row is flushed below; the audit records the requested file action.
        saved.append({"filename": name, "size_bytes": len(content)})
        logging.info(f"Uploaded {name} ({len(content)} bytes)")

    for item in saved:
        _audit(db, workspace.id, user.id, "document.upload", "document", item["filename"], {"size_bytes": item["size_bytes"]})
    db.commit()
    return {"saved": saved, "rejected": rejected}


@app.put("/documents/{filename}")
async def replace_document(filename: str, file: UploadFile = File(...), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    name = _safe_name(filename)
    replacement_name = _safe_name(file.filename or name)
    if replacement_name != name:
        raise HTTPException(400, "Replacement filename must match the existing document")
    paths = ensure_workspace_paths(workspace.id)
    path = paths["documents"] / name
    record = db.query(DocumentRecord).filter_by(workspace_id=workspace.id, filename=name).first()
    if not path.is_file() or record is None:
        raise HTTPException(404, f"No document named {name}")
    content = await file.read()
    if len(content) > settings.upload_max_bytes:
        raise HTTPException(413, "Replacement document exceeds the upload limit")
    mismatch = _content_type_error(name, content)
    if mismatch:
        raise HTTPException(400, mismatch)
    malware = _malware_error(content)
    if malware:
        raise HTTPException(400, malware)
    archive_dir = paths["documents"] / ".versions" / name
    archive_dir.mkdir(parents=True, exist_ok=True)
    old_version = record.version
    old_archive = archive_dir / f"v{old_version}{path.suffix.lower()}"
    if not old_archive.exists():
        old_archive.write_bytes(path.read_bytes())
    path.write_bytes(content)
    next_version = old_version + 1
    db.add(DocumentVersion(document_id=record.id, version=old_version, filename=name,
                           content_hash=record.content_hash, stored_path=str(old_archive)))
    record.version = next_version
    record.content_hash = hashlib.sha256(content).hexdigest()
    record.status = "uploaded"
    record.error = None
    record.processed_at = None
    db.commit()
    return {"filename": name, "version": next_version, "status": record.status}


@app.post("/documents/{filename}/reprocess")
def reprocess_document(filename: str, workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    name = _safe_name(filename)
    record = db.query(DocumentRecord).filter_by(workspace_id=workspace.id, filename=name).first()
    if record is None:
        raise HTTPException(404, f"No document named {name}")
    record.status = "queued"
    record.error = None
    record.processed_at = None
    db.commit()
    return {"filename": name, "status": record.status, "message": "Document queued for the next pipeline run"}


@app.get("/documents/{filename}/versions")
def document_versions(filename: str, workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    name = _safe_name(filename)
    record = db.query(DocumentRecord).filter_by(workspace_id=workspace.id, filename=name).first()
    if record is None:
        raise HTTPException(404, f"No document named {name}")
    versions = (db.query(DocumentVersion).filter_by(document_id=record.id)
                .order_by(DocumentVersion.version.desc()).all())
    return {"filename": name, "current_version": record.version,
            "versions": [{"version": item.version, "content_hash": item.content_hash,
                           "created_at": item.created_at.isoformat()} for item in versions]}


@app.post("/documents/{filename}/versions/{version}/restore")
def restore_document_version(filename: str, version: int, workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    name = _safe_name(filename)
    record = db.query(DocumentRecord).filter_by(workspace_id=workspace.id, filename=name).first()
    if record is None:
        raise HTTPException(404, f"No document named {name}")
    archived = db.query(DocumentVersion).filter_by(document_id=record.id, version=version).first()
    if archived is None or not Path(archived.stored_path).is_file():
        raise HTTPException(404, "Document version not found")
    paths = ensure_workspace_paths(workspace.id)
    destination = paths["documents"] / name
    current_version = record.version
    current_archive = paths["documents"] / ".versions" / name / f"v{current_version}{destination.suffix.lower()}"
    current_archive.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and not current_archive.exists():
        current_archive.write_bytes(destination.read_bytes())
    destination.write_bytes(Path(archived.stored_path).read_bytes())
    db.add(DocumentVersion(document_id=record.id, version=current_version, filename=name,
                           content_hash=record.content_hash, stored_path=str(current_archive)))
    record.version = current_version + 1
    record.content_hash = hashlib.sha256(destination.read_bytes()).hexdigest()
    record.status = "uploaded"
    record.error = None
    record.processed_at = None
    db.commit()
    return {"filename": name, "version": record.version, "status": record.status}


@app.get("/documents/{filename}/preview")
def preview_document(filename: str, workspace: Workspace = Depends(current_workspace)) -> FileResponse:
    name = _safe_name(filename)
    path = ensure_workspace_paths(workspace.id)["documents"] / name
    if not path.is_file():
        raise HTTPException(404, f"No document named {name}")
    media_types = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
    return FileResponse(path, media_type=media_types.get(path.suffix.lower(), "application/octet-stream"), content_disposition_type="inline")


@app.post("/documents/youtube")
def add_youtube(req: YouTubeRequest, user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Register a YouTube URL as a document for the existing transcript parser."""
    video_id = extract_video_id(req.url)
    if not video_id:
        raise HTTPException(400, "Invalid YouTube URL or video id.")

    d = ensure_workspace_paths(workspace.id)["documents"]
    d.mkdir(parents=True, exist_ok=True)
    filename = f"youtube_{video_id}.yt"
    path = d / filename
    if path.exists():
        raise HTTPException(409, f"This YouTube video is already uploaded as {filename}.")

    path.write_text(req.url.strip(), encoding="utf-8")
    db.add(DocumentRecord(
        workspace_id=workspace.id,
        filename=filename,
        source_type="youtube",
        content_hash=hashlib.sha256(req.url.strip().encode("utf-8")).hexdigest(),
    ))
    _audit(db, workspace.id, user.id, "document.upload_youtube", "document", filename, {"video_id": video_id})
    db.commit()
    logging.info("Registered YouTube video %s as %s", video_id, filename)
    return {"filename": filename, "video_id": video_id, "size_bytes": path.stat().st_size}


@app.delete("/documents/{filename}")
def delete_document(filename: str, x_subject_id: str | None = Header(default=None), user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    name = _safe_name(filename)
    path = ensure_workspace_paths(workspace.id)["documents"] / name
    if not path.is_file():
        raise HTTPException(404, f"No document named {name}")
    path.unlink()
    record = db.query(DocumentRecord).filter_by(workspace_id=workspace.id, filename=name).first()
    if x_subject_id:
        subject_for_workspace(x_subject_id, workspace, db)
        if record is None or record.subject_id != x_subject_id:
            raise HTTPException(404, f"No document named {name} in this subject")
    if record:
        db.delete(record)
    _audit(db, workspace.id, user.id, "document.delete", "document", name)
    db.commit()
    logging.info(f"Deleted {name}")
    return {"deleted": name}


@app.post("/pipeline/run")
def pipeline_run(x_subject_id: str | None = Header(default=None), user: User = Depends(current_user), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    scope_id = workspace.id
    if x_subject_id:
        subject = subject_for_workspace(x_subject_id, workspace, db)
        subject_paths = ensure_subject_paths(workspace.id, subject.id)
        source_dir = ensure_workspace_paths(workspace.id)["documents"]
        subject_paths["documents"].mkdir(parents=True, exist_ok=True)
        for record in db.query(DocumentRecord).filter_by(workspace_id=workspace.id, subject_id=subject.id).all():
            source = source_dir / record.filename
            if source.is_file():
                shutil.copy2(source, subject_paths["documents"] / record.filename)
        scope_id = f"{workspace.id}::{subject.id}"
    job = PipelineJob(workspace_id=workspace.id, subject_id=x_subject_id, status="queued", started_at=datetime.now(timezone.utc))
    db.add(job)
    db.flush()
    _metrics["pipeline_jobs_total"] += 1
    _audit(db, workspace.id, user.id, "pipeline.start", "pipeline_job", job.id)
    db.commit()
    if settings.pipeline_execution_mode == "worker":
        job.status = "queued"
        db.commit()
        return {"started": True, "queued": True, "job_id": job.id}
    result = get_runner(scope_id).start(scope_id)
    if not result.get("started"):
        job.status = "rejected"
        job.error = result.get("reason")
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        return result
    job.status = "running"
    db.commit()
    return {**result, "job_id": job.id}


@app.get("/pipeline/status")
def pipeline_status(x_subject_id: str | None = Header(default=None), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    if x_subject_id:
        if db.query(Subject).filter_by(id=x_subject_id, workspace_id=workspace.id).first() is None:
            return {"running": False, "current": None, "error": None, "stages": [], "elapsed": 0}
    scope_id = f"{workspace.id}::{x_subject_id}" if x_subject_id else workspace.id
    state = get_runner(scope_id).state
    db = SessionLocal()
    try:
        job = (db.query(PipelineJob).filter_by(workspace_id=workspace.id, subject_id=x_subject_id)
               .order_by(PipelineJob.created_at.desc()).first())
        if job:
            state["job_id"] = job.id
            state["job_status"] = job.status
            if job.status == "completed" and job.finished_at:
                if _pipeline_loaded_at.get(scope_id, 0.0) < job.finished_at.timestamp():
                    _invalidate_pipeline(scope_id)
    finally:
        db.close()
    return state


@app.post("/ask")
def ask(req: AskRequest, x_subject_id: str | None = Header(default=None), workspace: Workspace = Depends(current_workspace), db: Session = Depends(get_db)) -> Dict[str, Any]:
    if x_subject_id:
        subject_for_workspace(x_subject_id, workspace, db)
        _materialize_subject_artifacts(workspace, x_subject_id, db)
    scope_id = f"{workspace.id}::{x_subject_id}" if x_subject_id else workspace.id
    pipeline = get_pipeline(scope_id)
    try:
        answer = pipeline.ask(req.query, req.top_k).to_dict()
        session = None
        if req.session_id:
            session = db.query(ChatSession).filter_by(id=req.session_id, workspace_id=workspace.id).first()
            if session is None:
                raise HTTPException(404, "Chat session not found")
        if session is None:
            session = ChatSession(workspace_id=workspace.id, title=req.query[:80])
            db.add(session)
            db.flush()
        db.add(ChatMessage(session_id=session.id, role="user", content=req.query))
        db.add(ChatMessage(session_id=session.id, role="assistant", content=answer.get("answer", ""),
                           metadata_json=json.dumps(answer, ensure_ascii=False)))
        db.commit()
        answer["session_id"] = session.id
        return answer
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Question failed")
        raise HTTPException(500, f"Question failed: {e}")
