"""Сквозной прогон живого стека: квиз → подбор → черновик → ИНН/заявитель → демо-документы (настоящие PDF/XLSX) →
расхождение (ИП Волков) → подтверждение → отправка → конвейер. Запуск: python scripts/e2e_live.py [http://localhost:8080]
(по адресу фронтенда/nginx, чтобы проверить и прокси /api)."""
import sys
import time

import httpx

ROOT = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
B = ROOT + "/api"
c = httpx.Client(base_url=B, timeout=30)
tok=c.post("/auth/login",json={"email":"ivan@demo.ru","password":"demo123"}).json()["token"]; H={"Authorization":f"Bearer {tok}"}
def show(t): print("✓",t)
s=c.post("/intake/start",json={"text":"Нужно 1,5 млн на закупку товара к сезону, на 2 года"},headers=H).json()
while s["question"]:
    q=s["question"]; ans={"legal_form":"ООО","business_age_months":24}[q["field"]]
    s=c.post(f"/intake/{s['id']}/answer",json={"field":q["field"],"value":ans},headers=H).json()
show(f"квиз: статус {s['status']}, портрет «{s['portrait']['summary']}»")
r=c.post(f"/intake/{s['id']}/recommend",headers=H).json()["recommendations"]
show(f"подбор: главный {r['primary']['code']}, запасные {[a['code'] for a in r['alternatives']]}")
for inn,label in (("500123456750","ИП Волков (с расхождением)"),("7804123453","Север-Логистика (без расхождения)")):
    a=c.post(f"/intake/{s['id']}/application" if inn=="500123456750" else "/applications/draft",json={"product_code":"working_capital","amount":1500000,"term_months":24},headers=H).json()
    aid=a["id"]
    a=c.patch(f"/applications/{aid}",json={"company_inn":inn,"contact":{"name":"Иванов Иван Иванович","phone":"+7 900 111-22-33","role":"owner"},"wizard_step":3,"financials":{"monthly_obligations":0} if False else {}},headers=H).json()
    for kind,fmt in (("tax_return","pdf"),("bank_statement","xlsx")):
        f=c.get(f"/demo/documents/{inn}/{kind}.{fmt}").content
        a=c.post(f"/applications/{aid}/documents",data={"kind":kind},files={"file":(f"{kind}_{inn}.{fmt}",f)},headers=H).json()
    fl={x["field"]:(x["value"],x["status"],x["source"]) for x in a["review"]["fields"]}
    show(f"{label}: {fl}")
    sub=c.post(f"/applications/{aid}/submit",headers=H)
    if a["review"]["has_conflicts"]:
        assert sub.status_code==422; show(f"  отправка заблокирована: {sub.json()['detail']}")
        xid=next(x["extraction_id"] for x in a["review"]["fields"] if x["status"]=="conflict")
        a=c.patch(f"/extractions/{xid}",json={"confirm":True},headers=H).json(); assert not a["review"]["has_conflicts"]; show("  подтверждено клиентом")
        sub=c.post(f"/applications/{aid}/submit",headers=H)
    assert sub.status_code==200,sub.text
    for _ in range(40):
        d=c.get(f"/applications/{aid}",headers=H).json()
        if not d["processing"]: break
        time.sleep(0.4)
    show(f"  итог: {d['status']} · «{d['status_label']}» · что: {d['what'][:50]}… · действие: {d['needs_action']}")
