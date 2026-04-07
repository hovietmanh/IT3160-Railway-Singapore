"""
Hỗ trợ 2 loại kịch bản:
  - close_line    : đóng toàn bộ tuyến (tất cả cạnh thuộc tuyến → weight = inf)
  - close_station : đóng một ga     (tất cả cạnh nối với ga đó → weight = inf)
"""

from typing import List, Dict, Optional
from backend.app.services.pathfinding import get_pathfinding_service


class ScenarioService:
    def __init__(self):
        self.active_scenarios: List[Dict] = []
        self._counter = 0

    # ── Close line ────────────────────────────────────────────────────────────

    def close_line(self, line_id: int, line_name: str) -> Dict:
        for s in self.active_scenarios:
            if s["type"] == "close_line" and s["line_id"] == line_id:
                return s

        get_pathfinding_service().close_line(line_id)
        self._counter += 1
        scenario = {
            "id":        self._counter,
            "type":      "close_line",
            "line_id":   line_id,
            "line_name": line_name,
        }
        self.active_scenarios.append(scenario)
        print(f"[Scenario {self._counter}] Close line: {line_name} (id={line_id})")
        return scenario

    # ── Close station ─────────────────────────────────────────────────────────

    def close_station(self, station_id: int, station_name: str) -> Dict:
        for s in self.active_scenarios:
            if s["type"] == "close_station" and s["station_id"] == station_id:
                return s

        get_pathfinding_service().close_station(station_id)
        self._counter += 1
        scenario = {
            "id":           self._counter,
            "type":         "close_station",
            "station_id":   station_id,
            "station_name": station_name,
        }
        self.active_scenarios.append(scenario)
        print(f"[Scenario {self._counter}] Close station: {station_name} (id={station_id})")
        return scenario

    # ── Remove / clear ────────────────────────────────────────────────────────

    def remove_scenario(self, scenario_id: int):
        target = next((s for s in self.active_scenarios if s["id"] == scenario_id), None)
        if target is None:
            return
        self.active_scenarios = [s for s in self.active_scenarios if s["id"] != scenario_id]
        self._replay_all()
        print(f"[ScenarioService] Removed scenario {scenario_id}")

    def clear_all(self):
        get_pathfinding_service().reset_weights_in_ram()
        self.active_scenarios = []
        print("[ScenarioService] All scenarios cleared")

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _replay_all(self):
        svc = get_pathfinding_service()
        svc.reset_weights_in_ram()
        for s in self.active_scenarios:
            if s["type"] == "close_line":
                svc.close_line(s["line_id"])
            elif s["type"] == "close_station":
                svc.close_station(s["station_id"])

    def closed_station_ids(self) -> set:
        return {s["station_id"] for s in self.active_scenarios
                if s["type"] == "close_station"}


_service: Optional[ScenarioService] = None


def get_scenario_service() -> ScenarioService:
    global _service
    if _service is None:
        _service = ScenarioService()
    return _service
