import json
import math
import sqlite3
from pathlib import Path

DB_PATH = Path("backend/data/pathfinding.db")
SCRIPTS = Path("backend/scripts")

LON_MIN, LON_MAX = 103.6, 104.1
LAT_MIN, LAT_MAX = 1.2,   1.5
MAP_W, MAP_H     = 10000, 10000

def lon_to_x(lon):
    return (lon - LON_MIN) / (LON_MAX - LON_MIN) * MAP_W

def lat_to_y(lat):
    return (1 - (lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * MAP_H

def euclid(x1, y1, x2, y2):
    return math.sqrt((x2-x1)**2 + (y2-y1)**2)

def project_along_way(sx, sy, geometry_xy):
    best_proj = 0
    best_dist = float('inf')
    accumulated = 0
    for i in range(len(geometry_xy) - 1):
        x1, y1 = geometry_xy[i]
        x2, y2 = geometry_xy[i+1]
        seg_len = euclid(x1, y1, x2, y2)
        dx, dy  = x2-x1, y2-y1
        len_sq  = dx*dx + dy*dy
        if len_sq > 0:
            t    = max(0, min(1, ((sx-x1)*dx + (sy-y1)*dy) / len_sq))
            px   = x1 + t*dx
            py   = y1 + t*dy
            dist = euclid(sx, sy, px, py)
        else:
            dist = euclid(sx, sy, x1, y1)
            t    = 0
        if dist < best_dist:
            best_dist = dist
            best_proj = accumulated + t * seg_len
        accumulated += seg_len
    return best_proj, best_dist

def main():
    # =============================================
    # BƯỚC 1: Trích xuất node và way từ file JSON
    # =============================================
    with open(SCRIPTS / "stations.json", encoding="utf-8") as f:
        s_data = json.load(f)
    with open(SCRIPTS / "railways.json", encoding="utf-8") as f:
        r_data = json.load(f)

    raw_stations = {}
    for el in s_data["elements"]:
        if el["type"] != "node":
            continue
        name = el.get("tags", {}).get("name", "").strip()
        if not name:
            continue
        raw_stations[el["id"]] = {
            "id":   el["id"],
            "name": name,
            "lat":  el["lat"],
            "lon":  el["lon"],
        }

    # Gộp ga trùng tên → giữ 1 node đại diện
    name_to_station = {}
    id_remap = {}

    for nid, s in raw_stations.items():
        name = s["name"]
        if name not in name_to_station:
            name_to_station[name] = s
            id_remap[nid] = nid
        else:
            id_remap[nid] = name_to_station[name]["id"]

    stations = {s["id"]: s for s in name_to_station.values()}
    ways = [el for el in r_data["elements"] if el["type"] == "way"]
    print(f"Bước 1: {len(raw_stations)} ga thô → {len(stations)} ga sau khi gộp, {len(ways)} ways")

    # =============================================
    # BƯỚC 2: Chuyển lon/lat → x/y
    # =============================================
    for s in stations.values():
        s["x"] = lon_to_x(s["lon"])
        s["y"] = lat_to_y(s["lat"])

    print(f"Bước 2: Đã chuyển tọa độ {len(stations)} ga")

    # =============================================
    # BƯỚC 3: Chiếu ga lên ray, tính khoảng cách
    # =============================================
    SNAP_THRESHOLD = 200
    connections = {}
    station_list = list(stations.values())

    for way in ways:
        geom = way.get("geometry", [])
        if len(geom) < 2:
            continue

        geom_xy = [(lon_to_x(p["lon"]), lat_to_y(p["lat"])) for p in geom]

        snapped = []
        for s in station_list:
            proj, dist = project_along_way(s["x"], s["y"], geom_xy)
            if dist <= SNAP_THRESHOLD:
                snapped.append((proj, s))

        snapped.sort(key=lambda x: x[0])

        for i in range(len(snapped) - 1):
            s1 = snapped[i][1]
            s2 = snapped[i+1][1]

            s1_id = id_remap.get(s1["id"], s1["id"])
            s2_id = id_remap.get(s2["id"], s2["id"])

            if s1_id == s2_id:
                continue

            proj1 = snapped[i][0]
            proj2 = snapped[i+1][0]
            dist  = abs(proj2 - proj1)

            key = (min(s1_id, s2_id), max(s1_id, s2_id))
            if key not in connections or dist < connections[key]:
                connections[key] = round(dist, 2)

    print(f"Bước 3: Tìm thấy {len(connections)} kết nối giữa các ga")

    # =============================================
    # BƯỚC 4: Loại bỏ kết nối không hợp lệ
    # =============================================
    valid = {
        (u, v): w for (u, v), w in connections.items()
        if u in stations and v in stations
    }
    print(f"Bước 4: {len(valid)} kết nối hợp lệ sau khi lọc")

    if len(valid) == 0:
        print("CẢNH BÁO: Không có kết nối nào!")
        return

    # =============================================
    # BƯỚC 5: Lưu vào database
    # =============================================
    conn   = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM stations")
    cursor.execute("DELETE FROM connections")

    for s in stations.values():
        cursor.execute(
            "INSERT INTO stations (id, name, lat, lon) VALUES (?, ?, ?, ?)",
            (s["id"], s["name"], s["lat"], s["lon"])
        )

    for (u, v), w in valid.items():
        cursor.execute(
            "INSERT INTO connections (from_id, to_id, weight) VALUES (?, ?, ?)",
            (u, v, w)
        )
        cursor.execute(
            "INSERT INTO connections (from_id, to_id, weight) VALUES (?, ?, ?)",
            (v, u, w)
        )

    conn.commit()
    n_sta  = cursor.execute("SELECT COUNT(*) FROM stations").fetchone()[0]
    n_conn = cursor.execute("SELECT COUNT(*) FROM connections").fetchone()[0]
    print(f"Bước 5: Đã lưu → {n_sta} ga, {n_conn} kết nối")
    conn.close()
    print("Done!")

if __name__ == "__main__":
    main()