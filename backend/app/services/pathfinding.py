import math
import heapq
from typing import Dict, List, Optional
from backend.app.database import get_db_connection


class PathfindingService:
    def __init__(self):
        self.nodes:            Dict[int, tuple] = {}   # id -> (lat, lon)
        self.adj_list:         Dict[int, List]  = {}   # id -> [(neighbor_id, conn_id)]
        self.edges:            Dict[int, dict]  = {}   # conn_id -> {from, to, weight, line_id}
        self.original_weights: Dict[int, float] = {}
        self.current_weights:  Dict[int, float] = {}
        self.lines:            Dict[int, dict]  = {}   # line_id -> {id, name, short_name, color}
        self._load()

    def _load(self):
        self.nodes.clear()
        self.adj_list.clear()
        self.edges.clear()
        self.original_weights.clear()
        self.lines.clear()

        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("SELECT id, name, short_name, color FROM lines")
            for row in cursor.fetchall():
                self.lines[row["id"]] = dict(row)

            cursor.execute("SELECT id, lat, lon FROM stations")
            for row in cursor.fetchall():
                nid = row["id"]
                self.nodes[nid]    = (row["lat"], row["lon"])
                self.adj_list[nid] = []

            cursor.execute(
                "SELECT id, from_id, to_id, weight, line_id FROM connections"
            )
            for row in cursor.fetchall():
                cid = row["id"]
                u, v, w, lid = (
                    row["from_id"], row["to_id"],
                    row["weight"], row["line_id"],
                )
                if u not in self.nodes or v not in self.nodes:
                    continue
                self.edges[cid] = {
                    "from": u, "to": v, "weight": w, "line_id": lid
                }
                self.adj_list[u].append((v, cid))
                self.original_weights[cid] = w

        self.current_weights = self.original_weights.copy()
        print(
            f"[PathfindingService] Loaded {len(self.nodes)} stations, "
            f"{len(self.edges)} connections, {len(self.lines)} lines"
        )

    # ── Geometry helpers ─────────────────────────────────────────────────────

    @staticmethod
    def haversine(lat1, lon1, lat2, lon2) -> float:
        R = 6_371_000
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    def heuristic(self, node_id: int, goal_id: int) -> float:
        if node_id not in self.nodes or goal_id not in self.nodes:
            return float("inf")
        lat1, lon1 = self.nodes[node_id]
        lat2, lon2 = self.nodes[goal_id]
        return self.haversine(lat1, lon1, lat2, lon2)

    # ── Nearest station ──────────────────────────────────────────────────────

    def find_nearest_station(self, lat: float, lon: float) -> Optional[int]:
        best_id, best_dist = None, float("inf")
        for nid, (nlat, nlon) in self.nodes.items():
            d = self.haversine(lat, lon, nlat, nlon)
            if d < best_dist:
                best_dist, best_id = d, nid
        return best_id

    # ── A* ───────────────────────────────────────────────────────────────────

    def a_star(self, start_id: int, goal_id: int) -> Optional[List[int]]:
        open_set  = [(0.0, start_id)]
        came_from: Dict[int, int]   = {}
        g_score:   Dict[int, float] = {start_id: 0.0}
        closed:    set              = set()

        while open_set:
            _, current = heapq.heappop(open_set)

            if current in closed:
                continue
            closed.add(current)

            if current == goal_id:
                path = []
                while current in came_from:
                    path.append(current)
                    current = came_from[current]
                path.append(start_id)
                return list(reversed(path))

            for neighbor, cid in self.adj_list.get(current, []):
                if neighbor in closed:
                    continue
                w = self.current_weights.get(cid, float("inf"))
                if w == float("inf"):
                    continue
                tentative_g = g_score.get(current, float("inf")) + w
                if tentative_g < g_score.get(neighbor, float("inf")):
                    came_from[neighbor] = current
                    g_score[neighbor]   = tentative_g
                    f = tentative_g + self.heuristic(neighbor, goal_id)
                    heapq.heappush(open_set, (f, neighbor))

        return None  # no path found

    # ── find_path (public entry point) ───────────────────────────────────────

    def find_path(
        self,
        start_lat: float, start_lon: float,
        goal_lat:  float, goal_lon:  float,
    ) -> Optional[dict]:
        start_id = self.find_nearest_station(start_lat, start_lon)
        goal_id  = self.find_nearest_station(goal_lat,  goal_lon)

        if start_id is None or goal_id is None:
            return None

        if start_id == goal_id:
            return {
                "start_station": start_id,
                "end_station":   goal_id,
                "path":          [start_id],
                "segments":      [],
                "distance":      0,
                "num_stations":  1,
            }

        path_ids = self.a_star(start_id, goal_id)
        if path_ids is None:
            return None

        # Build segment list: one entry per consecutive stop pair
        segments: List[dict] = []
        for i in range(len(path_ids) - 1):
            u, v = path_ids[i], path_ids[i + 1]
            cid = self._find_edge_between(u, v)
            lid = self.edges[cid]["line_id"] if cid is not None else None
            segments.append({"from_id": u, "to_id": v, "line_id": lid})

        total_dist = sum(
            self.haversine(
                self.nodes[path_ids[i]][0], self.nodes[path_ids[i]][1],
                self.nodes[path_ids[i + 1]][0], self.nodes[path_ids[i + 1]][1],
            )
            for i in range(len(path_ids) - 1)
        )

        return {
            "start_station": start_id,
            "end_station":   goal_id,
            "path":          path_ids,
            "segments":      segments,
            "distance":      round(total_dist),
            "num_stations":  len(path_ids),
        }

    # ── Edge lookup ──────────────────────────────────────────────────────────

    def _find_edge_between(self, from_id: int, to_id: int) -> Optional[int]:
        for neighbor, cid in self.adj_list.get(from_id, []):
            if neighbor == to_id:
                return cid
        return None

    # ── A* with original weights (blocking analysis) ─────────────────────────

    def a_star_original(self, start_id: int, goal_id: int) -> Optional[List[int]]:
        """A* chạy trên trọng số gốc – dùng để tìm đường 'tự nhiên' khi không có đóng."""
        open_set  = [(0.0, start_id)]
        came_from: Dict[int, int]   = {}
        g_score:   Dict[int, float] = {start_id: 0.0}
        closed:    set              = set()

        while open_set:
            _, current = heapq.heappop(open_set)
            if current in closed:
                continue
            closed.add(current)
            if current == goal_id:
                path = []
                while current in came_from:
                    path.append(current)
                    current = came_from[current]
                path.append(start_id)
                return list(reversed(path))
            for neighbor, cid in self.adj_list.get(current, []):
                if neighbor in closed:
                    continue
                w = self.original_weights.get(cid, float("inf"))
                if w == float("inf"):
                    continue
                tentative_g = g_score.get(current, float("inf")) + w
                if tentative_g < g_score.get(neighbor, float("inf")):
                    came_from[neighbor] = current
                    g_score[neighbor]   = tentative_g
                    f = tentative_g + self.heuristic(neighbor, goal_id)
                    heapq.heappush(open_set, (f, neighbor))
        return None

    def find_blocking_info(
        self,
        start_lat: float, start_lon: float,
        goal_lat: float, goal_lon: float,
        closed_station_ids: set,
        closed_line_ids: set,
    ) -> Optional[dict]:
        """
        Tìm những tuyến/ga đang bị đóng nằm trên đường đi tự nhiên.
        Trả về {"lines": [...], "stations": [...]} hoặc None nếu không có đường gốc.
        """
        start_id = self.find_nearest_station(start_lat, start_lon)
        goal_id  = self.find_nearest_station(goal_lat, goal_lon)
        if start_id is None or goal_id is None:
            return None

        natural_path = self.a_star_original(start_id, goal_id)
        if natural_path is None:
            return None

        blocked_lines:    list = []
        blocked_stations: list = []
        seen_lines:       set  = set()

        for sid in natural_path:
            if sid in closed_station_ids:
                blocked_stations.append(sid)

        for i in range(len(natural_path) - 1):
            cid = self._find_edge_between(natural_path[i], natural_path[i + 1])
            if cid:
                lid = self.edges[cid]["line_id"]
                if lid in closed_line_ids and lid not in seen_lines:
                    seen_lines.add(lid)
                    blocked_lines.append(lid)

        return {"line_ids": blocked_lines, "station_ids": blocked_stations}

    # ── Scenario mutations ───────────────────────────────────────────────────

    def close_line(self, line_id: int):
        for cid, e in self.edges.items():
            if e["line_id"] == line_id:
                self.current_weights[cid] = float("inf")

    def open_line(self, line_id: int):
        for cid, e in self.edges.items():
            if e["line_id"] == line_id:
                self.current_weights[cid] = self.original_weights[cid]

    def close_station(self, station_id: int):
        """Đóng ga: tất cả cạnh kết nối với ga này bị đặt weight = inf."""
        for cid, e in self.edges.items():
            if e["from"] == station_id or e["to"] == station_id:
                self.current_weights[cid] = float("inf")

    def open_station(self, station_id: int):
        """Mở lại ga: khôi phục weight gốc cho các cạnh kết nối với ga."""
        for cid, e in self.edges.items():
            if e["from"] == station_id or e["to"] == station_id:
                self.current_weights[cid] = self.original_weights[cid]

    def reset_weights_in_ram(self):
        self.current_weights = self.original_weights.copy()


# ── Singleton ────────────────────────────────────────────────────────────────

_service: Optional[PathfindingService] = None


def get_pathfinding_service() -> PathfindingService:
    """Return the singleton PathfindingService.
    Auto-reload from DB if the graph is empty (e.g. server started before DB
    was populated).
    """
    global _service
    if _service is None or len(_service.nodes) == 0:
        _service = PathfindingService()
    return _service


def reload_pathfinding_service() -> PathfindingService:
    """Force a full reload from DB (used after rawprocessing re-runs)."""
    global _service
    _service = PathfindingService()
    return _service
