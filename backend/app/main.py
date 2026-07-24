from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, habits, stats

app = FastAPI(title="Habit Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(habits.router)
app.include_router(stats.router)


@app.get("/health")
def health():
    return {"status": "ok"}
