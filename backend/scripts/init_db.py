import sqlite3
import sys
from pathlib import Path
from passlib.context import CryptContext

DB_PATH = Path("backend/data/pathfinding.db")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashed_password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin'
        )
    """)

    username = "admin"
    password = "admin123"
    hashed = pwd_context.hash(password)

    cursor.execute(
        "INSERT OR IGNORE INTO admin (username, hashed_password, role) VALUES (?, ?, ?)",
        (username, hashed, "admin")
    )

    conn.commit()
    conn.close()
    print(f"Done! Admin account created: username='{username}', password='{password}'")

if __name__ == "__main__":
    init_db()