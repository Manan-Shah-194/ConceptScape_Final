from sqlalchemy import inspect, text
from uuid import uuid4

from storage.database import Base, engine


SCHEMA_VERSION = 2


def upgrade_database() -> None:
    """Create the current schema and record its version for local/prod startup."""
    from storage import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS schema_migrations "
            "(version INTEGER PRIMARY KEY, applied_at TIMESTAMP NOT NULL)"
        )
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
        message_columns = {column["name"] for column in inspect(engine).get_columns("chat_messages")}
        if "metadata_json" not in message_columns:
            connection.exec_driver_sql("ALTER TABLE chat_messages ADD COLUMN metadata_json TEXT NULL")

        # Seed the subject layer for existing workspaces without changing or
        # deleting any documents. These names are only for the historical
        # records explicitly identified by the product owner; new workspaces
        # start with no subjects and users create them themselves.
        workspaces = connection.execute(text("SELECT id FROM workspaces")).fetchall()
        for (workspace_id,) in workspaces:
            rows = connection.execute(text("SELECT id, name FROM subjects WHERE workspace_id = :workspace_id"), {"workspace_id": workspace_id}).fetchall()
            existing_subjects = {name: subject_id for subject_id, name in rows}
            for subject_name in ("AI", "ITPM"):
                if subject_name not in existing_subjects:
                    subject_id = str(uuid4())
                    connection.execute(text("INSERT INTO subjects (id, workspace_id, name, created_at) VALUES (:id, :workspace_id, :name, CURRENT_TIMESTAMP)"), {"id": subject_id, "workspace_id": workspace_id, "name": subject_name})
                    existing_subjects[subject_name] = subject_id
            ai_id = existing_subjects["AI"]
            itpm_id = existing_subjects["ITPM"]
            connection.execute(text("UPDATE documents SET subject_id = :subject_id WHERE workspace_id = :workspace_id AND subject_id IS NULL AND lower(filename) LIKE :pattern"), {"subject_id": ai_id, "workspace_id": workspace_id, "pattern": "%resnet%"})
            connection.execute(text("UPDATE documents SET subject_id = :subject_id WHERE workspace_id = :workspace_id AND subject_id IS NULL AND lower(filename) LIKE :pattern"), {"subject_id": ai_id, "workspace_id": workspace_id, "pattern": "%lenet%"})
            connection.execute(text("UPDATE documents SET subject_id = :subject_id WHERE workspace_id = :workspace_id AND subject_id IS NULL AND lower(filename) LIKE :pattern"), {"subject_id": ai_id, "workspace_id": workspace_id, "pattern": "%gradient%"})
            connection.execute(text("UPDATE documents SET subject_id = :subject_id WHERE workspace_id = :workspace_id AND subject_id IS NULL AND lower(filename) LIKE :pattern"), {"subject_id": ai_id, "workspace_id": workspace_id, "pattern": "%minibatch%"})
            connection.execute(text("UPDATE documents SET subject_id = :subject_id WHERE workspace_id = :workspace_id AND subject_id IS NULL AND lower(filename) LIKE :pattern"), {"subject_id": itpm_id, "workspace_id": workspace_id, "pattern": "%itpm%"})
