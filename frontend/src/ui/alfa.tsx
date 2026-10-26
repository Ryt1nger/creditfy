import { Children, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IArrow, ICheck, IX } from './Icons'
import { useProducts } from '../api/hooks'
import { months, pct, rub } from '../lib/format'

/** Знак «А» и подчёркивание в духе бренда — рисованный упрощённый, без использования оригинального логотипа. */
export const Logo = ({ h = 34 }: { h?: number }) => (
  <svg height={h} viewBox="0 0 36 38" role="img" aria-label="Альфа-Банк" fill="#EF3124">
    <path fillRule="evenodd" d="M3 29 14.6 2h6.8L33 29h-6.4l-2.2-5.4H11.6L9.4 29zM13.9 18.6h8.2L18 8.4z" />
    <rect x="3" y="33" width="30" height="3.4" rx="1" />
  </svg>
)

export const StarMark = () => (
  <svg viewBox="0 0 100 100" aria-hidden fill="#EF3124"><path d="M50 0C54 30 70 46 100 50 70 54 54 70 50 100 46 70 30 54 0 50 30 46 46 30 50 0Z" /></svg>
)
export const StarBadge = () => <div className="star" aria-hidden><StarMark /></div>

export const Cubes = () => (
  <div className="cubes" aria-hidden>
    <i className="cube lime c1" /><i className="cube purple c2" /><i className="cube white c3" /><i className="cube blue c4" />
  </div>
)

export function TitleBar({ children, small }: { children: ReactNode; small?: boolean }) {
  const lines = Children.toArray(children).filter((c) => typeof c !== 'object' || (c as any).type !== 'br')
  return <div className="titlebar"><h1 className={'display' + (small ? ' sm' : '')} key={lines.join('|')}>{lines.map((l, i) => <span className="ln" key={i}><span>{l}</span></span>)}</h1><Cubes /><StarBadge /></div>
}

const HINTS = ['На что нужны деньги твоему бизнесу?', 'Например: закупить товар к сезону', 'Например: открыть вторую точку', 'Например: купить печь и холодильник', 'Например: закрыть кассовый разрыв']
export function AssistantBox({ value, onChange, onSubmit, busy, placeholder, label = 'Помощник по продуктам' }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; busy?: boolean; placeholder?: string; label?: string
}) {
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % HINTS.length), 3200); return () => clearInterval(t) }, [])
  placeholder = placeholder ?? HINTS[i]
  return (
    <form className="ai" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
      <span className="ico"><StarMark /></span>
      <div className="mid"><div className="lab">{label}</div><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label="Задача для подбора кредита" /></div>
      <button className="btn primary lg" type="submit" disabled={busy}>{busy ? 'Подбираем…' : 'Подобрать кредит'} <IArrow /></button>
    </form>
  )
}

export const SHORT: Record<string, { name: string; sub: string; pick: string }> = {
  working_capital: { name: 'Бизнес-кредит без залога', sub: 'До 30 млн ₽ на закупки и текущие расходы', pick: 'оборотный' },
  investment: { name: 'Бизнес-кредит с залогом', sub: 'До 150 млн ₽ на развитие бизнеса', pick: 'инвестиционный' },
  overdraft: { name: 'Овердрафт', sub: 'На платежи до поступления выручки', pick: 'овердрафт' },
  equipment: { name: 'Кредит на оборудование без залога', sub: 'Станки, техника и транспорт', pick: 'кредит на оборудование' },
}

const DECO = ['lime', 'white', 'purple', 'blue']
export function ProductCard({ name, sub, tag, on, onClick, onMore, i = 0 }: { name: string; sub: string; tag?: string; on?: boolean; onClick: () => void; onMore?: () => void; i?: number }) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <button ref={ref} className={'pcard' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on}
      onMouseMove={(e) => { const r = ref.current!.getBoundingClientRect(); ref.current!.style.setProperty('--mx', e.clientX - r.left + 'px'); ref.current!.style.setProperty('--my', e.clientY - r.top + 'px') }}>
      <i className={'cube pc ' + DECO[i % DECO.length]} aria-hidden />
      {tag && <span className="tg">{tag}</span>}
      <h3>{name}</h3><span className="sub">{sub}</span>
      <span className="more"><span role="button" tabIndex={0} className="morebtn" onClick={(e) => { if (onMore) { e.stopPropagation(); onMore() } }} onKeyDown={(e) => { if (onMore && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); onMore() } }}>Подробнее</span><span className="go"><IArrow size={20} /></span></span>
    </button>
  )
}

export const WIZ_STEPS = ['Задача и продукт', 'Сумма и срок', 'Компания', 'Финансы', 'Документы и отправка']
export function WizSteps({ step }: { step: number }) {
  return (
    <div className="wsteps" role="list" aria-label="Шаги заявки">
      {WIZ_STEPS.map((t, i) => (
        <div key={t} className={'w' + (i <= step ? ' reached' : '') + (i === step ? ' on' : '')} role="listitem" aria-current={i === step ? 'step' : undefined}>
          <div className="top"><span className="n">{i + 1}</span><span>{t}</span></div><div className="bar" />
        </div>
      ))}
    </div>
  )
}

export function CountUp({ to, suffix = '', prefix = '' }: { to: number; suffix?: string; prefix?: string }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0; const t0 = performance.now(); const d = 1400
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / d); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf)
  }, [to])
  return <>{prefix}{v.toLocaleString('ru-RU')}{suffix}</>
}

