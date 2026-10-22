import os
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["PIPELINE_STEP_DELAY"] = "0"
os.environ["SEED_DEMO"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "demo123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def ivan(client): return login(client, "ivan@demo.ru")
@pytest.fixture(scope="session")
def maria(client): return login(client, "maria@demo.ru")
@pytest.fixture(scope="session")
def operator(client): return login(client, "operator@demo.ru")
@pytest.fixture(scope="session")
def risk(client): return login(client, "risk@demo.ru")
