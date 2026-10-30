from sqlalchemy import inspect, text
from uuid import uuid4

from storage.database import Base, engine


SCHEMA_VERSION = 5


def upgrade_database() -> None:
    """Create the current schema and record its version for local/prod startup."""
    from storage import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(version INTEGER PRIMARY KEY, applied_at TIMESTAMP NOT NULL)"
        )
        already_applied = connection.execute(
            text("SELECT 1 FROM schema_migrations WHERE version = :version"),
            {"version": SCHEMA_VERSION},
        ).first() is not None
        connection.execute(
            text("INSERT INTO schema_migrations (version, applied_at) "
                 "SELECT :version, CURRENT_TIMESTAMP WHERE NOT EXISTS "
                 "(SELECT 1 FROM schema_migrations WHERE version = :version)"),
            {"version": SCHEMA_VERSION},
        )
        existing = {column["name"] for column in inspect(engine).get_columns("documents")}
        if "version" not in existing:
            connection.exec_driver_sql("ALTER TABLE documents ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
        if "processed_at" not in existing:
            connection.exec_driver_sql("ALTER TABLE documents ADD COLUMN processed_at TIMESTAMP NULL")
        if "subject_id" not in existing:
            connection.exec_driver_sql("ALTER TABLE documents ADD COLUMN subject_id VARCHAR(36) NULL")
        pipeline_columns = {column["name"] for column in inspect(engine).get_columns("pipeline_jobs")}
        if "subject_id" not in pipeline_columns:
            connection.exec_driver_sql("ALTER TABLE pipeline_jobs ADD COLUMN subject_id VARCHAR(36) NULL")
        message_columns = {column["name"] for column in inspect(engine).get_columns("chat_messages")}
        if "metadata_json" not in message_columns:
            connection.exec_driver_sql("ALTER TABLE chat_messages ADD COLUMN metadata_json TEXT NULL")

        # Seed subjects only once, and only for the historical workspace data
        # explicitly identified by the product owner. New workspaces must stay
        # empty until their user creates a subject in the UI.
        if not already_applied:
            workspaces = connection.execute(text("SELECT id FROM workspaces")).fetchall()
            for (workspace_id,) in workspaces:
                historical = connection.execute(text(
                    "SELECT 1 FROM documents WHERE workspace_id = :workspace_id "
                    "AND lower(filename) LIKE '%resnet%' "
                    "AND EXISTS (SELECT 1 FROM documents d2 WHERE d2.workspace_id = :workspace_id "
                    "AND lower(d2.filename) LIKE '%lenet%') "
                    "AND EXISTS (SELECT 1 FROM documents d3 WHERE d3.workspace_id = :workspace_id "
                    "AND lower(d3.filename) LIKE '%itpm%') LIMIT 1"
                ), {"workspace_id": workspace_id}).first()
                if not historical:
                    # The previous buggy seed assigned documents to AI/ITPM in
                    # unrelated workspaces. Unassign those legacy seed links,
                    # keep the files, and remove the unwanted subjects.
                    connection.execute(text(
                        "UPDATE documents SET subject_id = NULL WHERE workspace_id = :workspace_id "
                        "AND subject_id IN (SELECT id FROM subjects WHERE workspace_id = :workspace_id "
                        "AND name IN ('AI', 'ITPM'))"
                    ), {"workspace_id": workspace_id})
                    connection.execute(text(
                        "DELETE FROM subjects WHERE workspace_id = :workspace_id "
                        "AND name IN ('AI', 'ITPM')"
                    ), {"workspace_id": workspace_id})
                    continue

                rows = connection.execute(text(
                    "SELECT id, name FROM subjects WHERE workspace_id = :workspace_id"
                ), {"workspace_id": workspace_id}).fetchall()
                existing_subjects = {name: subject_id for subject_id, name in rows}
                ai_match = connection.execute(text(
                    "SELECT 1 FROM documents WHERE workspace_id = :workspace_id AND "
                    "(lower(filename) LIKE '%resnet%' OR lower(filename) LIKE '%lenet%' "
                    "OR lower(filename) LIKE '%gradient%' OR lower(filename) LIKE '%minibatch%') LIMIT 1"
                ), {"workspace_id": workspace_id}).first()
                itpm_match = connection.execute(text(
                    "SELECT 1 FROM documents WHERE workspace_id = :workspace_id AND lower(filename) LIKE '%itpm%' LIMIT 1"
                ), {"workspace_id": workspace_id}).first()

                subject_ids = {}
                for subject_name, matched in (("AI", ai_match), ("ITPM", itpm_match)):
                    if not matched:
                        continue
                    subject_id = existing_subjects.get(subject_name)
                    if subject_id is None:
                        subject_id = str(uuid4())
                        connection.execute(text(
                            "INSERT INTO subjects (id, workspace_id, name, created_at) "
                            "VALUES (:id, :workspace_id, :name, CURRENT_TIMESTAMP)"
                        ), {"id": subject_id, "workspace_id": workspace_id, "name": subject_name})
                    subject_ids[subject_name] = subject_id

                if "AI" in subject_ids:
                    for pattern in ("%resnet%", "%lenet%", "%gradient%", "%minibatch%"):
                        connection.execute(text(
                            "UPDATE documents SET subject_id = :subject_id WHERE workspace_id = :workspace_id "
                            "AND subject_id IS NULL AND lower(filename) LIKE :pattern"
                        ), {"subject_id": subject_ids["AI"], "workspace_id": workspace_id, "pattern": pattern})
                if "ITPM" in subject_ids:
                    connection.execute(text(
                        "UPDATE documents SET subject_id = :subject_id WHERE workspace_id = :workspace_id "
                        "AND subject_id IS NULL AND lower(filename) LIKE '%itpm%'"
                    ), {"subject_id": subject_ids["ITPM"], "workspace_id": workspace_id})
