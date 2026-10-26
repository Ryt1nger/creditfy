import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp, useAct, useBankApps, useStats } from '../api/hooks'
import type { ApplicationDetail as D, ScoreInfo } from '../api/types'
import { Empty, ErrorBox, Loading, Modal, Stepper, StatusPill, useToast, Field } from '../ui/kit'
import { Timeline } from './ApplicationDetail'
import { IBack, ICheck, IDoc, ISearch, ISpark, IX } from '../ui/Icons'
import { age, dateOnly, dt, fileSize, months, pct, rub } from '../lib/format'

const GROUPS: [string, string][] = [['manual', 'На рассмотрении'], ['waiting', 'Ждут клиента'], ['auto', 'В автообработке'], ['offers', 'Предложение клиенту'], ['done', 'Завершены'], ['all', 'Все']]
const GRADE_COLOR: Record<string, string> = { A: 'green', B: 'green', C: 'amber', D: 'amber', E: 'red' }

export function BankQueue() {
  const nav = useNavigate(); const [g, setG] = useState('manual'); const [q, setQ] = useState('')
  const { data, isLoading, error, refetch } = useBankApps(g, q); const all = useBankApps('all', '').data ?? []
  const cnt = (k: string) => (k === 'all' ? all.length : all.filter((a) => ({ manual: ['MANUAL_REVIEW'], waiting: ['NEEDS_INFO'], auto: ['SUBMITTED', 'COMPLETENESS_CHECK', 'ENRICHMENT', 'SCORING'], offers: ['OFFER_READY', 'SIGNING'], done: ['DISBURSED', 'REJECTED', 'DECLINED_BY_CLIENT', 'EXPIRED', 'CANCELLED'] } as any)[k].includes(a.status)).length)
  return (
    <div className="stack lg">
      <div className="row between wrap"><div><h1>Очередь заявок</h1><p className="muted" style={{ marginTop: 6 }}>Автоматика решает простые случаи, вам приходят только те, где нужен специалист.</p></div></div>
      <div className="grid g4">
        <div className="stat"><div className="n">{cnt('manual')}</div><div className="l">ждут решения специалиста</div></div>
        <div className="stat"><div className="n">{cnt('waiting')}</div><div className="l">ждут ответа клиента</div></div>
        <div className="stat"><div className="n">{cnt('auto')}</div><div className="l">в автоматической обработке</div></div>
        <div className="stat"><div className="n">{all.length}</div><div className="l">всего заявок</div></div>
      </div>
      <div className="row between wrap"><div className="chips">{GROUPS.map(([k, l]) => <button key={k} className={'chip' + (g === k ? ' on' : '')} onClick={() => setG(k)}>{l}<span className="c">{cnt(k)}</span></button>)}</div>
        <div className="suffix" style={{ width: 300 }}><input className="input" style={{ minHeight: 46, fontSize: 15 }} placeholder="Поиск: компания, ИНН, номер" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск" /><span><ISearch size={18} /></span></div></div>
      {error && <ErrorBox error={error} retry={refetch} />}{isLoading && <Loading h={260} />}
      {data && data.length === 0 && <Empty title="В этой очереди пусто" text="Смените фильтр или дождитесь новых заявок." />}
      {data && data.length > 0 && (
        <div className="card scroll-x" style={{ padding: 12 }}><table className="table"><thead><tr><th>Заявка</th><th>Компания</th><th className="r">Сумма</th><th>Скоринг</th><th>Статус</th><th>Ответственный</th><th>Обновлена</th></tr></thead>
          <tbody>{data.map((a) => (
            <tr key={a.id} className="click" onClick={() => nav(`/bank/applications/${a.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/bank/applications/${a.id}`)}>
              <td><b>{a.number}</b><div className="tiny muted">{a.product_name}</div></td><td>{a.company_name}</td><td className="r num"><b>{rub(a.amount)}</b><div className="tiny muted">{months(a.term_months)}</div></td>
              <td>{a.score != null ? <span className={'pill ' + GRADE_COLOR[a.risk_grade ?? 'C']}>{a.risk_grade} · {a.score}</span> : <span className="muted">—</span>}</td>
              <td><StatusPill a={a} />{a.open_requests > 0 && <div className="tiny muted" style={{ marginTop: 4 }}>открытых запросов: {a.open_requests}</div>}</td><td className="small">{a.assigned_to ?? <span className="muted">не назначен</span>}</td><td className="small muted">{dt(a.updated_at)}</td></tr>))}</tbody></table></div>)}
    </div>
  )
}

