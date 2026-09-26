import os
import tempfile
from pathlib import Path

# Configure an isolated database and *no* AI key before the app is imported,
# so tests never touch the dev database or call the real OpenRouter API.
_TMP = Path(tempfile.mkdtemp(prefix="acct-intel-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["OPENROUTER_API_KEY"] = ""

from datetime import datetime, timedelta  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Account, Activity, Contact  # noqa: E402
from app.services.personas import persona_for_title  # noqa: E402

NOW = datetime(2026, 9, 25, 12, 0, 0)


@pytest.fixture
def now() -> datetime:
    return NOW


def make_account(**kw) -> Account:
    defaults = dict(id=1, name="Test Co", industry="Technology", employee_count=1000, website="https://t.example", target_industry=None)
    defaults.update(kw)
    return Account(**defaults)


def act(activity_type: str, ago: timedelta = timedelta(hours=1), now: datetime = NOW, id: int | None = None, **meta) -> Activity:
    return Activity(account_id=1, id=id, activity_type=activity_type, timestamp=now - ago, metadata=meta or None)


def contact(name: str, title: str | None, email: str | None = None, id: int | None = None) -> Contact:
    return Contact(id=id, account_id=1, name=name, job_title=title, email=email, persona=persona_for_title(title))


@pytest.fixture
def empty_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def seeded_db():
    from app.seed import seed

    seed(verbose=False)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
