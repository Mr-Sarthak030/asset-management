"""Admin-only endpoints: no-code customization (custom fields, categories,
dropdown options, theme), user management, and the read-only audit log."""
from beanie import PydanticObjectId
from beanie.operators import In
from fastapi import APIRouter, Depends, HTTPException

import models
import schemas
from routers.auth import get_current_user, hash_password, require_admin, write_audit

router = APIRouter(prefix="/api/admin", tags=["admin"])
public_router = APIRouter(prefix="/api/settings", tags=["settings"])


@public_router.get("/theme", response_model=schemas.SettingsOut)
async def read_theme(_: models.User = Depends(get_current_user)):
    """Any signed-in user reads the admin-chosen theme so the UI can apply it."""
    theme = await models.AppSetting.find_one(models.AppSetting.key == "theme")
    return schemas.SettingsOut(theme=theme.value if theme else "indigo")


# ------------------------------------------------------------------- settings
@router.get("/settings", response_model=schemas.SettingsOut)
async def get_settings(_: models.User = Depends(require_admin)):
    theme = await models.AppSetting.find_one(models.AppSetting.key == "theme")
    return schemas.SettingsOut(theme=theme.value if theme else "indigo")


@router.put("/settings/theme", response_model=schemas.SettingsOut)
async def set_theme(
    body: schemas.ThemeUpdate,
    admin: models.User = Depends(require_admin),
):
    setting = await models.AppSetting.find_one(models.AppSetting.key == "theme")
    if setting is None:
        await models.AppSetting(key="theme", value=body.theme).insert()
    else:
        setting.value = body.theme
        await setting.save()
    await write_audit(admin, "theme.change", f"Changed UI theme to '{body.theme}'")
    return schemas.SettingsOut(theme=body.theme)


# ----------------------------------------------------------------- categories
@router.get("/categories", response_model=list[schemas.CategoryOut])
async def list_categories(_: models.User = Depends(require_admin)):
    return await models.Category.find_all().sort(+models.Category.name).to_list()


@router.post("/categories", response_model=schemas.CategoryOut, status_code=201)
async def create_category(
    body: schemas.CategoryCreate,
    admin: models.User = Depends(require_admin),
):
    if await models.Category.find_one(models.Category.name == body.name):
        raise HTTPException(status_code=409, detail="A category with this name already exists.")
    category = models.Category(name=body.name)
    await category.insert()
    await write_audit(admin, "category.create", f"Added category '{body.name}'")
    return category


