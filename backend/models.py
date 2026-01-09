from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class FieldMapping(Base):
    """
    Stores field mapping rules for different ATS platforms.
    This allows updating mapping rules without changing code.
    """
    __tablename__ = "field_mappings"
    
    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String(50), index=True)  # e.g., 'greenhouse', 'lever', 'workday'
    field_name = Column(String(100))  # e.g., 'first_name', 'email'
    selectors = Column(JSON)  # List of CSS selectors to try
    field_type = Column(String(20), default='input')  # 'input', 'select', 'textarea'
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ApplicationLog(Base):
    """
    Logs autofill attempts for debugging and analytics.
    """
    __tablename__ = "application_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    url = Column(Text)
    platform = Column(String(50))
    fields_filled = Column(JSON)  # List of successfully filled fields
    fields_failed = Column(JSON)  # List of fields that couldn't be filled
    resume_uploaded = Column(Integer, default=0)  # 0 or 1
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CustomSelector(Base):
    """
    User-defined custom selectors for specific job boards.
    Allows users to add support for non-standard forms.
    """
    __tablename__ = "custom_selectors"
    
    id = Column(Integer, primary_key=True, index=True)
    domain = Column(String(255), index=True)  # e.g., 'jobs.apple.com'
    field_name = Column(String(100))
    selector = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