function Score({ s }: { s: ScoreInfo }) {
  const col = s.score >= 620 ? 'var(--green)' : s.score >= 540 ? 'var(--amber)' : 'var(--red)'
  return (
    <section className="card stack">
      <div className="row between wrap"><h3>Скоринг · {s.model_version}</h3><span className={'pill ' + (s.route === 'auto_approve' ? 'green' : s.route === 'reject' ? 'red' : 'amber')}>{s.route === 'auto_approve' ? 'Автоодобрение' : s.route === 'reject' ? 'Автоотказ' : 'Ручной разбор'}</span></div>
      <div className="row wrap" style={{ gap: 28 }}>
        <div className="gauge" style={{ ['--p' as any]: s.score / 10, ['--c' as any]: col }}><div><div className="sum" style={{ fontSize: 36 }}>{s.score}</div><div className="tiny muted">из 1000 · класс {s.grade}</div></div></div>
        <div className="kv grow"><div><div className="k">Вероятность дефолта</div><div className="v">{(s.pd * 100).toFixed(1)}%</div></div><div><div className="k">DSCR при запросе</div><div className="v">{s.dscr ?? '—'}</div><div className="tiny muted">порог ≥ 1,25</div></div></div>
      </div>
      {s.stop_factors.length > 0 && <div className="callout bad"><IX /><div><b>Стоп-факторы политики</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{s.stop_factors.map((f) => <li key={f.code}>{f.name}</li>)}</ul></div></div>}
      {s.flags.length > 0 && <div className="callout warn"><div><b>Требует внимания</b><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{s.flags.map((f) => <li key={f}>{f}</li>)}</ul></div></div>}
      <div><div className="row small muted" style={{ fontWeight: 600, paddingBottom: 6 }}><span className="grow">Фактор</span><span style={{ width: 'min(36%,220px)' }}>Влияние на балл</span><span style={{ width: 64, textAlign: 'right' }}>Баллы</span></div>
        {s.factors.map((f) => (
          <div className="factor" key={f.code + f.name}><div><div style={{ fontWeight: 600 }}>{f.name}</div><div className="tiny muted">{f.value}{f.comment ? ` · ${f.comment}` : ''}</div></div>
            <div className="meter"><i style={{ background: f.points >= 0 ? 'var(--green)' : 'var(--red)', [f.points >= 0 ? 'left' : 'right']: '50%', width: Math.min(50, Math.abs(f.points) / 2) + '%' }} /></div>
            <div className="num" style={{ textAlign: 'right', fontWeight: 700, color: f.points >= 0 ? 'var(--green)' : 'var(--red)' }}>{f.points > 0 ? '+' : ''}{f.points}</div></div>))}
      </div>
    </section>
  )
}

