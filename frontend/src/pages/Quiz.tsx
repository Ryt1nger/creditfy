import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useProducts } from '../api/hooks'
import type { ApplicationDetail, IntakeSession, QuizOption, QuizQuestion, Suggestion } from '../api/types'
import fields from '../config/fields.json'
import { Loading, useToast } from '../ui/kit'
import { IArrow, ICheck } from '../ui/Icons'
import { AssistantBox, ProductCard, ProductDetails, SHORT, StarMark, TitleBar } from '../ui/alfa'
import { months, num, rub } from '../lib/format'
import { parseNeed } from '../lib/need'

interface Help { q: string; matched: boolean; answer: string; suggestions: string[] }
const QWORDS = /^(как|что|какие|какой|какая|какое|сколько|почему|где|когда|можно|нужен|нужна|нужно ли|нужны|есть ли|чем|зачем|кто|а если)\b/i
const looksLikeQuestion = (t: string) => t.includes('?') || QWORDS.test(t.trim())

const CHIPS = ['Закупить товар', 'Купить оборудование', 'Открыть новую точку', 'Закрыть кассовый разрыв']
const SRC: Record<string, string> = { text: 'из вашего описания', answer: 'ваш ответ', ai: 'понято моделью' }
type Reg = { key: string; question: { text: string; hint?: string; options: QuizOption[]; custom?: { placeholder: string } }; type: string; min?: number; max?: number }
const REG = Object.fromEntries((fields.fields as unknown as Reg[]).map((f) => [f.key, f])) as Record<string, Reg>

function AiTag({ q, ai }: { q: QuizQuestion; ai: IntakeSession['ai'] }) {
  if (q.source !== 'ai') return <span className="qtag bank">Вопрос из готового банка</span>
  return <span className="qtag ai"><i />{ai.simulated || q.simulated ? 'Имитация ИИ-формулировки (демо-режим, модели в браузере нет)' : `Вопрос сформулирован локальной моделью · вызовов ${ai.calls_used} из ${ai.max_calls}`}</span>
}

/** Один вопрос на экране: карточки-ответы или своё число. */
function Question({ q, ai, step, total, onAnswer, onBack, busy }: { q: QuizQuestion; ai: IntakeSession['ai']; step: number; total: number; onAnswer: (v: string | number) => void; onBack?: () => void; busy: boolean }) {
  const [custom, setCustom] = useState('')
  useEffect(() => setCustom(''), [q.field, q.turn_id])
  const cv = Number(custom.replace(/\D/g, ''))
  const bad = custom !== '' && (!cv || (q.min != null && cv < q.min) || (q.max != null && cv > q.max))
  return (
    <section className="wcard qcard" aria-live="polite">
      <div className="qprog" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={step - 1}>
        <span>Вопрос {step} из {total}</span><div className="bar"><i style={{ width: `${((step - 1) / total) * 100}%` }} /></div>
      </div>
      <div><h2>{q.text}</h2>{q.hint && <p className="sub">{q.hint}</p>}</div>
      <div className="qopts">{q.options.map((o) => (
        <button key={String(o.value)} className="qopt" disabled={busy} onClick={() => onAnswer(o.value)}><b>{o.label}</b>{o.hint && <span>{o.hint}</span>}<i><IArrow size={18} /></i></button>
      ))}</div>
      {q.custom && (
        <form className="qcustom" onSubmit={(e) => { e.preventDefault(); if (!bad && custom) onAnswer(cv) }}>
          <input className={'input num' + (bad ? ' err' : '')} inputMode="numeric" placeholder={q.custom.placeholder} value={custom ? num(cv || 0) : ''} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} aria-label={q.custom.placeholder} />
          <button className="btn dark" disabled={!custom || bad || busy} type="submit">Готово</button>
          {bad && <span className="errtext">Допустимо от {num(q.min ?? 0)} до {num(q.max ?? 0)}</span>}
        </form>
      )}
      <div className="wnav" style={{ marginTop: 4 }}>{onBack ? <button className="back" onClick={onBack}>Назад</button> : <span />}<AiTag q={q} ai={ai} /></div>
    </section>
  )
}