@router.patch("/categories/{category_id}/toggle", response_model=schemas.CategoryOut)
async def toggle_category(
    category_id: PydanticObjectId,
    admin: models.User = Depends(require_admin),
):
    category = await models.Category.get(category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found.")
    category.is_active = not category.is_active
    state = "enabled" if category.is_active else "disabled"
    await category.save()
    await write_audit(admin, "category.toggle", f"{state.capitalize()} category '{category.name}'")
    return category


# -------------------------------------------------------------- custom fields
def _field_out(field: models.CustomField) -> schemas.CustomFieldOut:
    return schemas.CustomFieldOut(
        id=field.id,
        name=field.name,
        field_type=field.field_type,
        options=[schemas.DropdownOptionOut(id=o.id, value=o.value) for o in field.options],
    )


@router.get("/custom-fields", response_model=list[schemas.CustomFieldOut])
async def list_custom_fields(_: models.User = Depends(require_admin)):
    fields = await models.CustomField.find_all().sort(+models.CustomField.id).to_list()
    return [_field_out(f) for f in fields]


@router.post("/custom-fields", response_model=schemas.CustomFieldOut, status_code=201)
async def create_custom_field(
    body: schemas.CustomFieldCreate,
    admin: models.User = Depends(require_admin),
):
    if await models.CustomField.find_one(models.CustomField.name == body.name):
        raise HTTPException(status_code=409, detail="A field with this name already exists.")
    if body.field_type == "dropdown" and not body.options:
        raise HTTPException(status_code=422, detail="A dropdown field needs at least one option.")
    field = models.CustomField(
        name=body.name,
        field_type=body.field_type,
        options=[models.DropdownOption(value=opt) for opt in body.options],
    )
    await field.insert()
    await write_audit(admin, "field.create", f"Added custom field '{body.name}' ({body.field_type})")
    return _field_out(field)


@router.post(
    "/custom-fields/{field_id}/options",
    response_model=schemas.CustomFieldOut,
    status_code=201,
)
async def add_dropdown_option(
    field_id: PydanticObjectId,
    body: schemas.DropdownOptionCreate,
    admin: models.User = Depends(require_admin),
):
    field = await models.CustomField.get(field_id)
    if field is None:
        raise HTTPException(status_code=404, detail="Custom field not found.")
    if field.field_type != "dropdown":
        raise HTTPException(status_code=422, detail="Options can only be added to dropdown fields.")
    field.options.append(models.DropdownOption(value=body.value))
    await field.save()
    await write_audit(admin, "field.option.add", f"Added option '{body.value}' to field '{field.name}'")
    return _field_out(field)


@router.delete("/custom-fields/{field_id}/options/{option_id}", status_code=204)
async def remove_dropdown_option(
    field_id: PydanticObjectId,
    option_id: PydanticObjectId,
    admin: models.User = Depends(require_admin),
):
    field = await models.CustomField.get(field_id)
    option = next((o for o in field.options if o.id == option_id), None) if field else None
    if option is None:
        raise HTTPException(status_code=404, detail="Option not found.")
    field.options = [o for o in field.options if o.id != option_id]
    await field.save()
    await write_audit(
        admin, "field.option.remove",
        f"Removed option '{option.value}' from field '{field.name}'",
    )


@router.delete("/custom-fields/{field_id}", status_code=204)
async def delete_custom_field(
    field_id: PydanticObjectId,
    admin: models.User = Depends(require_admin),
):
    field = await models.CustomField.get(field_id)
    if field is None:
        raise HTTPException(status_code=404, detail="Custom field not found.")
    # Remove stored values for this field from every asset (Mongo has no cascades).
    await models.Asset.find_all().update({"$pull": {"custom_values": {"custom_field_id": field_id}}})
    await write_audit(admin, "field.delete", f"Removed custom field '{field.name}'")
    await field.delete()


# ---------------------------------------------------------------------- users
@router.get("/users", response_model=list[schemas.UserOut])
async def list_users(_: models.User = Depends(require_admin)):
    return await models.User.find_all().sort(+models.User.full_name).to_list()


@router.post("/users", response_model=schemas.UserOut, status_code=201)
async def create_user(
    body: schemas.UserCreate,
    admin: models.User = Depends(require_admin),
):
    email = body.email.lower()
    if await models.User.find_one(models.User.email == email):
        raise HTTPException(status_code=409, detail="A user with this email already exists.")
    user = models.User(
        email=email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role=body.role,
        department=body.department,
    )
    await user.insert()
    await write_audit(admin, "user.create", f"Created {body.role} account for {body.full_name} ({email})")
    return user


@router.put("/users/{user_id}", response_model=schemas.UserOut)
async def update_user(
    user_id: PydanticObjectId,
    body: schemas.UserUpdate,
    admin: models.User = Depends(require_admin),
):
    user = await models.User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(user, key, value)
    await user.save()
    await write_audit(admin, "user.update", f"Updated details for {user.full_name}")
    return user


@router.patch("/users/{user_id}/toggle", response_model=schemas.UserOut)
async def toggle_user(
    user_id: PydanticObjectId,
    admin: models.User = Depends(require_admin),
):
    user = await models.User.get(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.id == admin.id:
        raise HTTPException(status_code=422, detail="You can't deactivate your own account.")
    user.is_active = not user.is_active
    state = "reactivated" if user.is_active else "deactivated"
    await user.save()
    await write_audit(admin, "user.toggle", f"{state.capitalize()} account of {user.full_name}")
    return user


# ------------------------------------------------------------------ audit log
@router.get("/audit-logs", response_model=list[schemas.AuditLogOut])
async def list_audit_logs(
    _: models.User = Depends(require_admin),
    limit: int = 200,
):
    logs = (
        await models.AuditLog.find_all()
        .sort(-models.AuditLog.created_at, -models.AuditLog.id)
        .limit(min(limit, 500))
        .to_list()
    )
    actor_ids = list({log.actor_id for log in logs})
    actors = {}
    if actor_ids:
        actors = {u.id: u for u in await models.User.find(In(models.User.id, actor_ids)).to_list()}
    return [
        schemas.AuditLogOut(
            id=log.id,
            actor_name=actors[log.actor_id].full_name if log.actor_id in actors else None,
            action=log.action,
            detail=log.detail,
            created_at=log.created_at,
        )
        for log in logs
    ]
