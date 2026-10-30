from pathlib import Path

from config import settings


def workspace_paths(workspace_id: str) -> dict[str, Path]:
    """Return isolated filesystem locations for one authenticated workspace."""
    safe_id = "".join(ch for ch in workspace_id if ch.isalnum() or ch in "-_")
    if not safe_id or safe_id != workspace_id:
        raise ValueError("Invalid workspace id")
    root = Path(settings.data_dir).parent / "workspaces" / safe_id
    return {
        "root": root,
        "documents": root / "documents",
        "output": root / "output",
        "data": root / "data",
        "vectors": root / "qdrant_data",
    }


def ensure_workspace_paths(workspace_id: str) -> dict[str, Path]:
    paths = workspace_paths(workspace_id)
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths


def subject_paths(workspace_id: str, subject_id: str) -> dict[str, Path]:
    """Isolated pipeline/artifact locations for one subject in a workspace."""
    workspace_root = workspace_paths(workspace_id)["root"]
    safe_subject = "".join(ch for ch in subject_id if ch.isalnum() or ch in "-_")
    if not safe_subject or safe_subject != subject_id:
        raise ValueError("Invalid subject id")
    root = workspace_root / "subjects" / safe_subject
    return {"root": root, "documents": root / "documents", "output": root / "output", "data": root / "data", "vectors": root / "qdrant_data"}


def ensure_subject_paths(workspace_id: str, subject_id: str) -> dict[str, Path]:
    paths = subject_paths(workspace_id, subject_id)
    for path in paths.values():
        path.mkdir(parents=True, exist_ok=True)
    return paths
