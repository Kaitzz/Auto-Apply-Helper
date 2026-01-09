from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

from database import engine, get_db, Base
from models import FieldMapping, ApplicationLog, CustomSelector
from schemas import (
    FieldMappingCreate, FieldMappingResponse,
    ApplicationLogCreate, ApplicationLogResponse,
    CustomSelectorCreate, CustomSelectorResponse,
    PlatformMappingsResponse
)

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Job Application Autofill API",
    description="Backend API for the job application autofill Chrome extension",
    version="1.0.0"
)

# CORS configuration - allow extension to access API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to extension origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Job Application Autofill API", "version": "1.0.0"}


# ==================== Field Mappings ====================

@app.get("/api/mappings/{platform}", response_model=PlatformMappingsResponse)
def get_platform_mappings(platform: str, db: Session = Depends(get_db)):
    """Get all field mappings for a specific platform (e.g., greenhouse, lever)"""
    mappings = db.query(FieldMapping).filter(FieldMapping.platform == platform).all()
    
    # Convert to dict format: {field_name: selectors}
    mappings_dict = {}
    for m in mappings:
        mappings_dict[m.field_name] = m.selectors
    
    return PlatformMappingsResponse(platform=platform, mappings=mappings_dict)


@app.post("/api/mappings", response_model=FieldMappingResponse)
def create_field_mapping(mapping: FieldMappingCreate, db: Session = Depends(get_db)):
    """Create a new field mapping"""
    db_mapping = FieldMapping(**mapping.model_dump())
    db.add(db_mapping)
    db.commit()
    db.refresh(db_mapping)
    return db_mapping


@app.put("/api/mappings/{mapping_id}", response_model=FieldMappingResponse)
def update_field_mapping(
    mapping_id: int, 
    mapping: FieldMappingCreate, 
    db: Session = Depends(get_db)
):
    """Update an existing field mapping"""
    db_mapping = db.query(FieldMapping).filter(FieldMapping.id == mapping_id).first()
    if not db_mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    for key, value in mapping.model_dump().items():
        setattr(db_mapping, key, value)
    
    db.commit()
    db.refresh(db_mapping)
    return db_mapping


@app.delete("/api/mappings/{mapping_id}")
def delete_field_mapping(mapping_id: int, db: Session = Depends(get_db)):
    """Delete a field mapping"""
    db_mapping = db.query(FieldMapping).filter(FieldMapping.id == mapping_id).first()
    if not db_mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    db.delete(db_mapping)
    db.commit()
    return {"message": "Mapping deleted"}


# ==================== Application Logs ====================

@app.post("/api/logs", response_model=ApplicationLogResponse)
def create_application_log(log: ApplicationLogCreate, db: Session = Depends(get_db)):
    """Log an autofill attempt"""
    db_log = ApplicationLog(
        url=log.url,
        platform=log.platform,
        fields_filled=log.fields_filled,
        fields_failed=log.fields_failed,
        resume_uploaded=1 if log.resume_uploaded else 0
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log


@app.get("/api/logs", response_model=List[ApplicationLogResponse])
def get_application_logs(
    skip: int = 0, 
    limit: int = 50, 
    db: Session = Depends(get_db)
):
    """Get recent application logs"""
    logs = db.query(ApplicationLog)\
        .order_by(ApplicationLog.created_at.desc())\
        .offset(skip)\
        .limit(limit)\
        .all()
    return logs


# ==================== Custom Selectors ====================

@app.get("/api/selectors/{domain}", response_model=List[CustomSelectorResponse])
def get_custom_selectors(domain: str, db: Session = Depends(get_db)):
    """Get custom selectors for a specific domain"""
    selectors = db.query(CustomSelector)\
        .filter(CustomSelector.domain == domain)\
        .all()
    return selectors


@app.post("/api/selectors", response_model=CustomSelectorResponse)
def create_custom_selector(
    selector: CustomSelectorCreate, 
    db: Session = Depends(get_db)
):
    """Create a custom selector for a specific domain"""
    db_selector = CustomSelector(**selector.model_dump())
    db.add(db_selector)
    db.commit()
    db.refresh(db_selector)
    return db_selector


@app.delete("/api/selectors/{selector_id}")
def delete_custom_selector(selector_id: int, db: Session = Depends(get_db)):
    """Delete a custom selector"""
    db_selector = db.query(CustomSelector)\
        .filter(CustomSelector.id == selector_id)\
        .first()
    if not db_selector:
        raise HTTPException(status_code=404, detail="Selector not found")
    
    db.delete(db_selector)
    db.commit()
    return {"message": "Selector deleted"}


# ==================== Seed Data ====================

@app.post("/api/seed")
def seed_greenhouse_mappings(db: Session = Depends(get_db)):
    """Seed initial Greenhouse field mappings"""
    greenhouse_mappings = [
        {
            "platform": "greenhouse",
            "field_name": "first_name",
            "selectors": [
                'input[name*="first_name"]',
                'input[id*="first_name"]',
                'input[autocomplete="given-name"]'
            ],
            "field_type": "input"
        },
        {
            "platform": "greenhouse",
            "field_name": "last_name",
            "selectors": [
                'input[name*="last_name"]',
                'input[id*="last_name"]',
                'input[autocomplete="family-name"]'
            ],
            "field_type": "input"
        },
        {
            "platform": "greenhouse",
            "field_name": "email",
            "selectors": [
                'input[name*="email"]',
                'input[type="email"]',
                'input[autocomplete="email"]'
            ],
            "field_type": "input"
        },
        {
            "platform": "greenhouse",
            "field_name": "phone",
            "selectors": [
                'input[name*="phone"]',
                'input[type="tel"]',
                'input[autocomplete="tel"]'
            ],
            "field_type": "input"
        },
        {
            "platform": "greenhouse",
            "field_name": "linkedin",
            "selectors": [
                'input[name*="linkedin"]',
                'input[id*="linkedin"]',
                'input[placeholder*="linkedin" i]'
            ],
            "field_type": "input"
        },
        {
            "platform": "greenhouse",
            "field_name": "github",
            "selectors": [
                'input[name*="github"]',
                'input[id*="github"]',
                'input[placeholder*="github" i]'
            ],
            "field_type": "input"
        }
    ]
    
    # Check if already seeded
    existing = db.query(FieldMapping).filter(FieldMapping.platform == "greenhouse").first()
    if existing:
        return {"message": "Greenhouse mappings already exist"}
    
    for mapping_data in greenhouse_mappings:
        db_mapping = FieldMapping(**mapping_data)
        db.add(db_mapping)
    
    db.commit()
    return {"message": f"Seeded {len(greenhouse_mappings)} Greenhouse mappings"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
