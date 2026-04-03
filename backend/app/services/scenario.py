"""
Chỉ hỗ trợ 1 loại kịch bản: Đóng tuyến (close_line).

Khi đóng tuyến X:
- Tất cả cạnh có line_id = X bị đặt weight = inf
- Các ga trên tuyến X vẫn có thể dùng nếu có tuyến khác chạy qua
"""

from typing import List, Dict, Optional
from backend.app.services.pathfinding import get_pathfinding_service


class ScenarioService:
    def __init__(self):
        self.active_scenarios: List[Dict] = []
        self._counter = 0

    def close_line(self, line_id: int, line_name: str) -> Dict:
        # Kiểm tra xem tuyến đã bị đóng chưa
        for s in self.active_scenarios:
            if s["line_id"] == line_id:
                return s  # Đã đóng rồi, trả về kịch bản hiện có

        service = get_pathfinding_service()
        service.close_line(line_id)

        self._counter += 1
        scenario = {
            "id":        self._counter,
            "type":      "close_line",
            "line_id":   line_id,
            "line_name": line_name
        }
        self.active_scenarios.append(scenario)
        print(f"[Scenario {self._counter}] Close line: {line_name} (line_id={line_id})")
        return scenario

    def remove_scenario(self, scenario_id: int):
        to_remove = next((s for s in self.active_scenarios if s["id"] == scenario_id), None)
        if to_remove is None:
            return
        self.active_scenarios = [s for s in self.active_scenarios if s["id"] != scenario_id]
        self._replay_all()
        print(f"[ScenarioService] Removed scenario {scenario_id} ({to_remove['line_name']})")

    def clear_all(self):
        service = get_pathfinding_service()
        service.reset_weights_in_ram()
        self.active_scenarios = []
        print("[ScenarioService] All scenarios cleared")

    def _replay_all(self):
        service = get_pathfinding_service()
        service.reset_weights_in_ram()
        for s in self.active_scenarios:
            if s["type"] == "close_line":
                service.close_line(s["line_id"])


_service: Optional[ScenarioService] = None


def get_scenario_service() -> ScenarioService:
    global _service
    if _service is None:
        _service = ScenarioService()
    return _service
