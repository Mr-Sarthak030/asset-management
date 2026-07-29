"""Asset endpoints: CRUD, warranty summary, assignment flow, and item returns.
All mutations are admin-only; reads are admin-only too (employees use /api/employee)."""
from datetime import date, datetime, timedelta

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException

import models
import schemas
from routers.auth import require_admin, write_audit

router = APIRouter(prefix="/api/assets", tags=["assets"])


def warranty_status(expiry: date | None) -> str:
    if expiry is None:
        return "none"
    return "active" if expiry >= date.today() else "expired"


async def asset_out(asset: models.Asset) -> schemas.AssetOut:
    category = await models.Category.get(asset.category_id) if asset.category_id else None
    assigned_to = await models.User.get(asset.assigned_to_id) if asset.assigned_to_id else None
    maintenance_count = await models.MaintenanceLog.find(
        models.MaintenanceLog.asset_id == asset.id
    ).count()
    return schemas.AssetOut(
        id=asset.id,
        asset_tag=asset.asset_tag,
        name=asset.name,
        category_id=asset.category_id,
        category_name=category.name if category else None,
        purchase_date=asset.purchase_date,
        price=asset.price,
        vendor=asset.vendor,
        warranty_expiry=asset.warranty_expiry,
        warranty_status=warranty_status(asset.warranty_expiry),
        status=asset.status,
        assigned_to_id=asset.assigned_to_id,
        assigned_to_name=assigned_to.full_name if assigned_to else None,
        location=asset.location,
        terms_conditions=asset.terms_conditions,
        maintenance_count=maintenance_count,
        custom_values=[
            schemas.CustomValueOut(custom_field_id=v.custom_field_id, value=v.value)
            for v in asset.custom_values
        ],
    )


async def _set_custom_values(asset: models.Asset, values: list[schemas.CustomValueIn]):
    existing = {v.custom_field_id: v for v in asset.custom_values}
    for item in values:
        field = await models.CustomField.get(item.custom_field_id)
        if field is None:
            raise HTTPException(status_code=404, detail=f"Custom field {item.custom_field_id} not found.")
        if item.custom_field_id in existing:
            existing[item.custom_field_id].value = item.value
        else:
            asset.custom_values.append(
                models.CustomValue(custom_field_id=item.custom_field_id, value=item.value)
            )


# ----------------------------------------------------------------------- CRUD
@router.get("", response_model=list[schemas.AssetOut])
async def list_assets(_: models.User = Depends(require_admin)):
    assets = await models.Asset.find_all().sort(-models.Asset.id).to_list()
    return [await asset_out(a) for a in assets]


@router.get("/warranty-summary", response_model=schemas.WarrantySummary)
async def warranty_summary(_: models.User = Depends(require_admin)):
    today = date.today()
    soon = today + timedelta(days=30)
    active = expiring = expired = none = 0
    for a in await models.Asset.find_all().to_list():
        expiry = a.warranty_expiry
        if expiry is None:
            none += 1
        elif expiry < today:
            expired += 1
        elif expiry <= soon:
            expiring += 1
            active += 1
        else:
            active += 1
    return schemas.WarrantySummary(
        active=active, expiring_soon=expiring, expired=expired, no_warranty=none,
    )


