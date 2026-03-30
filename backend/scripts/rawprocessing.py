import json
import math
import sqlite3
from pathlib import Path

DB_PATH = Path("backend/data/pathfinding.db")
SCRIPTS = Path("backend/scripts")

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def load_stations():
    with open(SCRIPTS / "stations.json", encoding="utf-8") as f:
        data = json.load(f)

    stations = {}
    for el in data["elements"]:
        if el["type"] != "node":
            continue
        tags = el.get("tags", {})
        name = tags.get("name", "").strip()
        if not name:
            continue
        stations[el["id"]] = {
            "id": el["id"],
            "name": name,
            "lat": el["lat"],
            "lon": el["lon"]
        }
    return stations

def load_connections(stations):
    with open(SCRIPTS / "railways.json", encoding="utf-8") as f:
        data = json.load(f)

    connections = set()
    station_ids = set(stations.keys())

    for el in data["elements"]:
        if el["type"] != "way":
            continue
        nodes = el.get("nodes", [])
        geometry = el.get("geometry", [])

        # Lấy các node trong way mà là ga
        station_nodes_in_way = [n for n in nodes if n in station_ids]

        # Nối các ga liền kề trong cùng 1 way
        for i in range(len(station_nodes_in_way) - 1):
            u = station_nodes_in_way[i]
            v = station_nodes_in_way[i + 1]
            if u == v:
                continue

            # Tính khoảng cách Haversine
            s1 = stations[u]
            s2 = stations[v]
            dist = haversine(s1["lat"], s1["lon"], s2["lat"], s2["lon"])

            # Thêm cả 2 chiều
            connections.add((min(u,v), max(u,v), round(dist, 2)))

    return connections

def main():
    print("--- Đang xử lý dữ liệu ---")

    # Bước 1: Load stations
    stations = load_stations()
    print(f"Bước 1: Tìm thấy {len(stations)} ga có tên")

    # Bước 2: Load connections
    connections = load_connections(stations)
    print(f"Bước 2: Tìm thấy {len(connections)} kết nối giữa các ga")

    # Bước 3: Lưu vào DB
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("DELETE FROM stations")
    cursor.execute("DELETE FROM connections")

    for s in stations.values():
        cursor.execute(
            "INSERT INTO stations (id, name, lat, lon) VALUES (?, ?, ?, ?)",
            (s["id"], s["name"], s["lat"], s["lon"])
        )

    for (u, v, w) in connections:
        cursor.execute(
            "INSERT INTO connections (from_id, to_id, weight) VALUES (?, ?, ?)",
            (u, v, w)
        )
        cursor.execute(
            "INSERT INTO connections (from_id, to_id, weight) VALUES (?, ?, ?)",
            (v, u, w)
        )

    conn.commit()

    # Bước 4: Verify
    n_sta  = cursor.execute("SELECT COUNT(*) FROM stations").fetchone()[0]
    n_conn = cursor.execute("SELECT COUNT(*) FROM connections").fetchone()[0]
    print(f"Bước 3: Đã lưu vào DB → {n_sta} ga, {n_conn} kết nối")

    conn.close()
    print("Done!")

if __name__ == "__main__":
    main()