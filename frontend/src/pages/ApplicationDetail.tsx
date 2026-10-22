import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp, useAct } from '../api/hooks'
import { uploadDocument } from '../api/client'
import type { ApplicationDetail as D, InfoRequest, Offer } from '../api/types'
import { ErrorBox, Loading, Modal, Stepper, StatusIcon, StatusPill, useToast } from '../ui/kit'
import { IArrow, IBack, ICheck, IDoc, ISpark, IUpload } from '../ui/Icons'
import { dateOnly, dt, fileSize, months, pct, rub } from '../lib/format'

export function Timeline({ events }: { events: D['events'] }) {
  const ev = [...events].reverse()
  return (
    <div className="tl">{ev.map((e, i) => (
      <div key={e.id} className={'e' + (i === 0 ? ' last' : '') + (e.client_visible ? '' : ' int')}>
        <span className="d" /><div><div style={{ fontWeight: 600 }}>{e.title}{!e.client_visible && <span className="pill" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}>внутреннее</span>}</div>
          {e.detail && <div className="small muted">{e.detail}</div>}<div className="tiny muted">{dt(e.ts)} · {e.actor}</div></div>
      </div>))}</div>
  )
}

function OfferCard({ a, o, act, busy }: { a: D; o: Offer; act: (path: string, body?: unknown) => void; busy: boolean }) {
  const [decline, setDecline] = useState(false)
  const changed = o.kind === 'counter'
  return (
    <section className="offer-card stack lg">
      <div className="row between wrap"><span className="tag">{changed ? 'Встречное предложение' : 'Одобрено'}</span><span className="small" style={{ opacity: 0.7 }}>Действует до {dateOnly(o.valid_until)}</span></div>
      <div><div className="k">Сумма кредита</div><div className="sum num" style={{ fontSize: 52 }}>{rub(o.amount)}</div></div>
      <div className="grid g4" style={{ gap: 20 }}>
        <div><div className="k">Срок</div><div className="v">{months(o.term_months)}</div></div><div><div className="k">Ставка</div><div className="v">{pct(o.rate)}</div></div>
        <div><div className="k">Платёж в месяц</div><div className="v num">{rub(o.monthly_payment)}</div></div><div><div className="k">Комиссия</div><div className="v num">{rub(o.fee)}</div></div>
      </div>
      {changed && (
        <div className="cmp" style={{ background: 'rgba(255,255,255,.08)', borderRadius: 18, padding: 16 }}>
          <div><div className="k">Вы просили</div><div style={{ fontWeight: 700 }}>{rub(a.amount)} · {months(a.term_months)}</div></div><span className="arrow"><IArrow /></span>
          <div><div className="k">Банк предлагает</div><div style={{ fontWeight: 700, color: 'var(--lime)' }}>{rub(o.amount)} · {months(o.term_months)}</div></div>
        </div>)}
      {o.explanation && <p className="small" style={{ opacity: 0.85 }}>{o.explanation}</p>}
      <div className="row wrap">
        <button className="btn primary lg" disabled={busy} onClick={() => act('/offer/accept')}><ICheck /> Принять условия</button>
        <button className="btn lg" style={{ background: 'rgba(255,255,255,.12)', color: '#fff' }} disabled={busy} onClick={() => setDecline(true)}>Отказаться</button>
      </div>
      {decline && <Modal title="Отказаться от предложения?" onClose={() => setDecline(false)}><p className="muted">Заявка будет закрыта. Позже можно подать новую с другими параметрами.</p><div className="row"><button className="btn dark" onClick={() => { setDecline(false); act('/offer/decline', {}) }}>Да, отказаться</button><button className="btn light" onClick={() => setDecline(false)}>Вернуться</button></div></Modal>}
    </section>
  )
}

