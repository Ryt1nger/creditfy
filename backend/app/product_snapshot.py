"""Pinned product conditions; additive migration for older SQLite/PostgreSQL databases."""
from copy import deepcopy
import json
from pathlib import Path
from sqlalchemy import inspect, text, select, event
from .models import Application
from .products import PRODUCTS


def product_for(app: Application) -> dict:
    return app.product_snapshot or PRODUCTS[app.product_code]


@event.listens_for(Application, 'before_insert')
def freeze_product(_mapper, _connection, target):
    if not target.product_snapshot:
        target.product_snapshot = deepcopy(PRODUCTS[target.product_code])


def migrate(engine, session_factory):
    if 'product_snapshot' not in {c['name'] for c in inspect(engine).get_columns('applications')}:
        with engine.begin() as conn:
            conn.execute(text('ALTER TABLE applications ADD COLUMN product_snapshot JSON'))
    with session_factory() as db:
        for a in db.scalars(select(Application).where(Application.product_snapshot.is_(None))):
            # Old offers/loans already pin amount, rate and term; do not recalculate them.
            a.product_snapshot = deepcopy({p["code"]: p for p in json.loads((Path(__file__).parent / "config_data" / "legacy_products_v2.json").read_text())["products"]}.get(a.product_code, PRODUCTS[a.product_code]))
        db.commit()
