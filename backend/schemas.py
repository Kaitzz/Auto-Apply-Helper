from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


# Field Mapping Schemas
class FieldMappingBase(BaseModel):
    platform: str
    field_name: str
    selectors: List[str]
    field_type: str = 'input'


class FieldMappingCreate(FieldMappingBase):
    pass


class FieldMappingResponse(FieldMappingBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Application Log Schemas
class ApplicationLogCreate(BaseModel):
    url: str
    platform: str
    fields_filled: List[str]
    fields_failed: List[str]
    resume_uploaded: bool = False


class ApplicationLogResponse(BaseModel):
    id: int
    url: str
    platform: str
    fields_filled: List[str]
    fields_failed: List[str]
    resume_uploaded: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# Custom Selector Schemas
class CustomSelectorBase(BaseModel):
    domain: str
    field_name: str
    selector: str


class CustomSelectorCreate(CustomSelectorBase):
    pass


class CustomSelectorResponse(CustomSelectorBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# Platform Mappings Response (all mappings for a platform)
class PlatformMappingsResponse(BaseModel):
    platform: str
    mappings: dict  # field_name -> selectors
