"""Сквозные сценарии кредитного конвейера (синтетические данные)."""
from app.integrations import DEMO_SCENARIOS, inn_is_valid
from app.services import offers
from app.services.scoring import score_application

FIN_OK = dict(revenue_year=60_000_000, net_profit_year=9_000_000, monthly_turnover=5_000_000, monthly_obligations=150_000)


def create(client, h, sc, code="working_capital", amount=2_000_000, term=24, fin=None, docs=True):
    kinds = {"working_capital": ("bank_statement", "tax_return"), "equipment": ("bank_statement", "tax_return", "invoice"),
             "investment": ("bank_statement", "tax_return", "business_plan"), "overdraft": ("bank_statement", "tax_return")}[code]
    body = dict(company_inn=DEMO_SCENARIOS[sc]["inn"], product_code=code, amount=amount, term_months=term, purpose="тест",
                financials=fin or FIN_OK, contact=dict(name="Тест", phone="+7 900 111-22-33"))
    r = client.post("/api/applications", json=body, headers=h)
    assert r.status_code == 200, r.text
    a = r.json()
    if docs:
        for k in kinds:
            r = client.post(f"/api/applications/{a['id']}/documents", data={"kind": k}, files={"file": (f"{k}.pdf", b"%PDF-demo")}, headers=h)
            assert r.status_code == 200, r.text
    return a


def submit(client, h, aid):
    r = client.post(f"/api/applications/{aid}/submit", headers=h)
    assert r.status_code == 200, r.text
    return client.get(f"/api/applications/{aid}", headers=h).json()


def test_demo_inns_valid():
    assert all(inn_is_valid(v["inn"]) for v in DEMO_SCENARIOS.values())
    assert not inn_is_valid("1234567890") and not inn_is_valid("abc")


def test_auto_approve_sign_disburse(client, ivan):
    a = submit(client, ivan, create(client, ivan, "strong")["id"])
    assert a["status"] == "OFFER_READY" and a["decision"] == "approved" and a["risk_grade"] in "AB"
    assert client.post(f"/api/applications/{a['id']}/sign", json={"consent": True}, headers=ivan).status_code == 409  # нельзя подписать до принятия
    assert client.post(f"/api/applications/{a['id']}/offer/accept", headers=ivan).json()["status"] == "SIGNING"
    assert client.post(f"/api/applications/{a['id']}/sign", json={"consent": False}, headers=ivan).status_code == 422
    d = client.post(f"/api/applications/{a['id']}/sign", json={"consent": True}, headers=ivan).json()
    assert d["status"] == "DISBURSED" and len(d["loan"]["schedule"]) == 24
    assert abs(sum(r["principal"] for r in d["loan"]["schedule"]) - d["loan"]["amount"]) <= 24


def test_stop_factors_reject(client, ivan):
    for sc, reason in (("bad", "Негативная"), ("liquidating", "Статус компании"), ("newco", "Срок ведения")):
        a = submit(client, ivan, create(client, ivan, sc)["id"])
        assert a["status"] == "REJECTED" and reason in a["decision_reason"], (sc, a["decision_reason"])


def test_counteroffer_when_capacity_low(client, maria):
    fin = dict(revenue_year=18_000_000, net_profit_year=1_800_000, monthly_turnover=1_500_000, monthly_obligations=25_000)
    a = submit(client, maria, create(client, maria, "tight", "equipment", 4_000_000, 36, fin)["id"])
    assert a["status"] == "OFFER_READY" and a["decision"] == "counteroffer"
    o = a["offers"][-1]
    assert o["kind"] == "counter" and (o["term_months"] > 36 or o["amount"] < 4_000_000)


