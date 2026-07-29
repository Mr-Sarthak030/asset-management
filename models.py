"""Beanie ODM document models (MongoDB collections).

Mongo has no foreign keys, so relations below are plain `PydanticObjectId`
references resolved by hand in the routers (no automatic joins/cascades):
    Asset.category_id        -> Category.id
    Asset.assigned_to_id     -> User.id
    Asset.custom_values      -> embedded list, custom_field_id refers to CustomField.id
    CustomField.options      -> embedded list (DropdownOption)
    Assignment               -> Asset.id, User.id (employee), User.id (assigned_by admin)
    RepairRequest             -> Asset.id, User.id (employee)
    MaintenanceLog            -> Asset.id, RepairRequest.id (nullable), User.id (resolved_by)
    AuditLog                  -> User.id (actor)
"""
from datetime import datetime, date
from typing import ClassVar

from beanie import Document, Indexed, PydanticObjectId
from pydantic import BaseModel, Field


class User(Document):
    email: Indexed(str, unique=True)
    full_name: str
    hashed_password: str
    role: str = "employee"  # 'admin' | 'employee'
    is_active: bool = True
    department: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "users"


class Category(Document):
    name: Indexed(str, unique=True)
    is_active: bool = True

    class Settings:
        name = "categories"


class DropdownOption(BaseModel):
    id: PydanticObjectId = Field(default_factory=PydanticObjectId)
    value: str


class CustomField(Document):
    """Admin-defined dynamic field attached to every asset (no-code customization)."""
    name: Indexed(str, unique=True)
    field_type: str  # 'text' | 'number' | 'date' | 'dropdown'
    options: list[DropdownOption] = []

    class Settings:
        name = "custom_fields"


class CustomValue(BaseModel):
    custom_field_id: PydanticObjectId
    value: str | None = None


class Asset(Document):
    asset_tag: Indexed(str, unique=True)
    name: str
    category_id: PydanticObjectId
    purchase_date: date | None = None
    price: float | None = None
    vendor: str | None = None
    warranty_expiry: date | None = None
    status: str = "available"
    # 'available' | 'assigned' | 'in_repair' | 'retired'
    assigned_to_id: PydanticObjectId | None = None
    location: str | None = None
    terms_conditions: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    custom_values: list[CustomValue] = []

    class Settings:
        name = "assets"


class Assignment(Document):
    """One assignment cycle of an asset to an employee, including its return."""
    asset_id: PydanticObjectId
    employee_id: PydanticObjectId
    assigned_by_id: PydanticObjectId
    assigned_at: datetime = Field(default_factory=datetime.utcnow)
    # Return details — filled when the item comes back
    returned_at: datetime | None = None
    return_condition: str | None = None  # 'excellent' | 'good' | 'fair' | 'damaged'
    return_reason: str | None = None

    class Settings:
        name = "assignments"


class RepairRequest(Document):
    STATUS_FLOW: ClassVar[list[str]] = ["submitted", "acknowledged", "in_repair", "resolved"]

    asset_id: PydanticObjectId
    employee_id: PydanticObjectId
    description: str
    urgency: str  # 'low' | 'medium' | 'high'
    photo_path: str | None = None
    status: str = "submitted"
    req_type: str = "Repair"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "repair_requests"


class MaintenanceLog(Document):
    """Created when a repair request is resolved."""
    asset_id: PydanticObjectId
    repair_request_id: PydanticObjectId | None = None
    resolved_by_id: PydanticObjectId
    action_taken: str
    cost: float | None = None
    next_service_due: date | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "maintenance_logs"


class AuditLog(Document):
    """Immutable admin action timeline. The API exposes read-only access; there are
    no update or delete endpoints for this table."""
    actor_id: PydanticObjectId
    action: str
    detail: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "audit_logs"


class AppSetting(Document):
    """Key/value store for admin-configurable UI settings (e.g. theme color)."""
    key: Indexed(str, unique=True)
    value: str

    class Settings:
        name = "app_settings"
