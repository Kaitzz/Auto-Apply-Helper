from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# SQLite for development, can switch to PostgreSQL for production
SQLALCHEMY_DATABASE_URL = "sqlite:///./job_autofill.db"
# For PostgreSQL:
# SQLALCHEMY_DATABASE_URL = "postgresql://user:password@localhost/job_autofill"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}  # Only needed for SQLite
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency for FastAPI routes
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
