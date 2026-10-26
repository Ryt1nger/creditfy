import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, API_BASE, MODE, uploadDocument } from '../api/client'
import { useDemoInns, useProducts } from '../api/hooks'
import type { ApplicationDetail, CalcResult, CompanyInfo, DocumentItem, ReviewField } from '../api/types'
import { ErrorBox, Field, Loading, useToast } from '../ui/kit'
import { IArrow, ICheck, IDoc, IWarn } from '../ui/Icons'
import { Logo, SHORT } from '../ui/alfa'
import { age, dateOnly, fileSize, months, num, rub } from '../lib/format'

const STEPS = ['Сумма и срок', 'Компания и заявитель', 'Документы', 'Проверка данных', 'Итог и отправка']
const MINUTES = [2, 3, 3, 3, 1] // ориентировочное время каждого шага
const ROLES = [['owner', 'Собственник'], ['director', 'Генеральный директор'], ['accountant', 'Бухгалтер / финансовый директор'], ['employee', 'Сотрудник по доверенности']]

function Money({ value, onChange, onBlur, placeholder, bad }: { value: number | null | undefined; onChange: (n: number | null) => void; onBlur?: () => void; placeholder?: string; bad?: boolean }) {
  return (
    <div className="suffix"><input className={'input num' + (bad ? ' err' : '')} inputMode="numeric" placeholder={placeholder} value={value == null ? '' : num(value)} onBlur={onBlur}
      onChange={(e) => { const d = e.target.value.replace(/\D/g, ''); onChange(d === '' ? null : Math.min(Number(d), 9_999_999_999)) }} /><span>₽</span></div>
  )
}

/** Подпись источника значения: откуда число и можно ли ему доверять. */
function Source({ f }: { f: ReviewField }) {
  const cls = f.status === 'conflict' ? 'bad' : f.status === 'missing' ? 'missing' : f.source === 'client' || f.status === 'edited' ? 'client' : 'doc'
  return <span className={'src ' + cls}>{f.status === 'conflict' ? <IWarn size={14} /> : f.status === 'missing' ? null : <ICheck size={14} />}{f.source_label}{f.status === 'edited' && f.source !== 'client' ? ' · изменено вами' : ''}{f.status === 'confirmed' ? ' · подтверждено вами' : ''}</span>
}