export function Ticker({ items }: { items: string[] }) {
  const row = items.map((t) => <span key={t}><b>✦</b>{t}</span>)
  return <div className="ticker" aria-hidden><div className="track">{row}{row}{row}{row}</div></div>
}

const ABOUT: Record<string, { lead: string; use: string[] }> = {
  working_capital: { lead: 'Деньги на закупки, зарплаты, аренду и другие регулярные расходы. Зачисляются на расчётный счёт.', use: ['Закупка товара к сезону', 'Пополнение оборотных средств', 'Аренда, реклама, зарплаты'] },
  investment: { lead: 'Для развития бизнеса: новая точка, ремонт, расширение производства. Подходит для крупных и долгих задач.', use: ['Открытие новой точки', 'Ремонт и обновление помещения', 'Запуск нового направления'] },
  equipment: { lead: 'Покупка станков, техники и автомобилей. Купленное оборудование можно оформить в залог.', use: ['Станки и производственная техника', 'Грузовой и легковой транспорт', 'Торговое и холодильное оборудование'] },
  overdraft: { lead: 'Краткосрочный лимит на кассовый разрыв: помогает оплатить счета до поступления выручки.', use: ['Платёж поставщику до оплаты клиентом', 'Выплата зарплаты в сезонный спад', 'Срочные расходы на короткий срок'] },
}
const annuity = (a: number, t: number, r: number) => { const m = r / 1200; return m ? (a * m) / (1 - Math.pow(1 + m, -t)) : a / t }

/** Модальное окно «Подробнее» о кредитном продукте. */
export function ProductDetails({ code, onClose, onPick }: { code: string; onClose: () => void; onPick: (code: string) => void }) {
  const { data: products } = useProducts(); const p = products?.find((x) => x.code === code)
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); document.addEventListener('keydown', h); const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.removeEventListener('keydown', h); document.body.style.overflow = o } }, [onClose])
  if (!p) return null
  const sh = SHORT[code]; const ab = ABOUT[code]
  const ex = Math.min(Math.max(2_000_000, p.min_amount), p.max_amount); const et = Math.min(Math.max(24, p.min_term), p.max_term)
  return (
    <div className="pm-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pm" role="dialog" aria-modal aria-label={sh?.name ?? p.name}>
        <div className="pm-head">
          <i className="cube lime pm-c1" /><i className="cube white pm-c2" />
          <button className="pm-x" onClick={onClose} aria-label="Закрыть"><IX size={20} /></button>
          <span className="pm-tag">Кредитный продукт</span>
          <h3>{sh?.name ?? p.name}</h3>
          <p>{ab?.lead ?? p.tagline}</p>
        </div>
        <div className="pm-body">
          <div className="pm-facts">
            <div><small>Ставка</small><b>от {pct(p.base_rate)}</b></div>
            <div><small>Сумма</small><b>{rub(p.min_amount)} – {rub(p.max_amount)}</b></div>
            <div><small>Срок</small><b>{code === 'overdraft' ? 'Транш 60/90 дней' : p.min_term === p.max_term ? months(p.min_term) : `${p.min_term}–${p.max_term} мес.`}</b></div>
            <div><small>Обеспечение</small><b>{p.allows_collateral ? 'Залог обязателен' : 'Без залога'}</b></div>
          </div>
          <div className="pm-cols">
            <section><h5>Для чего подходит</h5><ul>{ab?.use.map((t) => <li key={t}><ICheck size={14} />{t}</li>)}</ul></section>
            <section><h5>Что понадобится</h5><ul>{p.docs.map((d) => <li key={d.kind}><ICheck size={14} />{d.label}</li>)}<li><ICheck size={14} />ИНН и финансовые показатели</li></ul></section>
          </div>
          <section className="pm-rate"><h5>Публичные условия</h5>
            <p>Без дополнительных услуг — от <b>{pct(p.base_rate)}</b>. {p.conditional_rate != null && <>Со скидкой — от <b>{pct(p.conditional_rate)}</b>: {p.discount_conditions}.</>}</p>
            {p.source_url && <a href={p.source_url} target="_blank" rel="noreferrer">Условия на сайте Альфа-Банка</a>}
            <p className="small muted">На {p.verified_on}. Не оферта. Расчёты и решения кабинета используют учебную политику Creditfy.</p>
          </section>
          {code !== 'overdraft' && <div className="pm-ex"><small>Пример</small><span>{rub(ex)} на {months(et)} — около <b>{rub(Math.round(annuity(ex, et, p.base_rate)))}</b> в месяц при ставке {pct(p.base_rate)}</span></div>}
          <p className="pm-note">{code === 'overdraft' && 'Проценты зависят от фактически использованного лимита и числа дней. Аннуитетный график не применяется. Оформление этого продукта в текущей версии недоступно. '}Предварительные условия. Выбор продукта не означает одобрение — итоговая ставка и сумма зависят от проверки.</p>
        </div>
        <div className="pm-foot"><button className="btn light" onClick={onClose}>Закрыть</button>{code !== 'overdraft' && <button className="btn primary lg" onClick={() => onPick(code)}>Оформить {sh?.pick ?? 'кредит'} <IArrow /></button>}</div>
      </div>
    </div>
  )
}
