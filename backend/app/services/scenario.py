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
            "id": self._counter, "type": "block",
            "station_id": station_id, "station_name": station_name
        }
        self.active_scenarios.append(scenario)
        print(f"[Scenario {self._counter}] Blocked: {station_name}")
        return scenario

    def add_penalty(self, station_id: int, station_name: str, penalty: float) -> Dict:
        service = get_pathfinding_service()
        edges   = service.graph["edges"]
        affected = 0
        for cid, e in edges.items():
            if e["from"] == station_id or e["to"] == station_id:
                service.update_weight_in_ram(cid, penalty)
                affected += 1
        self._counter += 1
        scenario = {
            "id": self._counter, "type": "penalty",
            "station_id": station_id, "station_name": station_name,
            "penalty": penalty, "affected": affected
        }
        self.active_scenarios.append(scenario)
        print(f"[Scenario {self._counter}] Penalty x{penalty} on {station_name}, {affected} edges")
        return scenario

    def add_maintenance(self, from_id: int, from_name: str,
                              to_id: int,   to_name: str) -> Optional[Dict]:
        service = get_pathfinding_service()
        edges   = service.graph["edges"]
        curr    = service.graph["current_weights"]

        blocked_ids = []
        for cid, e in edges.items():
            if (e["from"] == from_id and e["to"] == to_id) or \
               (e["from"] == to_id   and e["to"] == from_id):
                curr[cid] = float("inf")
                blocked_ids.append(cid)

        if not blocked_ids:
            return None

        self._counter += 1
        scenario = {
            "id": self._counter, "type": "maintenance",
            "from_id": from_id, "from_name": from_name,
            "to_id": to_id, "to_name": to_name,
            "blocked_ids": blocked_ids
        }
        self.active_scenarios.append(scenario)
        print(f"[Scenario {self._counter}] Maintenance: {from_name}↔{to_name}, {len(blocked_ids)} blocked")
        return scenario

    def remove_scenario(self, scenario_id: int):
        self.active_scenarios = [s for s in self.active_scenarios if s["id"] != scenario_id]
        self._replay_all()

    def clear_all(self):
        service = get_pathfinding_service()
        service.reset_weights_in_ram()
        self.active_scenarios = []
        print("[ScenarioService] All cleared")

    def _replay_all(self):
        service = get_pathfinding_service()
        service.reset_weights_in_ram()
        for s in self.active_scenarios:
            if s["type"] == "block":
                service.block_station(s["station_id"])
            elif s["type"] == "penalty":
                edges = service.graph["edges"]
                for cid, e in edges.items():
                    if e["from"] == s["station_id"] or e["to"] == s["station_id"]:
                        service.update_weight_in_ram(cid, s["penalty"])
            elif s["type"] == "maintenance":
                for cid in s["blocked_ids"]:
                    service.block_connection(cid)


_service: Optional[ScenarioService] = None

def get_scenario_service() -> ScenarioService:
    global _service
    if _service is None:
        _service = ScenarioService()
    return _service