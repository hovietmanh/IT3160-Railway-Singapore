from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.app.services.scenario import get_scenario_service
from backend.app.services.pathfinding import get_pathfinding_service
from backend.app.dependencies.access_control import require_admin

router = APIRouter(prefix="/api", tags=["scenarios"])


class CloseLineRequest(BaseModel):
    line_id:   int
    line_name: str


class CloseStationRequest(BaseModel):
    station_id:   int
    station_name: str


# ── Close line ────────────────────────────────────────────────────────────────

@router.post("/scenarios/close_line")
def close_line(req: CloseLineRequest, _=Depends(require_admin)):
    svc = get_pathfinding_service()
    if req.line_id not in svc.lines:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tuyến id={req.line_id}")
    return get_scenario_service().close_line(req.line_id, req.line_name)


# ── Close station ─────────────────────────────────────────────────────────────

@router.post("/scenarios/close_station")
def close_station(req: CloseStationRequest, _=Depends(require_admin)):
    svc = get_pathfinding_service()
    if req.station_id not in svc.nodes:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy ga id={req.station_id}")
    return get_scenario_service().close_station(req.station_id, req.station_name)


# ── Scenarios CRUD ────────────────────────────────────────────────────────────

@router.get("/scenarios")
def get_scenarios():
    """Public – user page cũng đọc được để polling phát hiện thay đổi."""
    return get_scenario_service().active_scenarios


@router.delete("/scenarios/lines")
def clear_lines(_=Depends(require_admin)):
    get_scenario_service().clear_lines()
    return {"message": "Đã mở lại tất cả tuyến"}


@router.delete("/scenarios/stations")
def clear_stations(_=Depends(require_admin)):
    get_scenario_service().clear_stations()
    return {"message": "Đã mở lại tất cả ga"}


@router.delete("/scenarios/{scenario_id}")
def remove_scenario(scenario_id: int, _=Depends(require_admin)):
    get_scenario_service().remove_scenario(scenario_id)
    return {"message": f"Đã mở lại (kịch bản {scenario_id})"}


@router.delete("/scenarios")
def clear_all(_=Depends(require_admin)):
    get_scenario_service().clear_all()
    return {"message": "Đã mở lại tất cả"}
