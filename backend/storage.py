import json
import sqlite3
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "app.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL,
                summary TEXT NOT NULL,
                profile_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES documents (id)
            )
            """
        )


def save_document(content: str) -> int:
    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO documents (content) VALUES (?)",
            (content,),
        )
        return int(cursor.lastrowid)


def save_profile(document_id: int, profile: dict[str, Any]) -> int:
    summary = profile.get("summary", "")
    with get_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO profiles (document_id, summary, profile_json) VALUES (?, ?, ?)",
            (document_id, summary, json.dumps(profile, ensure_ascii=False)),
        )
        return int(cursor.lastrowid)


def list_documents() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, content, created_at FROM documents ORDER BY id DESC"
        ).fetchall()

    return [dict(row) for row in rows]


def list_profiles() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT id, document_id, summary, profile_json, created_at FROM profiles ORDER BY id DESC"
        ).fetchall()

    profiles = []
    for row in rows:
        profile = dict(row)
        profile["profile_json"] = json.loads(profile["profile_json"])
        profiles.append(profile)

    return profiles
