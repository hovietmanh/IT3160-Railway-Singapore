import sqlite3
from contextlib import contextmanager
from pathlib import Path
from backend.app.config import settings

@contextmanager
def get_db_connection():
    db_path = Path(settings.DB_PATH)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()