import math
from typing import Dict, List, Tuple, Optional
from backend.app.services.pathfinding import get_pathfinding_service


class ScenarioService:
    def __init__(self):
        self.active_scenarios: List[Dict] = []
        self._scenario_counter = 0

    # =============================================
    # TASK 1: Kiểm tra 2 đoạn thẳng có cắt nhau
    # =============================================
    def _cross(self, o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def _segments_intersect(self, p1, p2, p3, p4):
        d1 = self._cross(p3, p4, p1)
        d2 = self._cross(p3, p4, p2)
        d3 = self._cross(p1, p2, p3)
        d4 = self._cross(p1, p2, p4)
        if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
           ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
            return True
        return False

    # =============================================
    # TASK 2: Tính các cạnh bị ảnh hưởng
    # =============================================
    def calculate_affected_edges(
        self,
        pathfinding_service,
        line_p1: Tuple[float, float],
        line_p2: Tuple[float, float],
        threshold: float
    ):
        affected = {"car": [], "foot": []}
        structural_changes = []

        line_vec_x = line_p2[0] - line_p1[0]
        line_vec_y = line_p2[1] - line_p1[1]
        len_sq = line_vec_x ** 2 + line_vec_y ** 2

        for v_type in ["car", "foot"]:
            graph = pathfinding_service.graphs[v_type]
            nodes = graph["nodes"]
            edges_dict = graph["original_weights"]
            edges_list = list(edges_dict.keys())

            for (u, v) in edges_list:
                if (u, v) not in edges_dict:
                    continue
                if u not in nodes or v not in nodes:
                    continue

                p1 = nodes[u]
                p2 = nodes[v]

                if len_sq == 0:
                    # --- TRƯỜNG HỢP MƯA (hình tròn) ---
                    cx, cy = line_p1
                    radius = threshold

                    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
                    if dx == 0 and dy == 0:
                        continue

                    t = ((cx - p1[0]) * dx + (cy - p1[1]) * dy) / (dx*dx + dy*dy)
                    closest_t = max(0, min(1, t))
                    closest_x = p1[0] + closest_t * dx
                    closest_y = p1[1] + closest_t * dy
                    dist_sq = (cx - closest_x)**2 + (cy - closest_y)**2

                    if dist_sq > radius**2:
                        continue

                    d1_sq = (cx - p1[0])**2 + (cy - p1[1])**2
                    d2_sq = (cx - p2[0])**2 + (cy - p2[1])**2
                    inside1 = d1_sq <= radius**2
                    inside2 = d2_sq <= radius**2

                    if inside1 and inside2:
                        affected[v_type].append((u, v))
                    else:
                        fx, fy = p1[0] - cx, p1[1] - cy
                        a = dx*dx + dy*dy
                        b = 2 * (fx*dx + fy*dy)
                        c = (fx*fx + fy*fy) - radius*radius
                        delta = b*b - 4*a*c

                        if delta >= 0:
                            ts = []
                            t1 = (-b - math.sqrt(delta)) / (2*a)
                            t2 = (-b + math.sqrt(delta)) / (2*a)
                            if 0 < t1 < 1: ts.append(t1)
                            if 0 < t2 < 1: ts.append(t2)
                            ts.sort()

                            current_u = u
                            for t_val in ts:
                                ix = p1[0] + t_val * dx
                                iy = p1[1] + t_val * dy
                                change = pathfinding_service.split_edge(
                                    current_u, v, (ix, iy), v_type
                                )
                                structural_changes.append(change)
                                temp_id = change["temp_id"]

                                m1 = pathfinding_service.graphs[v_type]["nodes"][current_u]
                                m2 = pathfinding_service.graphs[v_type]["nodes"][temp_id]
                                mid_x = (m1[0]+m2[0])/2
                                mid_y = (m1[1]+m2[1])/2
                                if (mid_x-cx)**2 + (mid_y-cy)**2 <= radius**2:
                                    affected[v_type].append((current_u, temp_id))
                                    if (temp_id, current_u) in pathfinding_service.graphs[v_type]["current_weights"]:
                                        affected[v_type].append((temp_id, current_u))

                                current_u = temp_id

                            m1 = pathfinding_service.graphs[v_type]["nodes"][current_u]
                            m2 = pathfinding_service.graphs[v_type]["nodes"][v]
                            mid_x = (m1[0]+m2[0])/2
                            mid_y = (m1[1]+m2[1])/2
                            if (mid_x-cx)**2 + (mid_y-cy)**2 <= radius**2:
                                affected[v_type].append((current_u, v))
                                if (v, current_u) in pathfinding_service.graphs[v_type]["current_weights"]:
                                    affected[v_type].append((v, current_u))
                else:
                    # --- TRƯỜNG HỢP CHẶN ĐƯỜNG (đoạn thẳng) ---
                    if self._segments_intersect(p1, p2, line_p1, line_p2):
                        affected[v_type].append((u, v))

        return affected, structural_changes

    # =============================================
    # TASK 3: Thêm kịch bản mới
    # =============================================
    def add_scenario(
        self,
        scenario_type: str,
        penalty: float,
        line_p1: Tuple[float, float],
        line_p2: Tuple[float, float],
        threshold: float = 0
    ) -> Dict:
        pathfinding_service = get_pathfinding_service()
        affected, structural_changes = self.calculate_affected_edges(
            pathfinding_service, line_p1, line_p2, threshold
        )

        for v_type in ["car", "foot"]:
            for (u, v) in affected[v_type]:
                pathfinding_service.update_weight_in_ram(u, v, penalty, v_type)

        self._scenario_counter += 1
        scenario = {
            "id": self._scenario_counter,
            "type": scenario_type,
            "penalty": penalty,
            "line_p1": line_p1,
            "line_p2": line_p2,
            "threshold": threshold,
            "affected_edges": affected,
            "structural_changes": structural_changes
        }
        self.active_scenarios.append(scenario)

        total = sum(len(v) for v in affected.values())
        print(f"[Scenario {self._scenario_counter}] type={scenario_type}, affected={total} edges")
        return scenario

    # =============================================
    # TASK 4: Xóa một kịch bản
    # =============================================
    def remove_scenario(self, scenario_id: int):
        self.active_scenarios = [
            s for s in self.active_scenarios if s["id"] != scenario_id
        ]

    # =============================================
    # TASK 5: Xóa tất cả kịch bản + reset đồ thị
    # =============================================
    def clear_all(self):
        pathfinding_service = get_pathfinding_service()
        for v_type in ["car", "foot"]:
            pathfinding_service.reset_weights_in_ram(v_type)
        self.active_scenarios = []
        print("All scenarios cleared, graph reset to original weights")


_service: Optional[ScenarioService] = None

def get_scenario_service() -> ScenarioService:
    global _service
    if _service is None:
        _service = ScenarioService()
    return _service