function Registry({ a }: { a: D }) {
  const e = a.bank!.enrichment; if (!e.egrul) return <section className="card"><h3>Данные из реестров</h3><p className="muted small" style={{ marginTop: 8 }}>Обогащение ещё не выполнялось.</p></section>
  return (
    <section className="card stack"><h3>Данные из реестров </h3>
      <div className="grid g3">
        <div className="stack sm"><b>ЕГРЮЛ / ЕГРИП</b><div className="small">Статус: <b>{e.egrul.status === 'active' ? 'действует' : 'ликвидируется'}</b></div><div className="small">Возраст: {age(e.egrul.age_months)}</div><div className="small">ОГРН: {e.egrul.ogrn}</div><div className="small muted">{e.egrul.okved}</div></div>
        <div className="stack sm"><b>Бюро кредитных историй</b><div className="small">История: {e.bki.has_history ? `${e.bki.history_months} мес.` : 'нет'}</div><div className="small">Макс. просрочка 24 мес.: <b>{e.bki.max_overdue_days_24m} дн.</b></div><div className="small">Действующих кредитов: {e.bki.active_loans.length} · платежи {rub(e.bki.active_loans.reduce((s: number, l: any) => s + l.monthly_payment, 0))}</div><div className="small">Запросов за 6 мес.: {e.bki.inquiries_6m}</div></div>
        <div className="stack sm"><b>ФНС «Прозрачный бизнес»</b><div className="small">Налоговая задолженность: <b>{rub(e.pb.tax_debt)}</b></div><div className="small">Сотрудников: {e.pb.employees}</div><div className="small">Режим: {e.pb.tax_regime}</div><div className="small">Риск-признаки: {e.pb.risk_flags.length ? e.pb.risk_flags.join(', ') : 'нет'}</div></div>
      </div></section>
  )
}

