import sqlite3
from pathlib import Path
from passlib.context import CryptContext

DB_PATH = Path("backend/data/pathfinding.db")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS stations (
            id      INTEGER PRIMARY KEY,
            name    TEXT NOT NULL,
            lat     REAL NOT NULL,
            lon     REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS connections (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            from_id     INTEGER NOT NULL,
            to_id       INTEGER NOT NULL,
            weight      REAL NOT NULL,
            way_id      INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (from_id) REFERENCES stations(id),
            FOREIGN KEY (to_id)   REFERENCES stations(id)
        );

        CREATE TABLE IF NOT EXISTS admin (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT NOT NULL UNIQUE,
            hashed_password TEXT NOT NULL,
            role            TEXT NOT NULL DEFAULT 'admin'
        );
    """)

    hashed = pwd_context.hash("admin123")
    cursor.execute(
        "INSERT OR IGNORE INTO admin (username, hashed_password, role) VALUES (?, ?, ?)",
        ("admin", hashed, "admin")
    )

    conn.commit()
    conn.close()
    print("Done! Tables: stations, connections, admin")

if __name__ == "__main__":
    init_db()