function InfoForm({ a, r, act, busy }: { a: D; r: InfoRequest; act: (path: string, body?: unknown) => void; busy: boolean }) {
  const toast = useToast(); const [vals, setVals] = useState<Record<string, string>>({}); const [text, setText] = useState(''); const [up, setUp] = useState(false)
  const uploaded = (k?: string) => a.documents.some((d) => d.kind === k && d.status !== 'rejected')
  const { mutate } = useAct(a.id)
  async function addDoc(kind: string, f: File) { setUp(true); try { await uploadDocument(a.id, kind, f); mutate({ method: 'GET', path: `/applications/${a.id}` }) } catch (e) { toast((e as Error).message, true) } finally { setUp(false) } }
  return (
    <section className="card accent stack">
      <div className="row"><span className="tag">Запрос банка</span><span className="tiny muted">{dt(r.created_at)} · {r.created_by === 'Система' ? 'автоматическая проверка' : r.created_by}</span></div>
      <h3>{r.message}</h3>
      <div className="stack">
        {r.items.map((it, i) => it.type === 'document' ? (
          <div key={i} className="docrow"><span className="ico">{uploaded(it.key) ? <ICheck style={{ color: 'var(--green)' }} /> : <IDoc />}</span><div className="grow"><b>{it.label}</b></div>
            {uploaded(it.key) ? <span className="pill green">Загружено</span> : <button className="btn sm outline" disabled={up} onClick={() => addDoc(it.key!, new File(['demo'], `${it.key}.pdf`, { type: 'application/pdf' }))}><IUpload size={16} /> Приложить образец</button>}</div>
        ) : it.type === 'field' ? (
          <div key={i} className="field"><label>{it.label}</label><input className="input num" inputMode="numeric" value={vals[it.key!] ?? ''} onChange={(e) => setVals({ ...vals, [it.key!]: e.target.value.replace(/[^\d\w\s+\-А-Яа-я]/g, '') })} /></div>
        ) : null)}
        <div className="field"><label>Комментарий для банка (необязательно)</label><textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Например, пояснение по расхождению в данных" /></div>
      </div>
      <button className="btn primary lg" disabled={busy} onClick={() => act(`/info-requests/${r.id}/answer`, { answer: text || null, fields: Object.fromEntries(Object.entries(vals).filter(([, v]) => v !== '')) })}>Отправить ответ <IArrow /></button>
    </section>
  )
}

