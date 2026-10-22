"""Документы: парсеры PDF/XLSX/CSV, правило расхождения (оборот×12 против выручки > 35%), PATCH /extractions/{id}."""
from app.documents.parsers import extract
from app.documents.samples import generate
from app.documents.service import conflict_ratio
from app.integrations import DEMO_SCENARIOS


def vals(kind, fmt, sc):
    name, data, _ = generate(DEMO_SCENARIOS[sc]["inn"], kind, fmt)
    return {f.field: f.value for f in extract(kind, name, data)[0]}


def test_parsers_all_formats():
    for fmt in ("pdf", "xlsx"):
        assert vals("tax_return", fmt, "strong") == {"revenue_year": 60_000_000, "net_profit_year": 9_000_000}
    for fmt in ("pdf", "xlsx", "csv"):
        assert vals("bank_statement", fmt, "strong") == {"monthly_turnover": 5_000_000, "monthly_obligations": 150_000}
    assert vals("invoice", "pdf", "gray")["purchase_price"] > 0
    assert extract("tax_return", "scan.pdf", b"%PDF-broken")[0] == []  # сканы/мусор не роняют загрузку


def test_conflict_rule():
    assert conflict_ratio(400_000, 9_000_000) > 0.35 and conflict_ratio(5_000_000, 60_000_000) == 0
    assert conflict_ratio(750_000, 9_000_000) == 0 and conflict_ratio(None, 5) is None


def _app(client, h, sc):
    r = client.post("/api/applications", json=dict(company_inn=DEMO_SCENARIOS[sc]["inn"], product_code="working_capital", amount=1_200_000,
                                                   term_months=18, contact=dict(name="Т", phone="+7 900 000-00-00")), headers=h)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _up(client, h, aid, sc, kind, fmt):
    name, data, mime = generate(DEMO_SCENARIOS[sc]["inn"], kind, fmt)
    r = client.post(f"/api/applications/{aid}/documents", data={"kind": kind}, files={"file": (name, data, mime)}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_consistent_kit_fills_financials(client, ivan):
    aid = _app(client, ivan, "strong")
    _up(client, ivan, aid, "strong", "tax_return", "pdf")
    a = _up(client, ivan, aid, "strong", "bank_statement", "xlsx")
    assert a["financials"]["revenue_year"] == 60_000_000 and a["financials"]["monthly_turnover"] == 5_000_000
    assert not a["review"]["has_conflicts"]
    f = {x["field"]: x for x in a["review"]["fields"]}
    assert f["revenue_year"]["source"] == "parser_pdf" and "строка 2110" in f["revenue_year"]["source_label"]
    assert next(d for d in a["documents"] if d["kind"] == "bank_statement")["extraction"] == "ok"


def test_conflict_kit_blocks_submit_until_fixed_or_confirmed(client, ivan):
    aid = _app(client, ivan, "gray")
    _up(client, ivan, aid, "gray", "tax_return", "xlsx")
    a = _up(client, ivan, aid, "gray", "bank_statement", "csv")
    assert a["review"]["has_conflicts"]
    ex = {e["field"]: e for d in a["documents"] for e in d["extractions"]}
    assert ex["monthly_turnover"]["status"] == "conflict" and ex["revenue_year"]["status"] == "conflict"
    assert "расходятся" in ex["monthly_turnover"]["note"]
    assert client.post(f"/api/applications/{aid}/submit", headers=ivan).status_code == 422
    # исправили значение → расхождение снято, правка помечена edited
    r = client.patch(f"/api/extractions/{ex['monthly_turnover']['id']}", json={"value": 750_000}, headers=ivan).json()
    ex2 = {e["field"]: e for d in r["documents"] for e in d["extractions"]}
    assert ex2["monthly_turnover"]["status"] == "edited" and ex2["revenue_year"]["status"] == "ok"
    assert r["financials"]["monthly_turnover"] == 750_000 and not r["review"]["has_conflicts"]


def test_conflict_confirmed_by_client(client, ivan):
    aid = _app(client, ivan, "gray")
    _up(client, ivan, aid, "gray", "tax_return", "pdf")
    a = _up(client, ivan, aid, "gray", "bank_statement", "pdf")
    xid = next(e["id"] for d in a["documents"] for e in d["extractions"] if e["status"] == "conflict")
    r = client.patch(f"/api/extractions/{xid}", json={"confirm": True}, headers=ivan).json()
    st = {e["field"]: e["status"] for d in r["documents"] for e in d["extractions"]}
    assert st["monthly_turnover"] == st["revenue_year"] == "confirmed" and not r["review"]["has_conflicts"]
    assert any(ev["title"].startswith("Клиент подтвердил") for ev in r["events"])


def test_patch_extraction_security(client, ivan, maria):
    aid = _app(client, ivan, "strong")
    a = _up(client, ivan, aid, "strong", "tax_return", "xlsx")
    xid = a["documents"][0]["extractions"][0]["id"]
    assert client.patch(f"/api/extractions/{xid}", json={"value": 1}, headers=maria).status_code == 404
    assert client.patch("/api/extractions/999999", json={"value": 1}, headers=ivan).status_code == 404


def test_demo_documents_endpoint(client):
    inn = DEMO_SCENARIOS["gray"]["inn"]
    cat = client.get(f"/api/demo/documents/{inn}").json()
    assert next(k for k in cat if k["kind"] == "bank_statement")["conflict"] is True
    r = client.get(f"/api/demo/documents/{inn}/tax_return.xlsx")
    assert r.status_code == 200 and r.content[:2] == b"PK"
    assert client.get(f"/api/demo/documents/{inn}/nothing.pdf").status_code == 404