function SuggestionCard({ s, main, onPick, busy }: { s: Suggestion; main?: boolean; onPick: () => void; busy: boolean }) {
  return (
    <article className={'sugg' + (main ? ' main' : '')}>
      {main && <span className="demotag">Главный вариант</span>}
      <h3>{SHORT[s.code]?.name ?? s.name}</h3>
      <p className="muted small">{s.tagline}</p>
      <div className="sugg-nums"><div><small>Сумма</small><b>{rub(s.amount)}</b></div><div><small>Срок</small><b>{months(s.term_months)}</b></div><div><small>Ставка</small><b>от {String(s.rate_from).replace('.', ',')}%</b></div><div><small>Платёж ≈</small><b>{rub(s.monthly_payment)}</b></div></div>
      <div><h5>Почему подходит</h5><ul className="ticks">{s.reasons.map((r) => <li key={r}><ICheck size={16} />{r}</li>)}</ul></div>
      {s.caveats.length > 0 && <ul className="caveats">{s.caveats.map((c) => <li key={c}>{c}</li>)}</ul>}
      {main && <div className="small muted">Понадобятся: {s.docs.map((d) => d.label.toLowerCase()).join(', ')}.</div>}
      <button className={'btn lg ' + (main ? 'primary' : 'white2')} disabled={busy} onClick={onPick}>{main ? 'Оформить этот' : 'Выбрать этот'} <IArrow /></button>
    </article>
  )
}