export default function ApplicationDetail() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast()
  const { data: a, error, refetch } = useApp(id!); const m = useAct(Number(id))
  const [consent, setConsent] = useState(false)
  if (error) return <ErrorBox error={error} retry={refetch} />
  if (!a) return <div className="stack"><Loading h={220} /><Loading h={300} /></div>
  const act = (path: string, body?: unknown) => m.mutate({ method: 'POST', path: `/applications/${a.id}${path}`, body }, { onError: (e) => toast((e as Error).message, true) })
  const open = a.info_requests.filter((r) => r.status === 'open'); const offer = a.offers.find((o) => o.status === 'proposed' || o.status === 'accepted')
  const bad = ['REJECTED', 'EXPIRED'].includes(a.status), running = a.processing || (a.group === 'progress' && a.status !== 'MANUAL_REVIEW')
  return (
    <div className="stack lg">
      <div className="row"><button className="btn light sm" onClick={() => nav('/applications')}><IBack size={18} /> Все заявки</button></div>
      <section className="status-hero">
        <div className="row between wrap"><div><span className="tiny muted">{a.number}</span><h1 style={{ fontSize: 'clamp(26px,3.4vw,38px)', marginTop: 4 }}>{a.product_name}</h1><div className="muted">{a.company?.name} · ИНН {a.company?.inn}</div></div><div style={{ textAlign: 'right' }}><div className="sum num">{rub(a.amount)}</div><div className="muted small">на {months(a.term_months)}</div></div></div>
        <Stepper steps={a.steps} current={a.step} status={a.status} running={running} />
        <div className="big"><StatusIcon a={a} /><div className="grow"><div className="row wrap"><h2>{a.status_label}</h2><StatusPill a={a} /></div><p className="muted" style={{ marginTop: 6 }}>{a.hint}</p></div></div>
        <div className="explain"><div><small>Что происходит</small><p>{a.what}</p></div><div className={a.needs_action ? 'need' : ''}><small>Нужно ли действие от вас</small><p><b>{a.needs_action ? 'Да.' : 'Нет.'}</b> {a.action_text}</p></div></div>
        {a.processing && <div className="callout"><div className="spinner" /><div className="small">Идёт автоматическая проверка — страница обновится сама. Можно не ждать: уведомим в кабинете.</div></div>}
      </section>

      {open.map((r) => <InfoForm key={r.id} a={a} r={r} act={(p, b) => act(p, b)} busy={m.isPending} />)}
      {a.status === 'OFFER_READY' && offer && <OfferCard a={a} o={offer} act={act} busy={m.isPending} />}

      {a.status === 'SIGNING' && offer && (
        <section className="card stack accent">
          <span className="tag" style={{ alignSelf: 'flex-start' }}>Подписание</span><h2>Кредитный договор</h2>
          <div className="kv"><div><div className="k">Сумма</div><div className="v">{rub(offer.amount)}</div></div><div><div className="k">Срок</div><div className="v">{months(offer.term_months)}</div></div><div><div className="k">Ставка</div><div className="v">{pct(offer.rate)}</div></div><div><div className="k">Платёж</div><div className="v">{rub(offer.monthly_payment)}</div></div></div>
          <div className="callout"><ISpark /><div className="small">Подписание и выдача средств в прототипе <b>симулируются</b>: реальных операций нет.</div></div>
          <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span className="small">Я ознакомился с условиями договора и подписываю его электронной подписью (демо)</span></label>
          <button className="btn primary lg" disabled={!consent || m.isPending} style={{ alignSelf: 'flex-start' }} onClick={() => act('/sign', { consent })}>Подписать и получить деньги</button>
        </section>)}

      {bad && <section className="callout bad" style={{ padding: 22, borderRadius: 24 }}><div className="stack sm"><b style={{ fontSize: 18 }}>Почему так решили</b><p>{a.decision_reason}</p><p className="small">Решение принято на основании данных заявки и проверок в реестрах. Исправьте причину и подайте новую заявку — например, с меньшей суммой или более длинным сроком.</p><Link to="/apply" className="btn dark sm" style={{ alignSelf: 'flex-start' }}>Подать новую заявку</Link></div></section>}

      {a.loan && (
        <section className="card stack">
          <div className="row between wrap"><div><span className="pill green">Кредит выдан</span><h2 style={{ marginTop: 8 }}>Договор {a.loan.contract_number}</h2></div><div className="muted small">Подписан {dateOnly(a.loan.signed_at)}</div></div>
          <div className="scroll-x"><table className="table num"><thead><tr><th>№</th><th>Дата</th><th className="r">Платёж</th><th className="r">Основной долг</th><th className="r">Проценты</th><th className="r">Остаток</th></tr></thead>
            <tbody>{a.loan.schedule.slice(0, 12).map((s) => <tr key={s.n}><td>{s.n}</td><td>{dateOnly(s.date)}</td><td className="r"><b>{rub(s.payment)}</b></td><td className="r">{rub(s.principal)}</td><td className="r">{rub(s.interest)}</td><td className="r">{rub(s.balance)}</td></tr>)}</tbody></table></div>
          {a.loan.schedule.length > 12 && <p className="small muted">Показаны первые 12 платежей из {a.loan.schedule.length}.</p>}
        </section>)}

      <div className="grid g2" style={{ alignItems: 'start' }}>
        <section className="card stack"><h3>История заявки</h3><Timeline events={a.events} /></section>
        <div className="stack">
          <section className="card stack"><h3>Документы</h3>
            {a.documents.length === 0 && <p className="muted small">Документы не загружены.</p>}
            {a.documents.map((d) => <div key={d.id} className="docrow"><span className="ico"><IDoc /></span><div className="grow"><div style={{ fontWeight: 600 }}>{d.label}</div><div className="tiny muted">{d.filename} · {fileSize(d.size)}</div></div><span className={'pill ' + (d.status === 'verified' ? 'green' : d.status === 'rejected' ? 'red' : '')}>{d.status === 'verified' ? 'Принят' : d.status === 'rejected' ? 'Отклонён' : 'Загружен'}</span></div>)}
          </section>
          <section className="card stack"><h3>Данные заявки</h3>
            <div className="kv" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div><div className="k">Выручка за год</div><div className="v" style={{ fontSize: 16 }}>{rub(a.financials.revenue_year)}</div></div><div><div className="k">Прибыль за год</div><div className="v" style={{ fontSize: 16 }}>{rub(a.financials.net_profit_year)}</div></div>
              <div><div className="k">Оборот в месяц</div><div className="v" style={{ fontSize: 16 }}>{rub(a.financials.monthly_turnover)}</div></div><div><div className="k">Платежи по кредитам</div><div className="v" style={{ fontSize: 16 }}>{rub(a.financials.monthly_obligations)}</div></div>
            </div>
            {a.purpose && <div className="small muted">Цель: {a.purpose}</div>}
          </section>
          <section className="card soft stack sm"><div className="row"><ISpark style={{ color: 'var(--purple)' }} /><b>Простыми словами</b><span className="pill purple">ИИ · заглушка</span></div><p className="small">{a.ai_explanation.text}</p></section>
        </div>
      </div>
    </div>
  )
}
