import math
import heapq
from typing import Dict, List, Tuple, Optional
from contextlib import contextmanager
from backend.app.database import get_db_connection
from backend.app.config import settings


class PathfindingService:
    def __init__(self):
        self.vehicle_types = ["car", "foot"]
        self.graphs = {
            v: {
                "nodes": {},
                "adj_list": {},
                "original_weights": {},
                "current_weights": {}
            }
            for v in self.vehicle_types
        }
        self.load_graph_from_db()

    # =============================================
    # TASK 1: Load đồ thị từ DB lên RAM
    # =============================================
    def load_graph_from_db(self):
        with get_db_connection() as conn:
            cursor = conn.cursor()
            for v_type in self.vehicle_types:
                table_nodes = f"nodes_{v_type}"
                table_edges = f"edges_{v_type}"
                graph = self.graphs[v_type]

                cursor.execute(f"SELECT id, x, y FROM {table_nodes}")
                for node in cursor.fetchall():
                    nid = node["id"]
                    graph["nodes"][nid] = (node["x"], settings.MAP_HEIGHT - node["y"])
                    graph["adj_list"][nid] = []

                cursor.execute(f"SELECT node_from, node_to, weight FROM {table_edges}")
                for edge in cursor.fetchall():
                    u, v, w = edge["node_from"], edge["node_to"], edge["weight"]
                    if u in graph["nodes"] and v in graph["nodes"]:
                        graph["adj_list"][u].append(v)
                        graph["original_weights"][(u, v)] = w

                graph["current_weights"] = graph["original_weights"].copy()

        for v_type in self.vehicle_types:
            g = self.graphs[v_type]
            print(f"[{v_type}] Loaded {len(g['nodes'])} nodes, {len(g['original_weights'])} edges")

    # =============================================
    # TASK 2: Tìm hình chiếu lên cạnh gần nhất
    # =============================================
    def find_nearest_edge_projection(self, x: float, y: float, vehicle_type: str, top_k: int = 5):
        graph = self.graphs[vehicle_type]
        nodes = graph["nodes"]
        weights = graph["current_weights"]

        best = []
        for (u, v) in weights:
            if u not in nodes or v not in nodes:
                continue
            x1, y1 = nodes[u]
            x2, y2 = nodes[v]
            dx, dy = x2 - x1, y2 - y1
            len_sq = dx * dx + dy * dy
            if len_sq == 0:
                continue
            t = max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / len_sq))
            proj_x = x1 + t * dx
            proj_y = y1 + t * dy
            dist = math.sqrt((x - proj_x) ** 2 + (y - proj_y) ** 2)
            heapq.heappush(best, (dist, t, u, v, proj_x, proj_y))

        return heapq.nsmallest(top_k, best)

    # =============================================
    # TASK 3: Chia cạnh tại điểm hình chiếu
    # =============================================
    def split_edge(self, u: int, v: int, point: Tuple[float, float], vehicle_type: str) -> dict:
        graph = self.graphs[vehicle_type]
        nodes = graph["nodes"]
        adj = graph["adj_list"]
        orig = graph["original_weights"]
        curr = graph["current_weights"]

        px, py = point
        temp_id = -(len(nodes) + 1000 + id(point) % 10000)

        nodes[temp_id] = (px, py)
        adj[temp_id] = []

        x1, y1 = nodes[u]
        x2, y2 = nodes[v]
        w_u_temp = math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
        w_temp_v = math.sqrt((x2 - px) ** 2 + (y2 - py) ** 2)

        if v in adj.get(u, []):
            adj[u].remove(v)
        adj[u].append(temp_id)
        adj[temp_id].append(v)

        orig[(u, temp_id)] = w_u_temp
        orig[(temp_id, v)] = w_temp_v
        curr[(u, temp_id)] = w_u_temp
        curr[(temp_id, v)] = w_temp_v

        orig.pop((u, v), None)
        curr.pop((u, v), None)

        return {"temp_id": temp_id, "u": u, "v": v, "vehicle_type": vehicle_type}

    # =============================================
    # TASK 4: Hoàn tác thay đổi cấu trúc đồ thị
    # =============================================
    def restore_graph_changes(self, changes: list):
        for change in reversed(changes):
            v_type = change["vehicle_type"]
            graph = self.graphs[v_type]
            nodes = graph["nodes"]
            adj = graph["adj_list"]
            orig = graph["original_weights"]
            curr = graph["current_weights"]
            temp_id = change["temp_id"]
            u, v = change["u"], change["v"]

            orig.pop((u, temp_id), None)
            orig.pop((temp_id, v), None)
            curr.pop((u, temp_id), None)
            curr.pop((temp_id, v), None)

            if temp_id in adj.get(u, []):
                adj[u].remove(temp_id)
            if u not in adj.get(u, []):
                adj[u].append(v)

            adj.pop(temp_id, None)
            nodes.pop(temp_id, None)

            w_orig = math.sqrt(
                (nodes[u][0] - nodes[v][0]) ** 2 +
                (nodes[u][1] - nodes[v][1]) ** 2
            )
            orig[(u, v)] = w_orig
            curr[(u, v)] = w_orig

    # =============================================
    # TASK 5: Hàm heuristic (khoảng cách Euclid)
    # =============================================
    def heuristic(self, node_id: int, goal_id: int, nodes_map: Dict) -> float:
        if node_id not in nodes_map or goal_id not in nodes_map:
            return float("inf")
        x1, y1 = nodes_map[node_id]
        x2, y2 = nodes_map[goal_id]
        return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)

    # =============================================
    # TASK 6: Thuật toán A*
    # =============================================
    def a_star(self, start_id: int, goal_id: int, vehicle_type: str) -> Optional[List[int]]:
        graph = self.graphs[vehicle_type]
        nodes = graph["nodes"]
        adj = graph["adj_list"]
        weights = graph["current_weights"]

        open_set = [(0, start_id)]
        came_from = {}
        g_score = {start_id: 0}

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
                tentative_g = g_score.get(current, float("inf")) + w
                if tentative_g < g_score.get(neighbor, float("inf")):
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f = tentative_g + self.heuristic(neighbor, goal_id, nodes)
                    heapq.heappush(open_set, (f, neighbor))

        return None

    # =============================================
    # TASK 7: Cập nhật / reset trọng số
    # =============================================
    def update_weight_in_ram(self, u: int, v: int, penalty: float, vehicle_type: str):
        curr = self.graphs[vehicle_type]["current_weights"]
        if (u, v) in curr:
            curr[(u, v)] *= penalty

    def reset_weights_in_ram(self, vehicle_type: str):
        graph = self.graphs[vehicle_type]
        graph["current_weights"] = graph["original_weights"].copy()

    # =============================================
    # TASK 8: find_path() — tích hợp tất cả
    # =============================================
    def find_path(self, sx: float, sy: float, gx: float, gy: float, vehicle_type: str):
        graph = self.graphs[vehicle_type]
        nodes = graph["nodes"]
        changes = []

        projections_start = self.find_nearest_edge_projection(sx, sy, vehicle_type)
        projections_goal  = self.find_nearest_edge_projection(gx, gy, vehicle_type)

        if not projections_start or not projections_goal:
            return None

        _, ts, us, vs, px_s, py_s = projections_start[0]
        _, tg, ug, vg, px_g, py_g = projections_goal[0]

        start_id = -1
        nodes[start_id] = (sx, sy)
        graph["adj_list"][start_id] = []
        change_s = self.split_edge(us, vs, (px_s, py_s), vehicle_type)
        changes.append(change_s)
        temp_s = change_s["temp_id"]
        graph["current_weights"][(start_id, temp_s)] = math.sqrt((sx - px_s)**2 + (sy - py_s)**2)
        graph["adj_list"][start_id].append(temp_s)

        goal_id = -2
        nodes[goal_id] = (gx, gy)
        graph["adj_list"][goal_id] = []
        change_g = self.split_edge(ug, vg, (px_g, py_g), vehicle_type)
        changes.append(change_g)
        temp_g = change_g["temp_id"]
        graph["current_weights"][(temp_g, goal_id)] = math.sqrt((gx - px_g)**2 + (gy - py_g)**2)
        graph["adj_list"][temp_g].append(goal_id)

        path = self.a_star(start_id, goal_id, vehicle_type)

        self.restore_graph_changes(changes)
        nodes.pop(-1, None)
        nodes.pop(-2, None)
        graph["adj_list"].pop(-1, None)
        graph["adj_list"].pop(-2, None)

        if path is None:
            return None

        coords = []
        for nid in path:
            if nid in nodes:
                x, y = nodes[nid]
                coords.append({"x": x, "y": settings.MAP_HEIGHT - y})

        total_dist = sum(
            math.sqrt((coords[i+1]["x"] - coords[i]["x"])**2 +
                      (coords[i+1]["y"] - coords[i]["y"])**2)
            for i in range(len(coords) - 1)
        )

        return {"path": coords, "distance": round(total_dist, 2), "nodes": len(coords)}


_service: Optional[PathfindingService] = None

def get_pathfinding_service() -> PathfindingService:
    global _service
    if _service is None:
        _service = PathfindingService()
    return _service