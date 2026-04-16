from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    DB_PATH: str = "backend/data/pathfinding.db"
    ALLOWED_ORIGINS: str = "http://localhost:8080"

    class Config:
        env_file = ".env"


settings = Settings()
