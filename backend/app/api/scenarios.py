from fastapi import APIRouter, Depends, HTTPException
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

class MaintenanceRequest(BaseModel):
    from_id:   int
    from_name: str
    to_id:     int
    to_name:   str

@router.post("/scenarios/block")
def block_station(req: BlockRequest, _=Depends(require_admin)):
    service = get_scenario_service()
    return service.add_block_station(req.station_id, req.station_name)

@router.post("/scenarios/penalty")
def add_penalty(req: PenaltyRequest, _=Depends(require_admin)):
    service = get_scenario_service()
    return service.add_penalty(req.station_id, req.station_name, req.penalty)

@router.post("/scenarios/maintenance")
def add_maintenance(req: MaintenanceRequest, _=Depends(require_admin)):
    service = get_scenario_service()
    scenario = service.add_maintenance(
        req.from_id, req.from_name,
        req.to_id,   req.to_name
    )
    if scenario is None:
        raise HTTPException(
            status_code=400,
            detail=f"Không có đường ray trực tiếp giữa {req.from_name} và {req.to_name}!"
        )
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