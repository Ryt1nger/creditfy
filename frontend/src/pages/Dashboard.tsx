import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMyApps, useProducts } from '../api/hooks'
import { AssistantBox, CountUp, ProductCard, ProductDetails, SHORT, StarMark, TitleBar } from '../ui/alfa'
import { IArrow, ICheck } from '../ui/Icons'
import { months, pct, rub } from '../lib/format'

const CHIPS = ['Закупить товар', 'Купить оборудование']
const CHECKS = ['ИНН компании или ИП', 'Выручка и прибыль за последний год', 'Средний оборот по счёту', 'Выписка по счёту за 12 месяцев', 'Налоговая декларация или отчётность']
const FAQ = [['Сколько занимает рассмотрение?', 'В демо простые заявки решаются автоматически за несколько секунд, сложные уходят кредитному специалисту.'], ['Одобрение гарантировано?', 'Нет. Выбор продукта не означает одобрение — решение принимается после проверки данных и оценки риска.'], ['Что если не хватает документов?', 'Заявку можно отправить сразу. Банк пришлёт запрос на недостающее, и рассмотрение продолжится после вашего ответа.'], ['Нужны ли звонки и SMS?', 'Нет. Все уведомления приходят в кабинет, подписание договора тоже онлайн.']]

const FLOW = [
  ['Описываешь задачу', 'Подскажем продукт и покажем платёж до отправки', '~2 мин'],
  ['Проверяем данные', 'Сверяем с реестрами автоматически, без звонков', 'секунды'],
  ['Оцениваем риск', 'Прозрачный скоринг: видно, что повлияло на балл', 'секунды'],
  ['Решение и деньги', 'Подписываешь онлайн, график платежей — в кабинете', 'онлайн'],
]
function Typer({ text }: { text: string }) {
  const [n, setN] = useState(0)
  useEffect(() => { const t = setInterval(() => setN((x) => Math.min(text.length, x + 1)), 55); return () => clearInterval(t) }, [text])
  return <>{text.slice(0, n)}<span className="caret" /></>
}
function Preview({ i, on }: { i: number; on: boolean }) {
  // key перезапускает анимацию при активации шага
  if (i === 0) return <div className="pv" key={'p0' + on}><div className="pv-in">{on ? <Typer text="Нужно закупить товар к сезону" /> : 'Нужно закупить товар к сезону'}</div><div className="pv-chip" style={on ? { animation: 'pop .5s 1.9s both' } : undefined}><StarMark />Оборотный кредит</div></div>
  if (i === 1) return <div className="pv pv-reg" key={'p1' + on}>{['ЕГРЮЛ', 'БКИ', 'ФНС'].map((t, k) => <div key={t} className={on ? 'seq' : ''} style={{ ['--k' as any]: k }}><span className="sp" /><ICheck size={14} />{t}</div>)}</div>
  if (i === 2) return <div className="pv pv-score" key={'p2' + on}><div className={'ring' + (on ? ' fill' : '')}><b>{on ? <CountUp to={742} /> : 742}</b></div><div><b>Класс A</b><small>решение — автоматом</small></div></div>
  return <div className="pv pv-sign" key={'p3' + on}><div className="sg" style={on ? { animation: 'pop .5s .4s both' } : undefined}><ICheck size={16} />Договор подписан</div><div className="mn"><small>зачислено</small><b>{on ? <CountUp to={4000000} suffix=" ₽" /> : '4 000 000 ₽'}</b></div></div>
}
function HowFlow() {
  const [act, setAct] = useState(0); const [hold, setHold] = useState(false); const [seen, setSeen] = useState(false); const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen((v) => { if (!v) setAct(0); return true }) } else setSeen(false) }, { threshold: 0.35 })
    io.observe(el); return () => io.disconnect()
  }, [])
  return (
    <section id="flow" ref={ref} className={'flow' + (seen && !hold ? ' go' : '')} onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)}>
      <div className="flow-head"><div><span className="kicker">Путь заявки</span><h2>Как проходит заявка</h2></div><p>Четыре шага от идеи до денег на счёте. Статус виден в кабинете на каждом.</p><Link to="/apply" className="btn primary">Начать <IArrow /></Link></div>
      <div className="flow-track">
        <div className="line"><i style={{ width: (act / 3) * 100 + '%' }} /></div>
        {FLOW.map(([t, d, tm], i) => (
          <button key={t} className={'fstep' + (i === act ? ' on' : i < act ? ' past' : '')} onClick={() => setAct(i)} aria-label={t}>
            <span className="dot">{i < act ? <ICheck size={18} /> : i + 1}</span>
            <span className="fc">
              {i === act && <i className="pbar" key={'b' + act} onAnimationEnd={() => setAct((x) => (x + 1) % 4)} />}
              <span className="tm">{tm}</span><b>{t}</b><span className="d">{d}</span><Preview i={i} on={i === act && seen} />
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

function CalcMini({ rate, onGo }: { rate: number; onGo: (amount: number, term: number) => void }) {
  const [amt, setAmt] = useState(2_000_000); const [term, setTerm] = useState(24)
  const r = rate / 1200; const pay = Math.round((amt * r) / (1 - Math.pow(1 + r, -term)))
  const pc = (v: number, lo: number, hi: number) => ((v - lo) / (hi - lo)) * 100 + '%'
  return (
    <article className="bx b-counter">
      <h4>Посчитай платёж</h4><p>Подвигай ползунки — платёж пересчитается сразу.</p>
      <div className="cm">
        <label><span>Сумма</span><b>{rub(amt)}</b></label>
        <input type="range" min={300000} max={10000000} step={100000} value={amt} style={{ ['--p' as any]: pc(amt, 300000, 10000000) }} onChange={(e) => setAmt(Number(e.target.value))} aria-label="Сумма" />
        <label><span>Срок</span><b>{months(term)}</b></label>
        <input type="range" min={6} max={36} step={1} value={term} style={{ ['--p' as any]: pc(term, 6, 36) }} onChange={(e) => setTerm(Number(e.target.value))} aria-label="Срок" />
      </div>
      <div className="cm-out"><div><small>платёж в месяц</small><b>≈ {rub(pay)}</b></div><button className="btn primary" onClick={() => onGo(amt, term)}>Оформить <IArrow /></button></div>
      <small className="cm-note">Предварительный расчёт при ставке от {pct(rate)}. Итоговые условия — после проверки.</small>
    </article>
  )
}

const WSTEPS = ['Сумма и срок', 'Компания', 'Документы', 'Проверка', 'Отправка']

/** Вкладка «Продукты» — главная кабинета (макет 1–2) + расширенный контент. */
export default function Home() {
  const nav = useNavigate(); const { data } = useMyApps(); const { data: products } = useProducts()
  const [more, setMore] = useState<string | null>(null)
  const [need, setNeed] = useState(''); const [ticked, setTicked] = useState<number[]>([0])
  const draft = data?.find((a) => a.status === 'DRAFT')
  const go = (text: string) => nav('/apply', { state: { need: text } })
  const main = (products ?? []).filter((p) => p.code !== 'equipment')
  const toggle = (i: number) => setTicked((t) => (t.includes(i) ? t.filter((x) => x !== i) : [...t, i]))
  return (
    <div>
      {draft ? <TitleBar>Продолжим начатое</TitleBar> : <TitleBar>{'Твой бизнес'}{'новые возможности с ИИ'}</TitleBar>}
      {draft && (
        <section className="draft">
          <div>
            <h3>{SHORT[draft.product_code]?.name ?? draft.product_name}</h3>
            <div className="row" style={{ marginTop: 10 }}><span className="pill red">Черновик</span><span className="muted small">Продолжим с шага {draft.wizard_step || 1} из 5 · {WSTEPS[(draft.wizard_step || 1) - 1]}</span></div>
            <div className="mini" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>{WSTEPS.map((t, i) => <div key={t} className={i + 1 < (draft.wizard_step || 1) ? 'done' : i + 1 === (draft.wizard_step || 1) ? 'cur' : ''}>{i + 1} {t}</div>)}</div>
          </div>
          <Link to={`/apply/${draft.id}`} className="btn primary lg" style={{ minWidth: 240, justifyContent: 'space-between' }}>Продолжить с шага {draft.wizard_step || 1} <IArrow /></Link>
        </section>
      )}
      <AssistantBox value={need} onChange={setNeed} onSubmit={() => go(need)} />
      <div className="chips2">{CHIPS.map((c) => <button key={c} onClick={() => go(c)}>{c}</button>)}</div>
      <div className="sec"><h2>Кредитные решения</h2><Link to="/apply">Все продукты <IArrow size={22} /></Link></div>
      <div className="pgrid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {main.map((p, i) => <ProductCard i={i} key={p.code} name={SHORT[p.code].name} sub={SHORT[p.code].sub} onMore={() => setMore(p.code)} onClick={() => nav('/apply', { state: { code: p.code } })} />)}
      </div>
      {more && <ProductDetails code={more} onClose={() => setMore(null)} onPick={(c) => nav('/apply', { state: { code: c } })} />}
      <p className="muted small" style={{ marginTop: 24 }}>Выбери продукт самостоятельно или начни с подбора по задаче</p>

      {/* ── пошаговый проход: живая дорожная карта ── */}
      <HowFlow />

      {/* ── бенто «Почему удобно» ── */}
      <div className="sec" id="why"><h2>Прозрачно и под контролем</h2></div>
      <div className="bento">
        <CalcMini rate={products?.find((p) => p.code === 'working_capital')?.base_rate ?? 17.5} onGo={(amount, term) => nav('/apply', { state: { code: 'working_capital', amount, term } })} />
        <article className="bx b-score">
          <h4>Прозрачный скоринг</h4><p>Видно, какие факторы и сколько баллов они дали.</p>
          <div className="bars">{[['Возраст бизнеса', 60], ['Рентабельность', 50], ['Просрочки', 40], ['Налоги', 20]].map(([t, v]: any) => <div key={t}><span>{t}</span><i><b style={{ width: v + '%' }} /></i><em>+{v}</em></div>)}</div>
          <div className="grade"><b>A</b><span>742 балла</span></div>
        </article>
      </div>

      {/* ── условия ── */}
      {products && (<>
        <div className="sec" id="rates"><h2>Условия по продуктам</h2><Link to="/apply">Подать заявку <IArrow size={22} /></Link></div>
        <div className="rates">
          {products.map((p, i) => {
            const max = 30_000_000
            return (
              <Link to="/apply" state={{ code: p.code }} key={p.code} className={'rate' + (i === 0 ? ' hot' : '')}>
                {i === 0 && <span className="hotb">Популярный</span>}
                <div className="r-name">{SHORT[p.code]?.name ?? p.name}</div>
                <div className="r-big"><small>от</small>{pct(p.base_rate)}</div>
                <div className="r-range"><i><b style={{ left: (p.min_amount / max) * 100 + '%', width: Math.max(6, ((p.max_amount - p.min_amount) / max) * 100) + '%' }} /></i><span>{rub(p.min_amount)} – {rub(p.max_amount)}</span></div>
                <div className="r-chips"><span>{p.min_term === p.max_term ? months(p.min_term) : `${p.min_term}–${p.max_term} мес.`}</span><span>{p.fee_pct ? `комиссия ${pct(p.fee_pct)}` : 'без комиссии'}</span><span>{p.allows_collateral ? 'с залогом' : 'без залога'}</span></div>
              </Link>
            )
          })}
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>Демонстрационные условия. Итоговая ставка зависит от оценки компании и залога.</p>
      </>)}

      {/* ── чек-лист и вопросы ── */}
      <div className="two">
        <section className="panel ready">
          <h3>Что подготовить</h3>
          <p className="small">Отмечай, что уже есть под рукой</p>
          <div className="meter2"><i style={{ width: (ticked.length / CHECKS.length) * 100 + '%' }} /></div>
          <ul className="checks">{CHECKS.map((t, i) => <li key={t} className={ticked.includes(i) ? 'on' : ''} onClick={() => toggle(i)} role="checkbox" aria-checked={ticked.includes(i)} tabIndex={0} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && toggle(i)}><span className="bx2"><ICheck size={16} /></span>{t}</li>)}</ul>
          <div className="rd-foot"><b>{ticked.length === CHECKS.length ? 'Всё готово!' : `Готово ${ticked.length} из ${CHECKS.length}`}</b><Link to="/apply" className="btn dark">Начать заявку <IArrow /></Link></div>
        </section>
        <section className="panel faqp" id="faq">
          <h3>Частые вопросы</h3>
          {FAQ.map(([q, a], i) => <details key={q} className="faq"><summary><em>0{i + 1}</em>{q}<span className="pm" /></summary><p>{a}</p></details>)}
        </section>
      </div>
    </div>
  )
}
