import sqlite3
from pathlib import Path
from passlib.context import CryptContext

DB_PATH     = Path("backend/data/pathfinding.db")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn   = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS lines (
            id         INTEGER PRIMARY KEY,
            name       TEXT NOT NULL,
            short_name TEXT NOT NULL,
            color      TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stations (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            lat  REAL NOT NULL,
            lon  REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS connections (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            from_id INTEGER NOT NULL REFERENCES stations(id),
            to_id   INTEGER NOT NULL REFERENCES stations(id),
            weight  REAL NOT NULL,
            line_id INTEGER REFERENCES lines(id)
        );

        CREATE TABLE IF NOT EXISTS rail_geometry (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            from_id INTEGER NOT NULL REFERENCES stations(id),
            to_id   INTEGER NOT NULL REFERENCES stations(id),
            line_id INTEGER REFERENCES lines(id),
            geometry TEXT NOT NULL
        );

        -- Thu tu cac ga tren moi tuyen (de ve ban do)
        CREATE TABLE IF NOT EXISTS line_stops (
            line_id      INTEGER NOT NULL REFERENCES lines(id),
            direction_id INTEGER NOT NULL DEFAULT 0,
            seq          INTEGER NOT NULL,
            station_id   INTEGER NOT NULL REFERENCES stations(id),
            PRIMARY KEY (line_id, direction_id, seq)
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
    print("Done! Tables: lines, stations, connections, rail_geometry, line_stops, admin")


if __name__ == "__main__":
    init_db()