export default function Quiz() {
  const nav = useNavigate(); const toast = useToast(); const qc = useQueryClient(); const loc = useLocation(); const [sp, setSp] = useSearchParams()
  const { data: products } = useProducts()
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false)
  const [s, setS] = useState<IntakeSession | null>(null); const [more, setMore] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null); const [showBad, setShowBad] = useState(false)
  const [help, setHelp] = useState<Help | null>(null)
  const started = useRef(false)
  const sid = sp.get('s')

  const fail = (e: unknown) => toast((e as Error).message, true)
  async function run<T>(f: () => Promise<T>): Promise<T | undefined> { setBusy(true); try { return await f() } catch (e) { fail(e) } finally { setBusy(false) } }
  const toWizard = (a: ApplicationDetail) => { qc.invalidateQueries({ queryKey: ['apps'] }); nav(`/apply/${a.id}`) }

  async function startQuiz(t: string) {
    setHelp(null)
    const r = await run(() => api<IntakeSession>('POST', '/intake/start', { text: t }))
    if (r) { setS(r); setSp({ s: String(r.id) }, { replace: true }) }
  }
  /** Вопрос о продукте («какая ставка?») — отвечаем готовым демо-ответом; описание задачи — запускаем квиз. */
  async function start(t: string) {
    const p = parseNeed(t)
    if (p.goal || p.goal_candidates || p.amount) return startQuiz(t)
    const a = await run(() => api<{ matched: boolean; answer: string; suggestions: string[] }>('POST', '/assistant/ask', { text: t }))
    if (!a) return
    if (a.matched || looksLikeQuestion(t)) { setHelp({ q: t, ...a }); setText(''); return }
    return startQuiz(t)
  }
  async function draftFor(code: string, amount?: number, term?: number) {
    const a = await run(() => api<ApplicationDetail>('POST', '/applications/draft', { product_code: code, amount, term_months: term }))
    if (a) toWizard(a)
  }
  useEffect(() => {
    if (started.current) return
    started.current = true
    const st = (loc.state ?? {}) as { need?: string; code?: string; amount?: number; term?: number; help?: boolean }
    const draft = sp.get('draft')
    if (draft) { nav(`/apply/${draft}`, { replace: true }); return }
    if (sid) { api<IntakeSession>('GET', `/intake/${sid}`).then(setS).catch(() => setSp({}, { replace: true })) }
    else if (st.code) void draftFor(st.code, st.amount, st.term)
    else if (st.need) { setText(st.need); void start(st.need) }
    else if (st.help) { void api<{ matched: boolean; answer: string; suggestions: string[] }>('POST', '/assistant/ask', { text: '' }).then((a) => setHelp({ q: '', ...a })) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo({ top: 0 }) }, [s?.question?.turn_id, s?.status, editing, !!s?.recommendations])

  async function answer(field: string, value: string | number) {
    if (!s) return
    const r = await run(() => api<IntakeSession>('POST', `/intake/${s.id}/answer`, { field, value }))
    if (r) { setS(r); setEditing(null) }
  }
  async function recommend() {
    if (!s) return
    const r = await run(() => api<IntakeSession>('POST', `/intake/${s.id}/recommend`))
    if (r) setS(r)
  }
  async function pick(code: string) {
    if (!s) return
    const a = await run(() => api<ApplicationDetail>('POST', `/intake/${s.id}/application`, { product_code: code }))
    if (a) toWizard(a)
  }
  function reset() { setS(null); setSp({}, { replace: true }); setEditing(null) }

  if (!products) return <Loading h={400} />
  const q = s?.question
  const total = s?.progress.total ?? 0, done = s?.progress.done ?? 0
  // «Назад» — вернуться к последнему ответу и поправить его
  const lastAnswered = s?.history.filter((h) => h.kind !== 'edit').slice(-1)[0]
  const editReg = editing ? REG[editing] : null

  return (
    <div>
      {more && <ProductDetails code={more} onClose={() => setMore(null)} onPick={(c) => { setMore(null); void draftFor(c) }} />}
      <TitleBar>{!s ? 'Подберём кредит под твою задачу' : s.status === 'questions' ? 'Уточним детали' : s.recommendations ? 'Подбор готов' : 'Вот что мы поняли'}</TitleBar>

      {!s && (
        <div className="stack lg swap">
          {help && (
            <section className="helpcard" aria-live="polite">
              <div className="row between wrap"><span className="qtag ai"><i />Помощник · готовый демо-ответ (без ИИ)</span><button className="linkbtn" onClick={() => setHelp(null)}>Закрыть</button></div>
              {help.q && <div className="hq">{help.q}</div>}
              <p className="hans">{help.answer}</p>
              <div className="chips2" style={{ marginTop: 0 }}>{help.suggestions.map((q) => <button key={q} onClick={() => start(q)}>{q}</button>)}</div>
              <div className="row wrap" style={{ gap: 14 }}>{help.q && !help.matched ? null : help.q && <button className="btn primary" disabled={busy} onClick={() => startQuiz(help.q)}>Подобрать кредит под мою задачу <IArrow /></button>}<span className="muted small">Условия демонстрационные, не реальные предложения банка.</span></div>
            </section>
          )}
          <div>
            <AssistantBox value={text} onChange={setText} onSubmit={() => text.trim().length >= 3 && start(text)} busy={busy} label="Опиши задачу или задай вопрос о кредитах" />
            <div className="chips2">{CHIPS.map((c) => <button key={c} onClick={() => start(c)}>{c}</button>)}</div>
            <p className="muted small" style={{ marginTop: 14 }}>Сначала разбираем текст по правилам, затем задаём по одному вопросу карточками. ИИ-модель (если включена) только подсказывает формулировки — подбор и условия считают правила.</p>
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 700 }}>Или выбери продукт самостоятельно</h2>
          <div className="pgrid">{products.map((x, i) => <ProductCard i={i} key={x.code} name={SHORT[x.code]?.name ?? x.name} sub={SHORT[x.code]?.sub ?? x.tagline} on={false} onMore={() => setMore(x.code)} onClick={() => draftFor(x.code)} />)}</div>
        </div>
      )}

      {s && s.status === 'questions' && q && !editing && (
        <div className="swap" key={q.turn_id}>
          <Question q={q} ai={s.ai} step={done + 1} total={total} busy={busy} onAnswer={(v) => answer(q.field, v)}
            onBack={lastAnswered ? () => setEditing(lastAnswered.field) : s.text ? reset : undefined} />
          {s.text && <p className="muted small qnote">Ваш запрос: «{s.text}»</p>}
        </div>
      )}

      {s && editing && editReg && (
        <div className="swap" key={'e' + editing}>
          <Question q={{ turn_id: -1, field: editing, kind: 'edit', text: editReg.question.text, hint: editReg.question.hint ?? null, options: editReg.question.options, custom: editReg.question.custom ?? null, type: editReg.type as 'enum' | 'number', min: editReg.min ?? null, max: editReg.max ?? null, source: 'bank', simulated: false }}
            ai={s.ai} step={1} total={1} busy={busy} onAnswer={(v) => answer(editing, v)} onBack={() => setEditing(null)} />
        </div>
      )}

      {s && s.status !== 'questions' && !editing && s.portrait && !s.recommendations && (
        <div className="stack lg swap">
          <section className="wcard portrait">
            <div className="row between wrap"><span className="demotag">Портрет задачи</span><button className="back linkbtn" onClick={reset}>Начать заново</button></div>
            <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}><span style={{ width: 28, flex: 'none', marginTop: 4 }}><StarMark /></span><h2 style={{ fontSize: 24 }}>{s.portrait.summary}</h2></div>
            <div className="pitems">{s.portrait.items.map((it) => (
              <div key={it.field} className="pitem"><div><small>{it.label}</small><b>{it.value_label}</b><span>{SRC[it.source] ?? it.source}</span></div><button className="linkbtn" onClick={() => setEditing(it.field)}>Изменить</button></div>
            ))}</div>
            <div className="wnav"><span className="muted small">Всё верно? Это только подсказка — условия определит банк.</span><button className="btn primary lg" disabled={busy} onClick={recommend}>{busy ? 'Подбираем…' : 'Показать подбор'} <IArrow /></button></div>
          </section>
        </div>
      )}

      {s && s.status !== 'questions' && !editing && s.recommendations && (
        <div className="stack lg swap">
          <section className="portrait-mini"><StarMark /><span>{s.portrait?.summary}</span><button className="linkbtn" onClick={() => { setS({ ...s, recommendations: null }) }}>Изменить задачу</button></section>
          {s.recommendations.primary ? (
            <div className="sugg-grid">
              <SuggestionCard s={s.recommendations.primary} main busy={busy} onPick={() => pick(s.recommendations!.primary!.code)} />
              <div className="stack">{s.recommendations.alternatives.length > 0 && <h4 style={{ margin: '0 0 -6px' }}>Запасные варианты</h4>}
                {s.recommendations.alternatives.map((a) => <SuggestionCard key={a.code} s={a} busy={busy} onPick={() => pick(a.code)} />)}</div>
            </div>
          ) : <div className="pinkalert"><b>Подходящего продукта не нашлось</b><span>Измените сумму, срок или форму бизнеса — ниже причины.</span></div>}
          {s.recommendations.not_suitable.length > 0 && (
            <div className="muted small"><button className="linkbtn" onClick={() => setShowBad(!showBad)}>{showBad ? 'Скрыть' : 'Почему не подошли остальные'} ({s.recommendations.not_suitable.length})</button>
              {showBad && <ul className="caveats" style={{ marginTop: 8 }}>{s.recommendations.not_suitable.map((n) => <li key={n.code}><b>{SHORT[n.code]?.name ?? n.name}:</b> {n.why.join('; ')}</li>)}</ul>}</div>
          )}
          <p className="muted small">{s.recommendations.note} {s.recommendations.disclaimer}.</p>
        </div>
      )}
    </div>
  )
}
