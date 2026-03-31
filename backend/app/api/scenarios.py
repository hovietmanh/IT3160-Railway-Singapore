from fastapi import APIRouter, Depends
from pydantic import BaseModel
from backend.app.services.scenario import get_scenario_service
from backend.app.dependencies.access_control import require_admin

router = APIRouter(prefix="/api", tags=["scenarios"])

class BlockRequest(BaseModel):
    station_id:   int
    station_name: str

class PenaltyRequest(BaseModel):
    station_id:   int
    station_name: str
    penalty:      float

@router.post("/scenarios/block")
def block_station(req: BlockRequest, _=Depends(require_admin)):
    service = get_scenario_service()
    scenario = service.add_block_station(req.station_id, req.station_name)
    return scenario

@router.post("/scenarios/penalty")
def add_penalty(req: PenaltyRequest, _=Depends(require_admin)):
    service = get_scenario_service()
    scenario = service.add_penalty(req.station_id, req.station_name, req.penalty)
    return scenario

@router.get("/scenarios")
def get_scenarios(_=Depends(require_admin)):
    service = get_scenario_service()
    return service.active_scenarios

@router.delete("/scenarios/{scenario_id}")
def remove_scenario(scenario_id: int, _=Depends(require_admin)):
    service = get_scenario_service()
    service.remove_scenario(scenario_id)
    return {"message": f"Đã xóa kịch bản {scenario_id}"}

@router.delete("/scenarios")
def clear_all(_=Depends(require_admin)):
    service = get_scenario_service()
    service.clear_all()
    return {"message": "Đã xóa tất cả kịch bản"}