export function BankReview() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast()
  const { data: a, error, refetch } = useApp(id!, true); const m = useAct(Number(id), true)
  const [modal, setModal] = useState<null | 'approve' | 'counter' | 'reject' | 'info'>(null)
  const [f, setF] = useState<any>({}); if (error) return <ErrorBox error={error} retry={refetch} />
  if (!a || !a.bank) return <div className="stack"><Loading h={160} /><Loading h={360} /></div>
  const b = a.bank
  const call = (path: string, body?: unknown, ok?: string) => m.mutate({ method: 'POST', path: `/bank/applications/${a.id}${path}`, body }, { onSuccess: () => { setModal(null); ok && toast(ok) }, onError: (e) => toast((e as Error).message, true) })
  return (
    <div className="stack lg">
      <div className="row"><button className="btn light sm" onClick={() => nav('/bank')}><IBack size={18} /> К очереди</button></div>
      <section className="card stack">
        <div className="row between wrap"><div><span className="tiny muted">{a.number} · создана {dt(a.created_at)}</span><h1 style={{ fontSize: 'clamp(26px,3.4vw,38px)', marginTop: 4 }}>{a.company!.name}</h1><div className="muted">ИНН {a.company!.inn} · {a.product_name}</div></div>
          <div style={{ textAlign: 'right' }}><div className="sum num">{rub(a.amount)}</div><div className="muted small">на {months(a.term_months)}{a.has_collateral ? ' · залог' : ''}</div></div></div>
        <Stepper steps={a.steps} current={a.step} status={a.status} running={a.processing} />
        <div className="row wrap"><StatusPill a={a} />{a.assigned_to ? <span className="pill">Ведёт: {a.assigned_to}</span> : <button className="btn sm dark" onClick={() => call('/take', undefined, 'Заявка взята в работу')}>Взять в работу</button>}</div>
      </section>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px', alignItems: 'start' }}>
        <div className="stack">
          <section className="ai-box stack sm"><div className="row"><ISpark style={{ color: 'var(--purple)' }} /><b>Сводка по заявке</b></div><p className="small">{b.ai_summary.text}</p></section>
          {b.score && <Score s={b.score} />}
          <Registry a={a} />
          <section className="card stack"><h3>Документы</h3>
            {a.documents.length === 0 && <p className="muted small">Документов нет.</p>}
            {a.documents.map((d) => (
              <div key={d.id} className="docrow"><span className="ico"><IDoc /></span><div className="grow"><div style={{ fontWeight: 600 }}>{d.label}</div><div className="tiny muted">{d.filename} · {fileSize(d.size)} · </div>{d.review_comment && <div className="tiny" style={{ color: 'var(--red)' }}>{d.review_comment}</div>}</div>
                <span className={'pill ' + (d.status === 'verified' ? 'green' : d.status === 'rejected' ? 'red' : '')}>{d.status === 'verified' ? 'Принят' : d.status === 'rejected' ? 'Отклонён' : 'Проверить'}</span>
                {b.can_edit_docs && <div className="row" style={{ gap: 6 }}><button className="btn sm light" aria-label="Принять" onClick={() => call(`/documents/${d.id}/review`, { status: 'verified' })}><ICheck size={16} /></button><button className="btn sm light" aria-label="Отклонить" onClick={() => call(`/documents/${d.id}/review`, { status: 'rejected', comment: 'Документ нечитаем или не соответствует' })}><IX size={16} /></button></div>}</div>))}
          </section>
          <div className="grid g2" style={{ alignItems: 'start' }}>
            <section className="card stack"><h3>Данные клиента</h3><div className="small">Контакт: {a.contact.name} · {a.contact.phone}</div><div className="small">Руководитель: {a.company!.director}</div><div className="small">Адрес: {a.company!.address}</div><div className="small">Выручка: {rub(a.financials.revenue_year)} · прибыль: {rub(a.financials.net_profit_year)}</div><div className="small">Оборот/мес.: {rub(a.financials.monthly_turnover)} · платежи: {rub(a.financials.monthly_obligations)}</div></section>
            <section className="card stack"><h3>Журнал и аудит</h3><Timeline events={a.events} /></section>
          </div>
        </div>
        <aside className="stack" style={{ position: 'sticky', top: 92 }}>
          <section className="card stack">
            <h3>Решение</h3>
            {a.status === 'MANUAL_REVIEW' ? (<>
              {b.suggested_offer && <div className="callout lime stack sm" style={{ flexDirection: 'column' }}><b>Система предлагает</b><div className="small">{rub(b.suggested_offer.amount)} · {months(b.suggested_offer.term_months)} · {pct(b.suggested_offer.rate)} · {rub(b.suggested_offer.monthly_payment)}/мес. (DSCR {b.suggested_offer.dscr})</div><div className="tiny">{b.suggested_offer.explanation}</div></div>}
              {!b.suggested_offer && <div className="callout warn small">Подобрать условия с достаточным покрытием платежа не удалось.</div>}
              {b.can_decide ? (<div className="stack sm">
                <button className="btn primary block" onClick={() => { setF(b.suggested_offer ? { amount: b.suggested_offer.amount, term_months: b.suggested_offer.term_months, comment: '' } : { amount: a.amount, term_months: a.term_months, comment: '' }); setModal(b.suggested_offer?.kind === 'counter' ? 'counter' : 'approve') }}>{b.suggested_offer?.kind === 'counter' ? 'Одобрить с изменениями' : 'Одобрить'}</button>
                <button className="btn outline block" onClick={() => { setF({ amount: a.amount, term_months: a.term_months, comment: '' }); setModal('counter') }}>Своё встречное предложение</button>
                <button className="btn danger-text block" onClick={() => { setF({ reason_code: b.reject_reasons[0].code, comment: '' }); setModal('reject') }}>Отказать</button></div>)
                : <div className="callout small">Решение принимает андеррайтер. Вы можете запросить данные у клиента.</div>}
              <button className="btn light block" onClick={() => { setF({ message: '', label: '' }); setModal('info') }}>Запросить данные у клиента</button>
              <button className="btn light block" onClick={() => call('/rescore', undefined, 'Скоринг пересчитан')}>Пересчитать скоринг</button>
            </>) : <p className="muted small">{a.decision_reason ? <>Решение: <b>{a.decision === 'rejected' ? 'отказ' : a.decision === 'counteroffer' ? 'встречное предложение' : 'одобрено'}</b>. {a.decision_reason}</> : 'Действия по этой заявке недоступны на текущем этапе.'}</p>}
          </section>
        </aside>
      </div>

      {modal === 'reject' && <Modal title="Отказ по заявке" onClose={() => setModal(null)}><Field label="Причина (увидит клиент)"><select className="input" value={f.reason_code} onChange={(e) => setF({ ...f, reason_code: e.target.value })}>{b.reject_reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}</select></Field><Field label="Комментарий"><textarea className="input" value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} /></Field><button className="btn primary" disabled={m.isPending} onClick={() => call('/decision', { type: 'reject', ...f }, 'Отказ зафиксирован')}>Подтвердить отказ</button></Modal>}
      {(modal === 'approve' || modal === 'counter') && <Modal title={modal === 'approve' ? 'Одобрить заявку' : 'Предложить условия'} onClose={() => setModal(null)}>
        <div className="grid g2"><Field label="Сумма, ₽"><input className="input num" inputMode="numeric" value={f.amount ?? ''} onChange={(e) => setF({ ...f, amount: Number(e.target.value.replace(/\D/g, '')) })} /></Field><Field label="Срок, мес."><input className="input num" inputMode="numeric" value={f.term_months ?? ''} onChange={(e) => setF({ ...f, term_months: Number(e.target.value.replace(/\D/g, '')) })} /></Field></div>
        <Field label="Комментарий для клиента"><textarea className="input" value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} placeholder="Почему условия такие" /></Field>
        <button className="btn primary" disabled={m.isPending} onClick={() => call('/decision', { type: a.amount === f.amount && a.term_months === f.term_months ? 'approve' : 'counter', amount: f.amount, term_months: f.term_months, comment: f.comment }, 'Предложение отправлено клиенту')}>Отправить клиенту</button></Modal>}
      {modal === 'info' && <Modal title="Запрос данных у клиента" onClose={() => setModal(null)}><Field label="Что нужно уточнить"><textarea className="input" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} placeholder="Например: объясните расхождение оборота по счёту и выручки" /></Field><button className="btn primary" disabled={m.isPending || f.message.trim().length < 5} onClick={() => call('/request-info', { message: f.message, items: [{ type: 'text', label: 'Пояснение' }] }, 'Запрос отправлен клиенту')}>Отправить запрос</button></Modal>}
    </div>
  )
}

