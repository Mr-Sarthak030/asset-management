"""Pydantic schemas (request bodies and response models)."""
from datetime import date, datetime

from beanie import PydanticObjectId
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------------------------------------------------------------- auth / users
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    department: str | None = None


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(admin|employee)$")
    department: str | None = Field(default=None, max_length=100)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    department: str | None = Field(default=None, max_length=100)


# ------------------------------------------------------------------ categories
class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    name: str
    is_active: bool


# --------------------------------------------------------------- custom fields
class DropdownOptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    value: str


class CustomFieldCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    field_type: str = Field(pattern="^(text|number|date|dropdown)$")
    options: list[str] = []  # used when field_type == 'dropdown'


class CustomFieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    name: str
    field_type: str
    options: list[DropdownOptionOut] = []


class DropdownOptionCreate(BaseModel):
    value: str = Field(min_length=1, max_length=255)


# ---------------------------------------------------------------------- assets
class CustomValueIn(BaseModel):
    custom_field_id: PydanticObjectId
    value: str | None = None


class CustomValueOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    custom_field_id: PydanticObjectId
    value: str | None = None


class AssetCreate(BaseModel):
    asset_tag: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    category_id: PydanticObjectId
    purchase_date: date | None = None
    price: float | None = Field(default=None, ge=0)
    vendor: str | None = Field(default=None, max_length=255)
    warranty_expiry: date | None = None
    location: str | None = Field(default=None, max_length=255)
    terms_conditions: str | None = None
    custom_values: list[CustomValueIn] = []


class AssetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category_id: PydanticObjectId | None = None
    purchase_date: date | None = None
    price: float | None = Field(default=None, ge=0)
    vendor: str | None = Field(default=None, max_length=255)
    warranty_expiry: date | None = None
    status: str | None = Field(default=None, pattern="^(available|assigned|in_repair|retired)$")
    location: str | None = Field(default=None, max_length=255)
    terms_conditions: str | None = None
    custom_values: list[CustomValueIn] | None = None


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    asset_tag: str
    name: str
    category_id: PydanticObjectId
    category_name: str | None = None
    purchase_date: date | None = None
    price: float | None = None
    vendor: str | None = None
    warranty_expiry: date | None = None
    warranty_status: str | None = None  # 'active' | 'expired' | 'none' (computed)
    status: str
    assigned_to_id: PydanticObjectId | None = None
    assigned_to_name: str | None = None
    location: str | None = None
    terms_conditions: str | None = None
    maintenance_count: int = 0
    custom_values: list[CustomValueOut] = []


class WarrantySummary(BaseModel):
    active: int
    expiring_soon: int  # active but within 30 days of expiry
    expired: int
    no_warranty: int


# ---------------------------------------------------- assignments and returns
class AssignRequest(BaseModel):
    asset_id: PydanticObjectId
    employee_id: PydanticObjectId


class ReturnRequest(BaseModel):
    return_condition: str = Field(pattern="^(excellent|good|fair|damaged)$")
    return_reason: str = Field(min_length=1)
    returned_at: datetime | None = None  # defaults to now on the server


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    asset_id: PydanticObjectId
    asset_name: str | None = None
    asset_tag: str | None = None
    employee_id: PydanticObjectId
    employee_name: str | None = None
    assigned_by_name: str | None = None
    assigned_at: datetime
    returned_at: datetime | None = None
    return_condition: str | None = None
    return_reason: str | None = None


# -------------------------------------------------------------- repair requests
class RepairStatusUpdate(BaseModel):
    status: str = Field(pattern="^(acknowledged|in_repair)$")


class RepairResolve(BaseModel):
    action_taken: str = Field(min_length=1)
    cost: float | None = Field(default=None, ge=0)
    next_service_due: date | None = None


class RepairRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    asset_id: PydanticObjectId
    asset_name: str | None = None
    asset_tag: str | None = None
    employee_id: PydanticObjectId
    employee_name: str | None = None
    employee_department: str | None = None
    description: str
    urgency: str
    photo_path: str | None = None
    status: str
    status_step: int = 0  # 0..3 index into the visual progress bar
    req_type: str = "Repair"
    category_name: str | None = None
    created_at: datetime
    updated_at: datetime


# ------------------------------------------------------------- maintenance log
class MaintenanceLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    asset_id: PydanticObjectId
    asset_name: str | None = None
    asset_tag: str | None = None
    repair_request_id: PydanticObjectId | None = None
    resolved_by_name: str | None = None
    action_taken: str
    cost: float | None = None
    next_service_due: date | None = None
    created_at: datetime


# ------------------------------------------------------------------- audit log
class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: PydanticObjectId
    actor_name: str | None = None
    action: str
    detail: str
    created_at: datetime


# -------------------------------------------------------------------- settings
class ThemeUpdate(BaseModel):
    theme: str = Field(pattern="^(slate|indigo|emerald)$")


class SettingsOut(BaseModel):
    theme: str
