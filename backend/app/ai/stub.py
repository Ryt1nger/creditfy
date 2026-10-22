"""Заглушка ИИ: детерминированные шаблоны и ключевые слова. НЕ нейросеть.

В интерфейсе все её ответы помечаются «ИИ-модуль (заглушка)», чтобы никто не принял шаблон за вывод модели.
"""
from .base import AiText, DocExtraction, ProductRecommendation


class StubProvider:
    name = "stub"
    is_stub = True

    def recommend_products(self, need_text, amount, products):
        text = (need_text or "").lower()
        out = []
        for p in products:
            hits = [k for k in p["keywords"] if k in text]
            score = len(hits) * 1.0
            if amount and p["min_amount"] <= amount <= p["max_amount"]:
                score += 0.5
            elif amount:
                score -= 1.0
            reason = (
                f"В описании есть признаки: {', '.join(hits[:3])}" if hits else "Подходит как универсальный вариант"
            )
            out.append(ProductRecommendation(p["code"], round(score, 2), reason))
        out.sort(key=lambda r: r.score, reverse=True)
        return out

    def summarize_for_underwriter(self, ctx):
        c, a, s = ctx["company"], ctx["application"], ctx.get("score")
        parts = [
            f"{c['name']} (ИНН {c['inn']}), бизнесу {c.get('age_months', '?')} мес., статус в реестре: {c.get('status', '—')}.",
            f"Запрос: {a['amount']:,} ₽ на {a['term_months']} мес. по продукту «{a['product']}».".replace(",", " "),
        ]
        if s:
            parts.append(
                f"Скоринг: {s['score']} баллов, класс {s['grade']}, маршрут «{s['route']}». "
                f"DSCR при запрошенных условиях: {s['dscr'] if s['dscr'] is not None else 'н/д'}."
            )
            if s["stop_factors"]:
                parts.append("Стоп-факторы: " + "; ".join(x["name"] for x in s["stop_factors"]) + ".")
            neg = [f for f in s["factors"] if f["points"] < 0]
            if neg:
                parts.append("Что снижает оценку: " + "; ".join(f["name"] for f in neg[:3]) + ".")
            if s["flags"]:
                parts.append("Проверьте: " + "; ".join(s["flags"]) + ".")
        parts.append("(Сводка собрана по шаблону — ИИ-модуль пока не подключён.)")
        return AiText(" ".join(parts), source="stub")

    def explain_status_for_client(self, ctx):
        return AiText(ctx.get("fallback", ""), source="stub")

    def extract_document(self, kind, filename, content):
        return DocExtraction(status="not_available", note="Автоматическое распознавание документов подключается позже.")