@router.get("/{asset_id}", response_model=schemas.AssetOut)
async def get_asset(asset_id: PydanticObjectId, _: models.User = Depends(require_admin)):
    asset = await models.Asset.get(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    return await asset_out(asset)


@router.post("", response_model=schemas.AssetOut, status_code=201)
async def create_asset(
    body: schemas.AssetCreate,
    admin: models.User = Depends(require_admin),
):
    if await models.Asset.find_one(models.Asset.asset_tag == body.asset_tag):
        raise HTTPException(status_code=409, detail="An asset with this tag already exists.")
    category = await models.Category.get(body.category_id)
    if category is None or not category.is_active:
        raise HTTPException(status_code=404, detail="Category not found or disabled.")
    asset = models.Asset(
        asset_tag=body.asset_tag,
        name=body.name,
        category_id=body.category_id,
        purchase_date=body.purchase_date,
        price=body.price,
        vendor=body.vendor,
        warranty_expiry=body.warranty_expiry,
        location=body.location,
        terms_conditions=body.terms_conditions,
    )
    await _set_custom_values(asset, body.custom_values)
    await asset.insert()
    await write_audit(admin, "asset.create", f"Added asset '{body.name}' [{body.asset_tag}]")
    return await asset_out(asset)


@router.put("/{asset_id}", response_model=schemas.AssetOut)
async def update_asset(
    asset_id: PydanticObjectId,
    body: schemas.AssetUpdate,
    admin: models.User = Depends(require_admin),
):
    asset = await models.Asset.get(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    changes = []
    data = body.model_dump(exclude_unset=True)
    custom_values = data.pop("custom_values", None)
    if "category_id" in data:
        category = await models.Category.get(data["category_id"])
        if category is None:
            raise HTTPException(status_code=404, detail="Category not found.")
    for key, value in data.items():
        if getattr(asset, key) != value:
            changes.append(key.replace("_", " "))
            setattr(asset, key, value)
    if custom_values is not None:
        await _set_custom_values(asset, [schemas.CustomValueIn(**v) for v in custom_values])
        changes.append("custom fields")
    if changes:
        await write_audit(
            admin, "asset.update",
            f"Updated {', '.join(changes)} on asset '{asset.name}' [{asset.asset_tag}]",
        )
    await asset.save()
    return await asset_out(asset)


@router.delete("/{asset_id}", status_code=204)
async def retire_asset(
    asset_id: PydanticObjectId,
    admin: models.User = Depends(require_admin),
):
    """Soft delete: mark retired so history (repairs, maintenance) stays intact."""
    asset = await models.Asset.get(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if asset.status == "assigned":
        raise HTTPException(status_code=422, detail="Return this asset before retiring it.")
    asset.status = "retired"
    asset.assigned_to_id = None
    await asset.save()
    await write_audit(admin, "asset.retire", f"Retired asset '{asset.name}' [{asset.asset_tag}]")


# --------------------------------------------------------- assign and return
@router.post("/assign", response_model=schemas.AssignmentOut, status_code=201)
async def assign_asset(
    body: schemas.AssignRequest,
    admin: models.User = Depends(require_admin),
):
    asset = await models.Asset.get(body.asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found.")
    if asset.status != "available":
        raise HTTPException(
            status_code=422,
            detail=f"This asset is currently '{asset.status}' and can't be assigned.",
        )
    employee = await models.User.get(body.employee_id)
    if employee is None or not employee.is_active:
        raise HTTPException(status_code=404, detail="Employee not found or inactive.")
    assignment = models.Assignment(
        asset_id=asset.id, employee_id=employee.id, assigned_by_id=admin.id,
    )
    await assignment.insert()
    asset.status = "assigned"
    asset.assigned_to_id = employee.id
    await asset.save()
    await write_audit(
        admin, "asset.assign",
        f"Assigned '{asset.name}' [{asset.asset_tag}] to {employee.full_name}",
    )
    return await _assignment_out(assignment)


@router.post("/assignments/{assignment_id}/return", response_model=schemas.AssignmentOut)
async def return_asset(
    assignment_id: PydanticObjectId,
    body: schemas.ReturnRequest,
    admin: models.User = Depends(require_admin),
):
    assignment = await models.Assignment.get(assignment_id)
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if assignment.returned_at is not None:
        raise HTTPException(status_code=422, detail="This item was already returned.")
    assignment.returned_at = body.returned_at or datetime.utcnow()
    assignment.return_condition = body.return_condition
    assignment.return_reason = body.return_reason
    await assignment.save()
    asset = await models.Asset.get(assignment.asset_id)
    employee = await models.User.get(assignment.employee_id)
    asset.status = "available"
    asset.assigned_to_id = None
    await asset.save()
    await write_audit(
        admin, "asset.return",
        f"'{asset.name}' [{asset.asset_tag}] returned by {employee.full_name if employee else 'unknown'} "
        f"in {body.return_condition} condition — {body.return_reason}",
    )
    return await _assignment_out(assignment)


@router.get("/assignments/history", response_model=list[schemas.AssignmentOut])
async def assignment_history(_: models.User = Depends(require_admin)):
    rows = await models.Assignment.find_all().sort(-models.Assignment.assigned_at).to_list()
    return [await _assignment_out(a) for a in rows]


async def _assignment_out(a: models.Assignment) -> schemas.AssignmentOut:
    asset = await models.Asset.get(a.asset_id) if a.asset_id else None
    employee = await models.User.get(a.employee_id) if a.employee_id else None
    assigned_by = await models.User.get(a.assigned_by_id) if a.assigned_by_id else None
    return schemas.AssignmentOut(
        id=a.id,
        asset_id=a.asset_id,
        asset_name=asset.name if asset else None,
        asset_tag=asset.asset_tag if asset else None,
        employee_id=a.employee_id,
        employee_name=employee.full_name if employee else None,
        assigned_by_name=assigned_by.full_name if assigned_by else None,
        assigned_at=a.assigned_at,
        returned_at=a.returned_at,
        return_condition=a.return_condition,
        return_reason=a.return_reason,
    )
