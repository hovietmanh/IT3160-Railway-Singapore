from pydantic import BaseModel
from typing import Tuple

class ScenarioRequest(BaseModel):
    type: str
    penalty: float
    line_p1: Tuple[float, float]
    line_p2: Tuple[float, float]
    threshold: float = 0

class ScenarioResponse(BaseModel):
    id: int
    type: str
    penalty: float
    affected_edges_count: int