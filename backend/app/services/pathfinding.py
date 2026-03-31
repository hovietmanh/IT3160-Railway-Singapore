import math
import heapq
from typing import Dict, List, Optional
from backend.app.database import get_db_connection


class PathfindingService:
    def __init__(self):
        self.graph = {
            "nodes":            {},
            "adj_list":         {},
            "original_weights": {},
            "current_weights":  {}
        }
        self.load_graph_from_db()

    def load_graph_from_db(self):
        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute("SELECT id, lat, lon FROM stations")
            for row in cursor.fetchall():
                nid = row["id"]
                self.graph["nodes"][nid]    = (row["lat"], row["lon"])
                self.graph["adj_list"][nid] = []

            cursor.execute("SELECT from_id, to_id, weight FROM connections")
            for row in cursor.fetchall():
                u, v, w = row["from_id"], row["to_id"], row["weight"]
                if u in self.graph["nodes"] and v in self.graph["nodes"]:
                    self.graph["adj_list"][u].append(v)
                    self.graph["original_weights"][(u, v)] = w

            self.graph["current_weights"] = self.graph["original_weights"].copy()

        n = len(self.graph["nodes"])
        e = len(self.graph["original_weights"])
        print(f"[PathfindingService] Loaded {n} stations, {e} connections")

    def haversine(self, lat1, lon1, lat2, lon2) -> float:
        R = 6371000
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    def heuristic(self, node_id: int, goal_id: int) -> float:
        if node_id not in self.graph["nodes"] or goal_id not in self.graph["nodes"]:
            return float("inf")
        lat1, lon1 = self.graph["nodes"][node_id]
        lat2, lon2 = self.graph["nodes"][goal_id]
        return self.haversine(lat1, lon1, lat2, lon2)

    def find_nearest_station(self, lat: float, lon: float) -> Optional[int]:
        best_id   = None
        best_dist = float("inf")
        for nid, (nlat, nlon) in self.graph["nodes"].items():
            d = self.haversine(lat, lon, nlat, nlon)
            if d < best_dist:
                best_dist = d
                best_id   = nid
        return best_id

    def a_star(self, start_id: int, goal_id: int) -> Optional[List[int]]:
        adj     = self.graph["adj_list"]
        weights = self.graph["current_weights"]

        open_set  = [(0, start_id)]
        came_from = {}
        g_score   = {start_id: 0}

        while open_set:
            _, current = heapq.heappop(open_set)

            if current == goal_id:
                path = []
                while current in came_from:
                    path.append(current)
                    current = came_from[current]
                path.append(start_id)
                return list(reversed(path))

            for neighbor in adj.get(current, []):
                w = weights.get((current, neighbor), float("inf"))
                if w == float("inf"):
                    continue
                tentative_g = g_score.get(current, float("inf")) + w
                if tentative_g < g_score.get(neighbor, float("inf")):
                    came_from[neighbor] = current
                    g_score[neighbor]   = tentative_g
                    f = tentative_g + self.heuristic(neighbor, goal_id)
                    heapq.heappush(open_set, (f, neighbor))

        return None

    def find_path(self, start_lat: float, start_lon: float,
                        goal_lat:  float, goal_lon:  float):
        start_id = self.find_nearest_station(start_lat, start_lon)
        goal_id  = self.find_nearest_station(goal_lat,  goal_lon)

        if start_id is None or goal_id is None:
            return None
        if start_id == goal_id:
            lat, lon = self.graph["nodes"][start_id]
            return {
                "path":     [{"id": start_id, "lat": lat, "lon": lon}],
                "distance": 0,
                "nodes":    1
            }

        path_ids = self.a_star(start_id, goal_id)
        if path_ids is None:
            return None

        coords = []
        for nid in path_ids:
            lat, lon = self.graph["nodes"][nid]
            coords.append({"id": nid, "lat": lat, "lon": lon})

        total_dist = sum(
            self.haversine(
                coords[i]["lat"], coords[i]["lon"],
                coords[i+1]["lat"], coords[i+1]["lon"]
            )
            for i in range(len(coords) - 1)
        )

        return {
            "path":     coords,
            "distance": round(total_dist),
            "nodes":    len(coords)
        }

    def update_weight_in_ram(self, u: int, v: int, penalty: float):
        curr = self.graph["current_weights"]
        if (u, v) in curr:
            curr[(u, v)] *= penalty

    def reset_weights_in_ram(self):
        self.graph["current_weights"] = self.graph["original_weights"].copy()

    def block_station(self, station_id: int):
        curr = self.graph["current_weights"]
        for (u, v) in list(curr.keys()):
            if u == station_id or v == station_id:
                curr[(u, v)] = float("inf")

    def unblock_station(self, station_id: int):
        orig = self.graph["original_weights"]
        curr = self.graph["current_weights"]
        for (u, v), w in orig.items():
            if u == station_id or v == station_id:
                curr[(u, v)] = w


_service: Optional[PathfindingService] = None

def get_pathfinding_service() -> PathfindingService:
    global _service
    if _service is None:
        _service = PathfindingService()
    return _service