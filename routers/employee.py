"""Employee self-service portal endpoints (my assets, repair requests with photo
upload, progress tracking, maintenance history) plus the admin-side repair
lifecycle endpoints (acknowledge, mark in-repair, resolve)."""
import secrets
from datetime import datetime
from pathlib import Path

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

import models
import schemas
from routers.auth import get_current_user, require_admin, write_audit

router = APIRouter(prefix="/api/employee", tags=["employee"])
repairs_router = APIRouter(prefix="/api/repairs", tags=["repairs"])

UPLOAD_DIR = Path("uploads")
ALLOWED_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB


async def _repair_out(r: models.RepairRequest) -> schemas.RepairRequestOut:
    asset = await models.Asset.get(r.asset_id) if r.asset_id else None
    employee = await models.User.get(r.employee_id) if r.employee_id else None
    category = await models.Category.get(asset.category_id) if asset and asset.category_id else None
    return schemas.RepairRequestOut(
        id=r.id,
        asset_id=r.asset_id,
        asset_name=asset.name if asset else None,
        asset_tag=asset.asset_tag if asset else None,
        employee_id=r.employee_id,
        employee_name=employee.full_name if employee else None,
        employee_department=employee.department if employee else None,
        description=r.description,
        urgency=r.urgency,
        photo_path=r.photo_path,
        status=r.status,
        status_step=models.RepairRequest.STATUS_FLOW.index(r.status),
        req_type=r.req_type,
        category_name=category.name if category else None,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


async def _maintenance_out(m: models.MaintenanceLog) -> schemas.MaintenanceLogOut:
    asset = await models.Asset.get(m.asset_id) if m.asset_id else None
    resolved_by = await models.User.get(m.resolved_by_id) if m.resolved_by_id else None
    return schemas.MaintenanceLogOut(
        id=m.id,
        asset_id=m.asset_id,
        asset_name=asset.name if asset else None,
        asset_tag=asset.asset_tag if asset else None,
        repair_request_id=m.repair_request_id,
        resolved_by_name=resolved_by.full_name if resolved_by else None,
        action_taken=m.action_taken,
        cost=m.cost,
        next_service_due=m.next_service_due,
        created_at=m.created_at,
    )


# --------------------------------------------------------------- my dashboard
@router.get("/my-assets", response_model=list[schemas.AssetOut])
async def my_assets(user: models.User = Depends(get_current_user)):
    from routers.assets import asset_out  # local import avoids a circular import

    assets = (
        await models.Asset.find(models.Asset.assigned_to_id == user.id)
        .sort(+models.Asset.name)
        .to_list()
    )
    return [await asset_out(a) for a in assets]


# ------------------------------------------------------------ repair requests
@router.post("/repair-requests", response_model=schemas.RepairRequestOut, status_code=201)
async def create_repair_request(
    asset_id: PydanticObjectId = Form(...),
    description: str = Form(..., min_length=1),
    urgency: str = Form(..., pattern="^(low|medium|high)$"),
    photo: UploadFile | None = File(None),
    user: models.User = Depends(get_current_user),
):
    asset = await models.Asset.get(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if asset.assigned_to_id != user.id:
        raise HTTPException(
            status_code=403, detail="You can only report issues on assets assigned to you."
        )
    open_request = await models.RepairRequest.find_one(
        models.RepairRequest.asset_id == asset_id,
        models.RepairRequest.status != "resolved",
    )
    if open_request:
        raise HTTPException(
            status_code=422, detail="There's already an open repair request for this asset."
        )

    photo_path = None
    if photo is not None and photo.filename:
        if photo.content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(
                status_code=422, detail="Photo must be a JPEG, PNG, or WebP image."
            )
        contents = await photo.read()
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=422, detail="Photo must be under 8 MB.")
        UPLOAD_DIR.mkdir(exist_ok=True)
        ext = ALLOWED_IMAGE_TYPES[photo.content_type]
        filename = f"repair_{secrets.token_hex(8)}{ext}"  # server-generated name, no user input
        (UPLOAD_DIR / filename).write_bytes(contents)
        photo_path = f"/uploads/{filename}"

    request = models.RepairRequest(
        asset_id=asset_id,
        employee_id=user.id,
        description=description,
        urgency=urgency,
        photo_path=photo_path,
    )
    await request.insert()
    asset.status = "in_repair"
    await asset.save()
    return await _repair_out(request)


@router.get("/repair-requests", response_model=list[schemas.RepairRequestOut])
async def my_repair_requests(user: models.User = Depends(get_current_user)):
    rows = (
        await models.RepairRequest.find(models.RepairRequest.employee_id == user.id)
        .sort(-models.RepairRequest.created_at)
        .to_list()
    )
    return [await _repair_out(r) for r in rows]


@router.get("/maintenance-logs", response_model=list[schemas.MaintenanceLogOut])
async def my_maintenance_logs(user: models.User = Depends(get_current_user)):
    """Maintenance history for repairs this employee raised."""
    my_repair_ids = {
        r.id for r in await models.RepairRequest.find(
            models.RepairRequest.employee_id == user.id
        ).to_list()
    }
    rows = await models.MaintenanceLog.find_all().sort(-models.MaintenanceLog.created_at).to_list()
    rows = [m for m in rows if m.repair_request_id in my_repair_ids]
    return [await _maintenance_out(m) for m in rows]


# ------------------------------------------- admin repair lifecycle management
@repairs_router.get("", response_model=list[schemas.RepairRequestOut])
async def list_all_repairs(_: models.User = Depends(require_admin)):
    rows = await models.RepairRequest.find_all().sort(-models.RepairRequest.created_at).to_list()
    return [await _repair_out(r) for r in rows]


@repairs_router.patch("/{request_id}/status", response_model=schemas.RepairRequestOut)
async def update_repair_status(
    request_id: PydanticObjectId,
    body: schemas.RepairStatusUpdate,
    admin: models.User = Depends(require_admin),
):
    request = await models.RepairRequest.get(request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Repair request not found.")
    if request.status == "resolved":
        raise HTTPException(status_code=422, detail="This request is already resolved.")
    flow = models.RepairRequest.STATUS_FLOW
    if flow.index(body.status) <= flow.index(request.status):
        raise HTTPException(status_code=422, detail="Repair status can only move forward.")
    request.status = body.status
    request.updated_at = datetime.utcnow()
    await request.save()
    asset = await models.Asset.get(request.asset_id)
    await write_audit(
        admin, "repair.status",
        f"Marked repair #{request.id} on '{asset.name if asset else '?'}' as {body.status.replace('_', ' ')}",
    )
    return await _repair_out(request)


@repairs_router.post("/{request_id}/resolve", response_model=schemas.MaintenanceLogOut)
async def resolve_repair(
    request_id: PydanticObjectId,
    body: schemas.RepairResolve,
    admin: models.User = Depends(require_admin),
):
    request = await models.RepairRequest.get(request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Repair request not found.")
    if request.status == "resolved":
        raise HTTPException(status_code=422, detail="This request is already resolved.")
    request.status = "resolved"
    request.updated_at = datetime.utcnow()
    await request.save()
    log = models.MaintenanceLog(
        asset_id=request.asset_id,
        repair_request_id=request.id,
        resolved_by_id=admin.id,
        action_taken=body.action_taken,
        cost=body.cost,
        next_service_due=body.next_service_due,
    )
    await log.insert()
    asset = await models.Asset.get(request.asset_id)
    # The asset goes back to the employee it was assigned to, or to the shelf.
    asset.status = "assigned" if asset.assigned_to_id else "available"
    await asset.save()
    await write_audit(
        admin, "repair.resolve",
        f"Resolved repair #{request.id} on '{asset.name}' [{asset.asset_tag}]: {body.action_taken}",
    )
    return await _maintenance_out(log)


@repairs_router.get("/maintenance-logs", response_model=list[schemas.MaintenanceLogOut])
async def all_maintenance_logs(_: models.User = Depends(require_admin)):
    rows = await models.MaintenanceLog.find_all().sort(-models.MaintenanceLog.created_at).to_list()
    return [await _maintenance_out(m) for m in rows]
