from typing import List, Dict, Optional
from backend.app.services.pathfinding import get_pathfinding_service


class ScenarioService:
    def __init__(self):
        self.active_scenarios: List[Dict] = []
        self._counter = 0

    def add_block_station(self, station_id: int, station_name: str) -> Dict:
        service = get_pathfinding_service()
        service.block_station(station_id)

        self._counter += 1
        scenario = {
            "id":           self._counter,
            "type":         "block",
            "station_id":   station_id,
            "station_name": station_name
        }
        self.active_scenarios.append(scenario)
        print(f"[Scenario {self._counter}] Blocked station: {station_name}")
        return scenario

    def add_penalty(self, station_id: int, station_name: str, penalty: float) -> Dict:
        service = get_pathfinding_service()
        curr = service.graph["current_weights"]

        affected = 0
        for (u, v) in list(curr.keys()):
            if u == station_id or v == station_id:
                service.update_weight_in_ram(u, v, penalty)
                affected += 1

        self._counter += 1
        scenario = {
            "id":           self._counter,
            "type":         "penalty",
            "station_id":   station_id,
            "station_name": station_name,
            "penalty":      penalty,
            "affected":     affected
        }
        self.active_scenarios.append(scenario)
        print(f"[Scenario {self._counter}] Penalty x{penalty} on: {station_name}, {affected} edges affected")
        return scenario

    def remove_scenario(self, scenario_id: int):
        self.active_scenarios = [s for s in self.active_scenarios if s["id"] != scenario_id]
        self._replay_all()

    def clear_all(self):
        service = get_pathfinding_service()
        service.reset_weights_in_ram()
        self.active_scenarios = []
        print("[ScenarioService] All scenarios cleared")

    def _replay_all(self):
        service = get_pathfinding_service()
        service.reset_weights_in_ram()
        for s in self.active_scenarios:
            if s["type"] == "block":
                service.block_station(s["station_id"])
            elif s["type"] == "penalty":
                curr = service.graph["current_weights"]
                for (u, v) in list(curr.keys()):
                    if u == s["station_id"] or v == s["station_id"]:
                        service.update_weight_in_ram(u, v, s["penalty"])


_service: Optional[ScenarioService] = None

def get_scenario_service() -> ScenarioService:
    global _service
    if _service is None:
        _service = ScenarioService()
    return _service