export function BankStats() {
  const { data, isLoading, error, refetch } = useStats()
  if (error) return <ErrorBox error={error} retry={refetch} />
  if (isLoading || !data) return <Loading h={300} />
  const max = Math.max(1, ...data.funnel.map((f) => f.count))
  return (
    <div className="stack lg"><h1>Аналитика конвейера</h1>
      <div className="grid g3"><div className="stat"><div className="n">{data.total}</div><div className="l">заявок в системе</div></div><div className="stat"><div className="n">{data.auto_rate}%</div><div className="l">решений принято автоматически</div></div><div className="stat"><div className="n num">{rub(data.avg_amount)}</div><div className="l">средняя запрошенная сумма</div></div></div>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <section className="card stack"><h3>Воронка</h3>{data.funnel.map((f, i) => <div key={f.label} className="stack sm"><div className="row between small"><span>{f.label}</span><b>{f.count}</b></div><div className="meter" style={{ height: 14 }}><i style={{ left: 0, width: (f.count / max) * 100 + '%', background: i === data.funnel.length - 1 ? 'var(--green)' : 'var(--red)' }} /></div></div>)}</section>
        <section className="card stack"><h3>Маршруты решения</h3>{data.by_route.map((r) => <div key={r.route} className="row between docrow"><span>{r.label}</span><b style={{ fontSize: 22 }}>{r.count}</b></div>)}<p className="small muted">Цель продукта — чтобы простые заявки решались без участия человека, а специалист занимался сложными.</p></section>
      </div>
    </div>
  )
}