def test_manual_review_and_underwriter_decision(client, ivan, operator, risk):
    fin = dict(revenue_year=9_000_000, net_profit_year=1_000_000, monthly_turnover=750_000, monthly_obligations=18_000)
    a = submit(client, ivan, create(client, ivan, "gray", amount=1_200_000, term=18, fin=fin)["id"])
    assert a["status"] == "MANUAL_REVIEW"
    assert client.post(f"/api/bank/applications/{a['id']}/decision", json={"type": "approve"}, headers=operator).status_code == 403
    assert client.get(f"/api/bank/applications/{a['id']}", headers=ivan).status_code == 403  # клиенту банковская карточка недоступна
    r = client.post(f"/api/bank/applications/{a['id']}/request-info", json={"message": "Поясните оборот"}, headers=operator).json()
    assert r["status"] == "NEEDS_INFO"
    rid = r["info_requests"][-1]["id"]
    assert client.post(f"/api/applications/{a['id']}/info-requests/{rid}/answer", json={}, headers=ivan).status_code == 422
    back = client.post(f"/api/applications/{a['id']}/info-requests/{rid}/answer", json={"answer": "Сезонность"}, headers=ivan).json()
    assert back["status"] == "MANUAL_REVIEW"
    d = client.post(f"/api/bank/applications/{a['id']}/decision", json={"type": "approve", "comment": "ок"}, headers=risk).json()
    assert d["status"] == "OFFER_READY" and d["decision_reason"] == "ок"
    assert client.post(f"/api/bank/applications/{a['id']}/decision", json={"type": "approve"}, headers=risk).status_code == 409


def test_missing_info_loop(client, ivan):
    a = submit(client, ivan, create(client, ivan, "strong", fin=dict(FIN_OK, monthly_obligations=None), docs=False)["id"])
    assert a["status"] == "NEEDS_INFO" and a["info_requests"][0]["status"] == "open"
    items = a["info_requests"][0]["items"]
    assert {i["key"] for i in items} >= {"bank_statement", "tax_return", "financials.monthly_obligations"}
    rid = a["info_requests"][0]["id"]
    for k in ("bank_statement", "tax_return"):
        client.post(f"/api/applications/{a['id']}/documents", data={"kind": k}, files={"file": (f"{k}.pdf", b"x")}, headers=ivan)
    r = client.post(f"/api/applications/{a['id']}/info-requests/{rid}/answer", json={"fields": {"financials.monthly_obligations": "100000"}}, headers=ivan)
    assert r.status_code == 200, r.text
    assert client.get(f"/api/applications/{a['id']}", headers=ivan).json()["status"] == "OFFER_READY"


def test_security(client, ivan, maria):
    a = create(client, ivan, "strong")
    assert client.get(f"/api/applications/{a['id']}", headers=maria).status_code == 404
    assert client.get("/api/applications").status_code == 401
    assert client.get("/api/bank/applications", headers=ivan).status_code == 403
    assert client.patch(f"/api/applications/{a['id']}", json={"amount": 99}, headers=ivan).status_code == 422
    assert client.get("/api/companies/lookup/123", headers=ivan).status_code == 422
    r = client.post(f"/api/applications/{a['id']}/documents", data={"kind": "invoice"}, files={"file": ("x.exe", b"x")}, headers=ivan)
    assert r.status_code == 422
    big = client.post(f"/api/applications/{a['id']}/documents", data={"kind": "invoice"}, files={"file": ("x.pdf", b"0" * (5 * 1024 * 1024 + 1))}, headers=ivan)
    assert big.status_code == 413


def test_submitted_application_is_locked(client, ivan):
    a = submit(client, ivan, create(client, ivan, "strong")["id"])
    assert client.patch(f"/api/applications/{a['id']}", json={"purpose": "x"}, headers=ivan).status_code == 409
    assert client.post(f"/api/applications/{a['id']}/submit", headers=ivan).status_code == 409


def test_offer_search_and_scoring_units():
    assert offers.find_offer("equipment", 4_000_000, 36, "B", False, 0) is None  # платить нечем
    o = offers.find_offer("equipment", 4_000_000, 36, "B", False, 147_000)
    assert o and o.kind == "counter" and o.dscr >= offers.MIN_DSCR
    o2 = offers.find_offer("working_capital", 1_000_000, 12, "A", False, 500_000)
    assert o2.kind == "initial"
    from app.integrations import bki_lookup, egrul_lookup, pb_lookup
    inn = DEMO_SCENARIOS["strong"]["inn"]
    s = score_application("working_capital", 2_500_000, False, FIN_OK, egrul_lookup(inn), bki_lookup(inn), pb_lookup(inn))
    assert s.grade == "A" and s.route == "auto_approve" and not s.stop_factors
    assert sum(f["points"] for f in s.factors) + 500 == s.score


def test_stats_and_ai_status(client, risk):
    st = client.get("/api/bank/stats", headers=risk).json()
    assert st["total"] >= 7 and st["funnel"][0]["count"] == st["total"]
    ai = client.get("/api/ai/status").json()
    assert ai["is_stub"] and ai["provider"] == "stub"
