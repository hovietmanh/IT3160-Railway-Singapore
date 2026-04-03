import json
from fastapi import APIRouter, HTTPException
from backend.app.services.pathfinding import (
    get_pathfinding_service,
    reload_pathfinding_service,
)
from backend.app.database import get_db_connection

router = APIRouter(prefix="/api", tags=["path"])


@router.post("/reload")
def reload_graph():
    """Force reload graph từ DB (dùng sau khi rawprocessing chạy lại)."""
    svc = reload_pathfinding_service()
    return {"stations": len(svc.nodes), "connections": len(svc.edges), "lines": len(svc.lines)}


@router.get("/lines")
def get_all_lines():
    """Trả về danh sách tất cả các tuyến MRT."""
    service = get_pathfinding_service()
    return list(service.lines.values())


@router.get("/stations")
def get_all_stations():
    """Trả về danh sách ga với thông tin tuyến."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, lat, lon FROM stations ORDER BY name")
        rows = cursor.fetchall()

        # Lấy line info cho mỗi ga (dựa trên connections)
        station_lines: dict = {}
        cursor.execute("""
            SELECT DISTINCT c.from_id, l.id, l.name, l.short_name, l.color
            FROM connections c
            JOIN lines l ON c.line_id = l.id
        """)
        for r in cursor.fetchall():
            sid = r["from_id"]
            station_lines.setdefault(sid, [])
            entry = {"id": r["id"], "name": r["name"],
                     "short_name": r["short_name"], "color": r["color"]}
            if entry not in station_lines[sid]:
                station_lines[sid].append(entry)

    return [
        {
            "id":    r["id"],
            "name":  r["name"],
            "lat":   r["lat"],
            "lon":   r["lon"],
            "lines": station_lines.get(r["id"], [])
        }
        for r in rows
    ]


@router.get("/nearest_station")
def get_nearest_station(lat: float, lon: float):
    """Trả về ga gần nhất với tọa độ cho trước."""
    service = get_pathfinding_service()
    sid = service.find_nearest_station(lat, lon)
    if sid is None:
        raise HTTPException(status_code=404, detail="Không tìm được ga")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, lat, lon FROM stations WHERE id=?", (sid,))
        row = cursor.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Không tìm được ga")

        cursor.execute("""
            SELECT DISTINCT l.id, l.name, l.short_name, l.color
            FROM connections c JOIN lines l ON c.line_id = l.id
            WHERE c.from_id = ?
        """, (sid,))
        lines = [{"id": r["id"], "name": r["name"],
                  "short_name": r["short_name"], "color": r["color"]}
                 for r in cursor.fetchall()]

    nlat, nlon = service.nodes[sid]
    return {"id": sid, "name": row["name"], "lat": nlat, "lon": nlon, "lines": lines}


@router.get("/route")
def find_route(start_lat: float, start_lon: float,
               goal_lat:  float, goal_lon:  float):
    """
    Tìm đường đi từ tọa độ start đến tọa độ goal.
    Tự động snap về ga gần nhất cho cả hai đầu.
    Trả về path nodes, segments (với line info + geometry), tổng khoảng cách.
    """
    service = get_pathfinding_service()
    result  = service.find_path(start_lat, start_lon, goal_lat, goal_lon)

    if result is None:
        raise HTTPException(status_code=404, detail="Không tìm được đường đi")

    path_ids = result["path"]

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Thông tin tên cho mỗi ga trong path
        path_nodes = []
        for sid in path_ids:
            cursor.execute("SELECT name, lat, lon FROM stations WHERE id=?", (sid,))
            row = cursor.fetchone()
            lat, lon = service.nodes[sid]
            path_nodes.append({
                "id":   sid,
                "name": row["name"] if row else "",
                "lat":  lat,
                "lon":  lon
            })

        # Thông tin start/end station
        start_row = path_nodes[0]
        end_row   = path_nodes[-1]

        # Segments với geometry + line info
        segments_out = []
        for seg in result["segments"]:
            u, v, lid = seg["from_id"], seg["to_id"], seg["line_id"]
            line_info = service.lines.get(lid, {"name": "Unknown", "color": "#888888", "short_name": "?"}) if lid else {"name": "Unknown", "color": "#888888", "short_name": "?"}

            # Lấy geometry
            cursor.execute("""
                SELECT geometry FROM rail_geometry
                WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)
                LIMIT 1
            """, (u, v, v, u))
            geo_row = cursor.fetchone()
            if geo_row:
                coords = json.loads(geo_row["geometry"])
            else:
                # Fallback: đường thẳng
                ulat, ulon = service.nodes[u]
                vlat, vlon = service.nodes[v]
                coords = [[ulat, ulon], [vlat, vlon]]

            # Orient geometry so it starts near station u
            if coords and len(coords) >= 2:
                ulat, ulon = service.nodes[u]
                dist_fwd = abs(coords[0][0] - ulat) + abs(coords[0][1] - ulon)
                dist_rev = abs(coords[-1][0] - ulat) + abs(coords[-1][1] - ulon)
                if dist_rev < dist_fwd:
                    coords = list(reversed(coords))

            # Merge consecutive same-line segments
            if (segments_out and segments_out[-1]["line_id"] == lid
                    and segments_out[-1]["coords"]):
                segments_out[-1]["coords"].extend(coords[1:])
                segments_out[-1]["to_id"] = v
            else:
                segments_out.append({
                    "from_id":    u,
                    "to_id":      v,
                    "line_id":    lid,
                    "line_name":  line_info["name"],
                    "line_short": line_info.get("short_name", ""),
                    "line_color": line_info["color"],
                    "coords":     coords
                })

    return {
        "start_station": start_row,
        "end_station":   end_row,
        "path":          path_nodes,
        "segments":      segments_out,
        "distance":      result["distance"],
        "num_stations":  result["num_stations"]
    }


@router.get("/network")
def get_network():
    """
    Trả về mạng lưới MRT để vẽ bản đồ.
    Đọc thứ tự ga từ bảng line_stops (được sinh bởi rawprocessing.py).
    Mỗi direction_id cho một polyline liên tục; geometry từ rail_geometry.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT id, name, short_name, color FROM lines ORDER BY id")
        lines = {r["id"]: dict(r) for r in cursor.fetchall()}

        cursor.execute("SELECT id, lat, lon FROM stations")
        stations = {r["id"]: (r["lat"], r["lon"]) for r in cursor.fetchall()}

        # geometry keyed by (min_id, max_id)
        cursor.execute("SELECT from_id, to_id, geometry FROM rail_geometry")
        geo_map = {}
        for r in cursor.fetchall():
            key = (min(r["from_id"], r["to_id"]), max(r["from_id"], r["to_id"]))
            if key not in geo_map:
                geo_map[key] = json.loads(r["geometry"])

        # line_stops: line_id -> direction_id -> [station_id in seq order]
        cursor.execute(
            "SELECT line_id, direction_id, station_id FROM line_stops "
            "ORDER BY line_id, direction_id, seq"
        )
        line_dirs: dict = {}
        for r in cursor.fetchall():
            line_dirs.setdefault(r["line_id"], {}).setdefault(
                r["direction_id"], []
            ).append(r["station_id"])

    def build_polyline(station_ids: list) -> list:
        """Build continuous [[lat,lon],...] from ordered station IDs."""
        coords: list = []
        for i in range(len(station_ids) - 1):
            u, v = station_ids[i], station_ids[i + 1]
            key = (min(u, v), max(u, v))
            seg = geo_map.get(key)
            if seg and len(seg) >= 2:
                ulat, ulon = stations.get(u, (None, None))
                if ulat is None:
                    continue
                # Orient segment so it starts near station u
                dist_fwd = abs(seg[0][0] - ulat) + abs(seg[0][1] - ulon)
                dist_rev = abs(seg[-1][0] - ulat) + abs(seg[-1][1] - ulon)
                if dist_rev < dist_fwd:
                    seg = list(reversed(seg))
                coords.extend(seg if not coords else seg[1:])
            else:
                pos_u = stations.get(u)
                pos_v = stations.get(v)
                if pos_u is None or pos_v is None:
                    continue
                if not coords:
                    coords.append(list(pos_u))
                coords.append(list(pos_v))
        return coords

    result = []
    for lid, info in lines.items():
        dirs = line_dirs.get(lid, {})
        line_segments = []
        for dir_id in sorted(dirs):
            coords = build_polyline(dirs[dir_id])
            if len(coords) >= 2:
                line_segments.append(coords)
        result.append({
            "id":         info["id"],
            "name":       info["name"],
            "short_name": info["short_name"],
            "color":      info["color"],
            "segments":   line_segments,
        })

    return result
