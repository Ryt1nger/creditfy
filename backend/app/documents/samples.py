"""Генератор синтетических документов под демо-ИНН: отчётность (PDF/XLSX), выписка (XLSX/CSV/PDF), счёт, бизнес-план, залог.

Все документы помечены как синтетические, числа берутся из профиля демо-сценария.
Комплект «gray» (ИП Волков) намеренно содержит расхождение: поступления по выписке ×12 почти вдвое меньше
выручки в отчётности — на шаге «Проверка данных» это покажется как «Требует проверки».

Запуск вручную: python -m app.documents.samples --out ../samples
"""
import argparse
import csv
import io
import os
import random
from datetime import date
from pathlib import Path

from ..integrations import DEMO_SCENARIOS, egrul_lookup, inn_is_valid

MARK = "СИНТЕТИЧЕСКИЙ ДОКУМЕНТ ДЛЯ ДЕМОНСТРАЦИИ. Не является реальным документом."
YEAR = date.today().year - 1
PROFILES = {  # выручка, чистая прибыль, поступления/мес по выписке, платежи по кредитам/мес
    "strong": (60_000_000, 9_000_000, 5_000_000, 150_000),
    "tight": (18_000_000, 1_800_000, 1_500_000, 25_000),
    "gray": (9_000_000, 1_000_000, 400_000, 18_000),  # расхождение: 4,8 млн против 9 млн
    "bad": (25_000_000, 900_000, 2_000_000, 40_000),
    "liquidating": (12_000_000, 300_000, 950_000, 40_000),
    "newco": (1_200_000, 100_000, 300_000, 0),
}
KINDS = {"tax_return": ("pdf", "xlsx"), "bank_statement": ("xlsx", "csv", "pdf"), "invoice": ("pdf",),
         "business_plan": ("pdf",), "collateral_doc": ("pdf",)}
FONT_CANDIDATES = [os.getenv("DOC_FONT", ""), "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                   "/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "/Library/Fonts/Arial Unicode.ttf",
                   "C:/Windows/Fonts/arial.ttf"]


def profile(inn: str) -> tuple[int, int, int, int, bool]:
    for key, sc in DEMO_SCENARIOS.items():
        if sc["inn"] == inn:
            rev, prof, turn, obl = PROFILES[key]
            return rev, prof, turn, obl, key == "gray"
    r = random.Random(inn)
    rev = r.randint(60, 400) * 100_000
    return rev, int(rev * r.uniform(0.06, 0.16)), int(rev / 12 * r.uniform(0.95, 1.08)), r.choice([0, 15_000, 30_000]), False


def _months(inn: str, avg: int, obl: int) -> list[tuple[str, int, int, int]]:
    r = random.Random(inn + "stmt")
    k = [r.uniform(0.82, 1.18) for _ in range(12)]
    norm = 12 / sum(k)
    names = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]
    rows = []
    for i in range(12):
        inc = round(avg * k[i] * norm / 1000) * 1000
        rows.append((f"{names[i]} {YEAR}", inc, round(inc * r.uniform(0.85, 0.97) / 1000) * 1000, obl))
    drift = avg * 12 - sum(x[1] for x in rows)  # точное среднее для воспроизводимости
    m, inc, out, l = rows[-1]
    rows[-1] = (m, inc + drift, out, l)
    return rows


def _company(inn: str) -> dict:
    e = egrul_lookup(inn) or {}
    return {"name": e.get("name", "Компания"), "inn": inn, "address": e.get("address", "—")}


def _font() -> str:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    if "DocFont" in pdfmetrics.getRegisteredFontNames():
        return "DocFont"
    for path in FONT_CANDIDATES:
        if path and Path(path).exists():
            pdfmetrics.registerFont(TTFont("DocFont", path))
            return "DocFont"
    raise RuntimeError("Не найден TTF-шрифт с кириллицей: установите fonts-dejavu-core или задайте DOC_FONT")


def _pdf(title: str, c: dict, lines: list[tuple[str, str]], extra: list[str] | None = None) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    font = _font()
    buf = io.BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    pdf.setFont(font, 8)
    pdf.setFillColorRGB(0.8, 0.1, 0.1)
    pdf.drawString(40, h - 30, MARK)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont(font, 14)
    pdf.drawString(40, h - 60, title)
    pdf.setFont(font, 10)
    y = h - 85
    for s in (f"Организация: {c['name']}", f"ИНН: {c['inn']}", f"Адрес: {c['address']}"):
        pdf.drawString(40, y, s)
        y -= 15
    y -= 10
    for left, right in lines:
        pdf.drawString(40, y, left)
        if right:
            pdf.drawRightString(w - 40, y, right)
        y -= 16
        if y < 60:
            pdf.showPage()
            pdf.setFont(font, 10)
            y = h - 50
    for s in extra or []:
        y -= 6
        pdf.drawString(40, y, s)
        y -= 14
    pdf.save()
    return buf.getvalue()