export default function Wizard() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast(); const qc = useQueryClient()
  const { data: products } = useProducts(); const { data: demo } = useDemoInns()
  const [a, setA] = useState<ApplicationDetail | null>(null); const [err, setErr] = useState<unknown>(null)
  const [step, setStep] = useState(1); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState<'' | 'saving' | 'saved'>('')
  const [amount, setAmount] = useState(0); const [term, setTerm] = useState(12); const [collateral, setCollateral] = useState(false); const [collNote, setCollNote] = useState('')
  const [inn, setInn] = useState(''); const [company, setCompany] = useState<CompanyInfo | null>(null); const [innErr, setInnErr] = useState('')
  const [contact, setContact] = useState({ name: '', phone: '', role: '' }); const [purpose, setPurpose] = useState('')
  const [fin, setFin] = useState<Record<string, number | null>>({})
  const [consent, setConsent] = useState(false); const [errs, setErrs] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null); const [uploadKind, setUploadKind] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const ready = useRef(false)
  const p = a?.product ?? products?.find((x) => x.code === a?.product_code)

  const apply = useCallback((d: ApplicationDetail, hydrate = false) => {
    setA(d)
    if (hydrate) {
      setStep(Math.min(Math.max(d.wizard_step || 1, 1), 5)); setAmount(d.amount); setTerm(d.term_months); setCollateral(d.has_collateral); setCollNote(d.collateral_note ?? '')
      setContact({ name: d.contact.name ?? '', phone: d.contact.phone ?? '', role: d.contact.role ?? '' }); setPurpose(d.purpose ?? '')
      if (d.company) { setInn(d.company.inn); setCompany(d.company) }
    }
    setFin(Object.fromEntries(d.review.fields.map((f) => [f.field, f.value])))
  }, [])
  useEffect(() => {
    api<ApplicationDetail>('GET', `/applications/${id}`).then((d) => {
      if (d.status !== 'DRAFT') { nav(`/applications/${d.id}`, { replace: true }); return }
      apply(d, true); setTimeout(() => { ready.current = true }, 0)
    }).catch(setErr)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const body = useCallback((over: Record<string, unknown> = {}) => ({
    amount, term_months: term, has_collateral: collateral, collateral_note: collNote || null, purpose: purpose || null,
    contact: { name: contact.name || null, phone: contact.phone || null, role: contact.role || null }, wizard_step: step, ...over,
  }), [amount, term, collateral, collNote, contact, purpose, step])
  const save = useCallback(async (over: Record<string, unknown> = {}) => {
    if (!a) return a
    setSaved('saving')
    try { const d = await api<ApplicationDetail>('PATCH', `/applications/${a.id}`, body(over)); setA(d); setSaved('saved'); qc.invalidateQueries({ queryKey: ['apps'] }); return d } catch (e) { setSaved(''); toast((e as Error).message, true); throw e }
  }, [a, body, qc, toast])
  // автосохранение: любые правки на шагах 1–2 и 4 уходят на сервер через паузу
  useEffect(() => {
    if (!ready.current || !a) return
    clearTimeout(timer.current); setSaved('saving')
    timer.current = setTimeout(() => { void save().catch(() => {}) }, 700)
    return () => clearTimeout(timer.current)
  }, [amount, term, collateral, collNote, contact, purpose]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (p) { setAmount((x) => Math.min(Math.max(x, p.min_amount), p.max_amount)); setTerm((t) => Math.min(Math.max(t, p.min_term), p.max_term)); if (!p.allows_collateral) setCollateral(false); else if (p.eligibility?.collateral === 'required') setCollateral(true) } }, [p])
  const calc = useQuery({ queryKey: ['calc', a?.product_code, amount, term, collateral], queryFn: () => api<CalcResult>('POST', '/calculator', { product_code: a!.product_code, amount, term_months: term, has_collateral: collateral }), enabled: !!p && !!a && step === 1 && amount > 0, placeholderData: (x) => x })

  async function lookup(v: string) {
    setInn(v); setCompany(null); setInnErr('')
    if (v.length === 10 || v.length === 12) { try { setCompany(await api<CompanyInfo>('GET', `/companies/lookup/${v}`)) } catch (e) { setInnErr((e as Error).message) } }
  }
  function validate(s: number) {
    const e: Record<string, string> = {}
    if (s === 1 && !(amount > 0)) e.amount = 'Укажите сумму'
    if (s === 2) {
      if (!company) e.inn = innErr || 'Введите ИНН — подтянем данные из реестра'
      if (!contact.name.trim()) e.cname = 'Укажите ФИО заявителя'
      if (contact.phone.replace(/\D/g, '').length < 10) e.phone = 'Укажите телефон, например +7 900 000-00-00'
      if (!contact.role) e.role = 'Выберите, кем вы приходитесь компании'
    }
    if (s === 4) {
      for (const f of a?.review.fields ?? []) if (fin[f.field] == null) e[f.field] = 'Заполните значение (если платежей нет — укажите 0)'
      if (a?.review.has_conflicts) e.conflict = 'Есть данные с пометкой «Требует проверки» — исправьте или подтвердите их'
    }
    setErrs(e); return Object.keys(e).length === 0
  }
  async function go(to: number) {
    if (to > step && !validate(step)) return
    setBusy(true)
    try {
      const over: Record<string, unknown> = { wizard_step: to }
      if (step === 2 && company && company.inn !== a?.company?.inn) over.company_inn = company.inn
      const d = await save(over); if (d) { apply(d); setStep(to); window.scrollTo({ top: 0, behavior: 'smooth' }) }
    } catch { /* тост уже показан */ } finally { setBusy(false) }
  }
  async function exit() {
    setBusy(true)
    try { await save(); toast('Заявка сохранена — можно продолжить с шага ' + step); nav('/applications') } catch { /* */ } finally { setBusy(false) }
  }
  async function upload(kind: string, file: File) {
    if (!a) return; setBusy(true)
    try { apply(await uploadDocument(a.id, kind, file)) } catch (e) { toast((e as Error).message, true) } finally { setBusy(false) }
  }
  async function demoKit() {
    if (!a?.company) return; setBusy(true)
    try {
      const cat = await api<{ kind: string; formats: string[]; conflict: boolean }[]>('GET', `/demo/documents/${a.company.inn}`)
      let d = a
      for (const rd of a.required_documents.filter((r) => !r.uploaded)) {
        const c = cat.find((x) => x.kind === rd.kind); if (!c) continue
        const fmt = c.formats[0], name = `${rd.kind}_${a.company.inn}.${fmt}`
        let file: File
        if (MODE === 'live') { const r = await fetch(`${API_BASE}/api/demo/documents/${a.company.inn}/${rd.kind}.${fmt}`); file = new File([await r.blob()], name) } else file = new File(['demo'], name)
        d = await uploadDocument(d.id, rd.kind, file)
      }
      apply(d)
    } catch (e) { toast((e as Error).message, true) } finally { setBusy(false) }
  }
  async function editField(f: ReviewField, value: number | null) {
    if (value == null || value === f.value) return
    setBusy(true)
    try { const d = f.extraction_id ? await api<ApplicationDetail>('PATCH', `/extractions/${f.extraction_id}`, { value }) : await save({ financials: { [f.field]: value } }); if (d) apply(d) } catch (e) { toast((e as Error).message, true) } finally { setBusy(false) }
  }
  async function confirm(f: ReviewField) {
    if (!f.extraction_id) return; setBusy(true)
    try { apply(await api<ApplicationDetail>('PATCH', `/extractions/${f.extraction_id}`, { confirm: true })) } catch (e) { toast((e as Error).message, true) } finally { setBusy(false) }
  }
  async function submit() {
    if (!a) return; setBusy(true)
    try { await api('POST', `/applications/${a.id}/submit`); qc.invalidateQueries({ queryKey: ['apps'] }); toast('Заявка отправлена в банк'); nav(`/applications/${a.id}`) } catch (e) { toast((e as Error).message, true) } finally { setBusy(false) }
  }

  const missingDocs = useMemo(() => a?.required_documents.filter((d) => !d.uploaded) ?? [], [a])
  const minutesLeft = MINUTES.slice(step - 1).reduce((x, y) => x + y, 0)
  if (err) return <div className="focus-in"><ErrorBox error={err} retry={() => location.reload()} /></div>
  if (!a || !p || !products) return <div className="focus-in"><Loading h={400} /></div>
  const short = SHORT[a.product_code]
  const termOpts = p.min_term === p.max_term ? [p.min_term] : Array.from(new Set([6, 9, 12, 18, 24, 30, 36, 48, 60, 72, 84, 96, 120, term].filter((t) => t >= p.min_term && t <= p.max_term))).sort((x, y) => x - y)
  const pctOf = (v: number, lo: number, hi: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))
  const Nav = ({ label = 'Продолжить', onClick = () => go(step + 1), disabled = busy }: { label?: string; onClick?: () => void; disabled?: boolean }) => (
    <div className="wnav">{step > 1 ? <button className="back" disabled={busy} onClick={() => go(step - 1)}>Назад</button> : <span />}<button className="btn primary lg" onClick={onClick} disabled={disabled}>{busy ? 'Сохраняем…' : label} <IArrow /></button></div>
  )

  return (
    <div className="focus-shell">
      <header className="focus-bar">
        <div className="in">
          <Link to="/" className="brand" aria-label="Альфа-Банк (выйти без сохранения изменений на этом шаге)"><Logo /><span className="bank">Альфа-Банк</span></Link>
          <div className="focus-prog" role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step} aria-label="Прогресс заявки">
            <div className="lab"><b>Шаг {step} из 5 · {STEPS[step - 1]}</b><span>≈ {minutesLeft} мин до отправки</span></div>
            <div className="segs">{STEPS.map((t, i) => <i key={t} className={i + 1 < step ? 'done' : i + 1 === step ? 'cur' : ''} title={t} />)}</div>
          </div>
          <span className={'savestate ' + saved} aria-live="polite">{saved === 'saving' ? 'Сохраняем…' : saved === 'saved' ? 'Сохранено' : 'Автосохранение'}</span>
          <button className="btn light sm" onClick={exit} disabled={busy}>Сохранить и выйти</button>
        </div>
      </header>

      <div className="focus-in">
        <div className="focus-title"><span className="demotag">{short?.name ?? p.name} · {a.number}</span></div>
        <div key={step} className="swap"><section className="wcard">

          {step === 1 && (<>
            <div><h2>Сколько нужно твоему бизнесу?</h2><p className="sub">{a.purpose && a.purpose !== p.tagline ? 'Подставили из твоего описания — проверь и поправь при необходимости.' : 'Параметры можно изменить до отправки заявки.'}</p></div>
            <Field label="Сумма кредита" error={errs.amount}><Money value={amount} onChange={(n) => n != null && setAmount(Math.min(Math.max(n, p.min_amount), p.max_amount))} /></Field>
            <div style={{ padding: '0 6px' }}><input type="range" aria-label="Сумма" min={p.min_amount} max={p.max_amount} step={50000} value={amount} style={{ ['--p' as any]: pctOf(amount, p.min_amount, p.max_amount) + '%' }} onChange={(e) => setAmount(Number(e.target.value))} />
              <div className="row between tiny muted" style={{ marginTop: 6 }}><span>{rub(p.min_amount)}</span><span>{rub(p.max_amount)}</span></div></div>
            <div className="grid g2">
              <Field label="Срок" hint={p.min_term === p.max_term ? 'Срок фиксированный для этого продукта' : undefined}>
                <select className="input" value={term} disabled={termOpts.length === 1} onChange={(e) => setTerm(Number(e.target.value))}>{termOpts.map((t) => <option key={t} value={t}>{months(t)}</option>)}</select>
              </Field>
              <Field label="Обеспечение" hint={p.allows_collateral ? 'Для этой программы нужен залог' : 'Для этого продукта залог не предусмотрен'}>
                <select className="input" value={collateral ? 'yes' : 'no'} disabled={!p.allows_collateral || p.eligibility?.collateral === 'required'} onChange={(e) => setCollateral(e.target.value === 'yes')}><option value="no">Без залога</option><option value="yes">С залогом</option></select>
              </Field>
            </div>
            {collateral && <Field label="Что в залоге"><input className="input" value={collNote} onChange={(e) => setCollNote(e.target.value)} placeholder="Например, грузовой автомобиль 2021 г." /></Field>}
            <p className="sumnote">Предварительный расчёт.{calc.data ? ` Ориентировочный платёж — около ${rub(calc.data.monthly_payment)} в месяц.` : ''} Итоговые условия определит банк после проверки. {p.disclaimer}.</p>
            <Nav />
          </>)}

          {step === 2 && (<>
            <div><h2>Найдём компанию по ИНН</h2><p className="sub">Укажи ИНН компании и представителя, который оформляет заявку.</p></div>
            <Field label="ИНН компании или ИП" error={errs.inn || innErr}>
              <div className="row" style={{ gap: 16, alignItems: 'stretch' }}>
                <input className={'input num grow' + (innErr ? ' err' : '')} inputMode="numeric" maxLength={12} value={inn} onChange={(e) => lookup(e.target.value.replace(/\D/g, ''))} placeholder="0000000000" />
                <button className="btn primary lg" onClick={() => (inn.length === 10 || inn.length === 12 ? lookup(inn) : setInnErr('ИНН — 10 цифр для организации или 12 для ИП'))}>Найти компанию <IArrow /></button>
              </div>
            </Field>
            {company && (
              <div className="grayrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 22, padding: '26px 30px' }} aria-live="polite">
                <div className="row between"><b style={{ fontSize: 26 }}>{company.name}</b><span className="demotag">Компания из примера</span></div>
                <div className="kvgrid">
                  <div><div className="k">Статус</div><div className="v" style={{ color: company.status === 'active' ? undefined : 'var(--red)' }}>{company.status === 'active' ? 'Действует' : 'Ликвидируется'}</div></div>
                  <div><div className="k">Дата регистрации</div><div className="v">{company.reg_date ? dateOnly(company.reg_date) : '—'} <span className="muted small" style={{ fontWeight: 400 }}>· {age(company.age_months)}</span></div></div>
                  <div><div className="k">Руководитель</div><div className="v">{company.director}</div></div>
                  <div><div className="k">Деятельность</div><div className="v">{company.okved}</div></div>
                </div>
                {company.status !== 'active' && <div className="pinkalert"><b>Компания ликвидируется</b><span>Заявку можно отправить, но банк, скорее всего, не сможет её одобрить.</span></div>}
              </div>
            )}
            {demo && <details><summary className="small muted">Компании для проверки сценариев</summary>
              <div className="stack sm" style={{ marginTop: 12 }}>{demo.map((d) => <button key={d.inn} className="docrow" style={{ border: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => lookup(d.inn)}><span className="grow"><b>{d.name}</b><div className="tiny muted">{d.title}</div></span><span className="num small">{d.inn}</span></button>)}</div></details>}
            <hr className="sep" />
            <div><h3>Кто оформляет заявку</h3><p className="sub">Укажите представителя компании.</p></div>
            <div className="grid g2" style={{ gap: 20 }}>
              <Field label="ФИО заявителя" error={errs.cname}><input className="input" autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="Иванов Иван Иванович" /></Field>
              <Field label="Телефон" error={errs.phone}><input className="input" inputMode="tel" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="+7 (000) 000-00-00" /></Field>
            </div>
            <Field label="Кем вы приходитесь компании" error={errs.role} hint="Звонков и SMS не будет: все уведомления — в кабинете.">
              <select className={'input' + (errs.role ? ' err' : '')} value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })}><option value="">Выберите…</option>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </Field>
            <Nav />
          </>)}

          {step === 3 && (<>
            <div><h2>Добавь документы компании</h2><p className="sub">Нужны только документы по этому продукту. Числа из них подставим сами — на следующем шаге ты их проверишь.</p></div>
            <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f && uploadKind) upload(uploadKind, f); e.target.value = '' }} />
            <div className="stack">
              {a.required_documents.map((rd) => { const doc: DocumentItem | undefined = a.documents.find((d) => d.kind === rd.kind)
                return (
                  <div key={rd.kind} className="grayrow">
                    <div><b>{rd.label}</b>
                      {doc ? <><div className="small muted" style={{ marginTop: 6 }}>{doc.filename} · {fileSize(doc.size)}</div>
                        {doc.extractions.length > 0 && <div className="small" style={{ color: '#067a43' }}>Распознано: {doc.extractions.map((x) => `${x.label.toLowerCase()} — ${rub(x.value)}`).join('; ')}</div>}
                        {doc.extraction_note && doc.extractions.length === 0 && doc.extraction !== 'not_required' && <div className="small" style={{ color: 'var(--red)' }}>{doc.extraction_note}</div>}</>
                        : <><div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>Не загружен</div><div className="small muted">PDF (с текстом), XLSX или CSV — лучше всего читаются</div></>}</div>
                    <button className="btn white2 lg" disabled={busy} onClick={() => { setUploadKind(rd.kind); fileRef.current?.click() }}>{doc ? 'Заменить' : 'Загрузить'}</button>
                  </div>) })}
            </div>
            <div className="demo-kit"><IDoc /><div className="grow"><b>Нет под рукой своих файлов?</b><div className="small muted">Подставим синтетические PDF/XLSX/CSV под ИНН {a.company?.inn}. Для ИП Волкова в комплекте есть расхождение: его покажем как «Требует проверки».</div></div>
              <button className="btn dark" disabled={busy || missingDocs.length === 0} onClick={demoKit}>Приложить пример документов</button></div>
            {missingDocs.length > 0 && <p className="muted small">Не хватает: {missingDocs.map((d) => d.label.toLowerCase()).join(', ')}. Можно продолжить и дослать — банк запросит это в кабинете.</p>}
            <Nav />
          </>)}

          {step === 4 && (<>
            <div><h2>Проверь данные</h2><p className="sub">У каждого числа указан источник. Всё можно поправить; пустое нужно заполнить.</p></div>
            <div className="stack">
              {a.review.fields.map((f) => (
                <div key={f.field} className={'rv ' + f.status}>
                  <div className="rv-top"><label>{f.label}</label>{f.status === 'conflict' && <span className="pill red">Требует проверки</span>}{f.status === 'confirmed' && <span className="pill green">Подтверждено</span>}</div>
                  <Money value={fin[f.field]} bad={f.status === 'conflict' || f.status === 'missing' || !!errs[f.field]} onChange={(n) => setFin({ ...fin, [f.field]: n })} onBlur={() => editField(f, fin[f.field] ?? null)} placeholder={f.field === 'monthly_obligations' ? '0' : '—'} />
                  <Source f={f} />
                  {f.note && <div className="rv-note">{f.note}{f.status === 'conflict' && f.extraction_id && <div className="row" style={{ marginTop: 10 }}><button className="btn dark sm" disabled={busy} onClick={() => confirm(f)}>Подтвердить, что верно</button><span className="small">или исправьте значение выше</span></div>}</div>}
                  {errs[f.field] && <span className="errtext">{errs[f.field]}</span>}
                </div>
              ))}
            </div>
            <Field label="Цель кредита" hint="Короткое описание для специалиста"><textarea className="input" rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} /></Field>
            {errs.conflict && <div className="pinkalert"><b>{errs.conflict}</b></div>}
            <Nav />
          </>)}

          {step === 5 && (<>
            <div><h2>Всё в одном месте</h2><p className="sub">Проверь итог. Заявка уйдёт в банк только после твоего нажатия — автоотправки нет.</p></div>
            <div>
              <div className="reviewrow"><span className="k">Продукт</span><span className="v">{short?.name ?? p.name}</span><span /></div>
              <div className="reviewrow"><span className="k">Параметры</span><span className="v">{rub(a.amount)} · {months(a.term_months)}{a.has_collateral ? ' · с залогом' : ''}</span><button onClick={() => go(1)}>Изменить</button></div>
              <div className="reviewrow"><span className="k">Компания</span><span className="v">{a.company?.name} · ИНН {a.company?.inn}</span><button onClick={() => go(2)}>Изменить</button></div>
              <div className="reviewrow"><span className="k">Заявитель</span><span className="v">{a.contact.name}, {a.contact.phone}{a.contact.role ? ` · ${ROLES.find((r) => r[0] === a.contact.role)?.[1] ?? a.contact.role}` : ''}</span><button onClick={() => go(2)}>Изменить</button></div>
              <div className="reviewrow"><span className="k">Документы</span><span className="v">{a.required_documents.filter((d) => d.uploaded).length} из {a.required_documents.length} загружено</span><button onClick={() => go(3)}>Изменить</button></div>
              <div className="reviewrow"><span className="k">Финансы</span><span className="v">{a.review.fields.map((f) => `${f.label.toLowerCase()}: ${rub(f.value)}`).join(' · ')}</span><button onClick={() => go(4)}>Изменить</button></div>
            </div>
            {missingDocs.length > 0 && <div className="pinkalert"><b>Не хватает: {missingDocs.map((d) => d.label.toLowerCase()).join(', ')}</b><span>После отправки банк сможет запросить недостающий документ в кабинете.</span></div>}
            <div className="callout"><IWarn /><div className="small">Оценка риска — не решение: итог определяют правила банка и специалист.  {p.disclaimer}.</div></div>
            <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>Согласен на обработку данных и запрос сведений<div className="small muted">для рассмотрения заявки.</div></span></label>
            <Nav label="Отправить заявку" onClick={submit} disabled={busy || !consent} />
          </>)}
        </section></div>
      </div>
    </div>
  )
}
