from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from backend.app.services.scenario import get_scenario_service
from backend.app.services.pathfinding import get_pathfinding_service
from backend.app.dependencies.access_control import require_admin

router = APIRouter(prefix="/api", tags=["scenarios"])


class CloseLineRequest(BaseModel):
    line_id:   int
    line_name: str


@router.post("/scenarios/close_line")
def close_line(req: CloseLineRequest, _=Depends(require_admin)):
    """Đóng một tuyến tàu - tất cả cạnh trên tuyến sẽ không dùng được."""
    service = get_pathfinding_service()
    if req.line_id not in service.lines:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy tuyến id={req.line_id}")
    scenario_service = get_scenario_service()
    return scenario_service.close_line(req.line_id, req.line_name)


@router.get("/scenarios")
def get_scenarios(_=Depends(require_admin)):
    """Lấy danh sách kịch bản đang hoạt động."""
    service = get_scenario_service()
    return service.active_scenarios


@router.delete("/scenarios/{scenario_id}")
def remove_scenario(scenario_id: int, _=Depends(require_admin)):
    """Xóa (mở lại) một kịch bản đóng tuyến."""
    service = get_scenario_service()
    service.remove_scenario(scenario_id)
    return {"message": f"Đã mở lại tuyến (kịch bản {scenario_id})"}


@router.delete("/scenarios")
def clear_all(_=Depends(require_admin)):
    """Xóa tất cả kịch bản - mở lại tất cả tuyến."""
    service = get_scenario_service()
    service.clear_all()
    return {"message": "Đã mở lại tất cả tuyến"}