def _fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def generate(inn: str, kind: str, fmt: str) -> tuple[str, bytes, str]:
    """→ (имя файла, содержимое, MIME-тип)."""
    if not inn_is_valid(inn) or kind not in KINDS or fmt not in KINDS[kind]:
        raise ValueError("Нет такого демо-документа")
    rev, prof, turn, obl, _ = profile(inn)
    c = _company(inn)
    name = f"{kind}_{inn}.{fmt}"
    mime = {"pdf": "application/pdf", "csv": "text/csv; charset=utf-8",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}[fmt]
    if kind == "tax_return":
        cost = int(rev * 0.78)
        rows = [("2110", "Выручка", rev), ("2120", "Себестоимость продаж", -cost), ("2200", "Прибыль от продаж", rev - cost),
                ("2400", "Чистая прибыль", prof)]
        if fmt == "pdf":
            body = [("Код  Показатель", f"За {YEAR} г., руб.")] + [(f"{code}  {n}", _fmt(v)) for code, n, v in rows]
            return name, _pdf(f"Отчёт о финансовых результатах за {YEAR} г.", c, body), mime
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "ОФР"
        ws.append([MARK])
        ws.append([f"Отчёт о финансовых результатах за {YEAR} г.", c["name"], f"ИНН {inn}"])
        ws.append(["Код", "Показатель", f"За {YEAR} г., руб."])
        for code, n, v in rows:
            ws.append([code, n, v])
        out = io.BytesIO()
        wb.save(out)
        return name, out.getvalue(), mime
    if kind == "bank_statement":
        months = _months(inn, turn, obl)
        head = ["Месяц", "Поступления, руб.", "Списания, руб.", "В т.ч. платежи по кредитам, руб."]
        if fmt == "pdf":
            body = [("Месяц", "Поступления, руб.")] + [(m, _fmt(i)) for m, i, _, _ in months]
            body += [("", ""), ("Среднемесячные поступления", _fmt(turn)), ("Платежи по кредитам в месяц", _fmt(obl))]
            return name, _pdf(f"Выписка по расчётному счёту за {YEAR} г. (сводная)", c, body), mime
        if fmt == "csv":
            buf = io.StringIO()
            wr = csv.writer(buf, delimiter=";")
            wr.writerow(head)
            for m, i, o, l in months:
                wr.writerow([m, i, o, l])
            return name, ("\ufeff" + buf.getvalue()).encode("utf-8"), mime
        from openpyxl import Workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "Выписка"
        ws.append([MARK])
        ws.append([f"Выписка по расчётному счёту за {YEAR} г.", c["name"], f"ИНН {inn}"])
        ws.append(head)
        for row in months:
            ws.append(list(row))
        ws.append(["Итого", sum(x[1] for x in months), sum(x[2] for x in months), sum(x[3] for x in months)])
        out = io.BytesIO()
        wb.save(out)
        return name, out.getvalue(), mime
    if kind == "invoice":
        price = max(500_000, round(rev * 0.15 / 10_000) * 10_000)
        body = [("Счёт на оплату № 17 от 01.09." + str(YEAR + 1), ""), ("Поставщик: ООО «ТехноПоставка» (синтетический)", ""),
                ("Оборудование (1 шт.)", _fmt(price)), ("НДС не облагается", ""), ("Итого к оплате", _fmt(price))]
        return name, _pdf("Счёт на оплату", c, body), mime
    if kind == "business_plan":
        body = [("Цель проекта: открытие новой точки продаж", ""), ("Стоимость проекта", _fmt(round(rev * 0.3, -4))),
                ("Срок окупаемости", "24 мес."), ("Прирост выручки в год", _fmt(round(rev * 0.25, -4)))]
        return name, _pdf("Бизнес-план (кратко)", c, body), mime
    body = [("Объект: нежилое помещение, 120 кв. м", ""), ("Собственник: организация-заявитель", ""),
            ("Обременения", "нет"), ("Оценочная стоимость", _fmt(round(rev * 0.4, -4)))]
    return name, _pdf("Выписка из ЕГРН (синтетическая)", c, body), mime


def catalog(inn: str) -> list[dict]:
    from ..products import DOC_KINDS
    _, _, _, _, conflict = profile(inn)
    return [{"kind": k, "label": DOC_KINDS[k], "formats": list(f), "conflict": conflict and k == "bank_statement"} for k, f in KINDS.items()]


def main() -> None:
    ap = argparse.ArgumentParser(description="Синтетические документы под демо-ИНН")
    ap.add_argument("--out", default="samples")
    args = ap.parse_args()
    for key, sc in DEMO_SCENARIOS.items():
        d = Path(args.out) / f"{key}_{sc['inn']}"
        d.mkdir(parents=True, exist_ok=True)
        for kind, fmts in KINDS.items():
            for fmt in fmts:
                fname, data, _ = generate(sc["inn"], kind, fmt)
                (d / fname).write_bytes(data)
        print(d)


if __name__ == "__main__":
    main()
