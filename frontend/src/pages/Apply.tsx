import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, uploadDocument } from '../api/client'
import { useDemoInns, useProducts } from '../api/hooks'
import type { ApplicationDetail, CalcResult, CompanyInfo, Recommendation } from '../api/types'
import { Field, Loading, useToast } from '../ui/kit'
import { IArrow } from '../ui/Icons'
import { AssistantBox, ProductCard, ProductDetails, SHORT, StarMark, TitleBar, WizSteps } from '../ui/alfa'
import { age, dateOnly, fileSize, months, num, rub } from '../lib/format'

const CHIPS = ['Закупить товар', 'Купить оборудование', 'Открыть новую точку', 'Закрыть кассовый разрыв']
const TIPS: Record<string, string> = { working_capital: 'Если нужны закупки и текущие расходы', investment: 'Если планируешь расширение', overdraft: 'Если деньги нужны на кассовый разрыв', equipment: 'Если нужна техника или транспорт' }
const TITLES = ['На что нужны деньги?', 'Сумма и срок', 'Расскажи о компании', 'Финансы и контакты', 'Документы для заявки', 'Проверь перед отправкой']

function Money({ value, onChange, placeholder }: { value: number | null | undefined; onChange: (n: number | null) => void; placeholder?: string }) {
  return (
    <div className="suffix"><input className="input num" inputMode="numeric" placeholder={placeholder} value={value == null ? '' : num(value)}
      onChange={(e) => { const d = e.target.value.replace(/\D/g, ''); onChange(d === '' ? null : Math.min(Number(d), 9_999_999_999)) }} /><span>₽</span></div>
  )
}

export default function Apply() {
  const nav = useNavigate(); const toast = useToast(); const qc = useQueryClient(); const loc = useLocation(); const [sp] = useSearchParams()
  const { data: products } = useProducts(); const { data: demo } = useDemoInns()
  const [more, setMore] = useState<string | null>(null)
  const [step, setStep] = useState(0); const [busy, setBusy] = useState(false)
  const [need, setNeed] = useState(''); const [rec, setRec] = useState<Recommendation | null>(null); const [recBusy, setRecBusy] = useState(false)
  const [code, setCode] = useState('working_capital'); const [amount, setAmount] = useState(2_000_000); const [term, setTerm] = useState(24)
  const [inn, setInn] = useState(''); const [company, setCompany] = useState<CompanyInfo | null>(null); const [innErr, setInnErr] = useState('')
  const [fin, setFin] = useState<{ revenue_year: number | null; net_profit_year: number | null; monthly_turnover: number | null; monthly_obligations: number | null }>({ revenue_year: null, net_profit_year: null, monthly_turnover: null, monthly_obligations: null })
  const [contact, setContact] = useState({ name: '', phone: '' }); const [collateral, setCollateral] = useState(false); const [collNote, setCollNote] = useState('')
  const [draft, setDraft] = useState<ApplicationDetail | null>(null); const [consent, setConsent] = useState(false); const [errs, setErrs] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null); const [uploadKind, setUploadKind] = useState('')
  const p = products?.find((x) => x.code === code)
  const started = useRef(false)

  useEffect(() => { if (p) { setAmount((a) => Math.min(Math.max(a, p.min_amount), p.max_amount)); setTerm((t) => Math.min(Math.max(t, p.min_term), p.max_term)); if (!p.allows_collateral) setCollateral(false) } }, [code, p])
  const calc = useQuery({ queryKey: ['calc', code, amount, term, collateral], queryFn: () => api<CalcResult>('POST', '/calculator', { product_code: code, amount, term_months: term, has_collateral: collateral }), enabled: !!p && step === 1, placeholderData: (x) => x })

  async function recommend(text = need) {
    if (text.trim().length < 3) return
    setNeed(text); setRecBusy(true)
    try { const r = await api<Recommendation>('POST', '/products/recommend', { text, amount }); setRec(r); setCode(r.items[0].code) } catch (e) { toast((e as Error).message, true) } finally { setRecBusy(false) }
  }
  // вход с главной: подбор по задаче, выбранный продукт или продолжение черновика
  useEffect(() => {
    if (started.current || !products) return
    started.current = true
    const st = (loc.state ?? {}) as { need?: string; code?: string; amount?: number; term?: number }
    const id = sp.get('draft')
    if (id) {
      api<ApplicationDetail>('GET', `/applications/${id}`).then((d) => {
        setDraft(d); setCode(d.product_code); setAmount(d.amount); setTerm(d.term_months); setInn(d.company.inn); setCompany(d.company)
        setCollateral(d.has_collateral); setCollNote(d.collateral_note ?? ''); setNeed(d.purpose ?? '')
        setFin({ revenue_year: d.financials.revenue_year ?? null, net_profit_year: d.financials.net_profit_year ?? null, monthly_turnover: d.financials.monthly_turnover ?? null, monthly_obligations: d.financials.monthly_obligations ?? null })
        setContact({ name: d.contact.name ?? '', phone: d.contact.phone ?? '' }); setStep(4)
      }).catch((e) => toast((e as Error).message, true))
    } else if (st.code) { setCode(st.code); if (st.amount) setAmount(st.amount); if (st.term) setTerm(st.term); setStep(1) } else if (st.need) { void recommend(st.need) }
  }, [products]) // eslint-disable-line react-hooks/exhaustive-deps

  async function lookup(v: string) {
    setInn(v); setCompany(null); setInnErr('')
    if (v.length === 10 || v.length === 12) { try { setCompany(await api<CompanyInfo>('GET', `/companies/lookup/${v}`)) } catch (e) { setInnErr((e as Error).message) } }
  }
  function validate(s: number) {
    const e: Record<string, string> = {}
    if (s === 2 && !company) e.inn = innErr || 'Введите ИНН — мы подтянем данные из реестра'
    if (s === 3) {
      if (!fin.revenue_year) e.revenue = 'Укажите выручку'
      if (fin.net_profit_year == null) e.profit = 'Укажите прибыль (можно 0)'
      if (!fin.monthly_turnover) e.turnover = 'Укажите оборот'
      if (fin.monthly_obligations == null) e.obl = 'Укажите платежи (можно 0)'
      if (!contact.name.trim()) e.cname = 'Укажите контактное лицо'
      if (contact.phone.replace(/\D/g, '').length < 10) e.phone = 'Укажите телефон'
    }
    setErrs(e); return Object.keys(e).length === 0
  }
  const body = () => ({ company_inn: inn, product_code: code, amount, term_months: term, purpose: need || p?.name, has_collateral: collateral, collateral_note: collNote || null, financials: fin, contact })
  const go = (s: number) => setStep(s)
  async function next() {
    if (!validate(step)) return
    if (step === 3) {
      setBusy(true)
      try { const d = draft ? await api<ApplicationDetail>('PATCH', `/applications/${draft.id}`, body()) : await api<ApplicationDetail>('POST', '/applications', body()); setDraft(d); go(4) } catch (e) { toast((e as Error).message, true) } finally { setBusy(false) }
      return
    }
    go(step + 1)
  }
  async function upload(kind: string, file: File) {
    if (!draft) return; setBusy(true)
    try { setDraft(await uploadDocument(draft.id, kind, file)) } catch (e) { toast((e as Error).message, true) } finally { setBusy(false) }
  }
  async function demoDocs() {
    if (!draft) return; setBusy(true)
    try { let d = draft; for (const rd of draft.required_documents.filter((r) => !r.uploaded)) d = await uploadDocument(d.id, rd.kind, new File(['demo'], `${rd.kind}_demo.pdf`, { type: 'application/pdf' })); setDraft(d) } catch (e) { toast((e as Error).message, true) } finally { setBusy(false) }
  }
  async function submit() {
    if (!draft) return; setBusy(true)
    try { await api('POST', `/applications/${draft.id}/submit`); qc.invalidateQueries({ queryKey: ['apps'] }); toast('Заявка отправлена в банк'); nav(`/applications/${draft.id}`) } catch (e) { toast((e as Error).message, true) } finally { setBusy(false) }
  }
  const missingDocs = useMemo(() => draft?.required_documents.filter((d) => !d.uploaded) ?? [], [draft])
  const pctOf = (v: number, lo: number, hi: number) => ((v - lo) / (hi - lo)) * 100
  const ready = !!(products && p)
  // страница открывается сразу на форме: заголовок остаётся над экраном, шаги — под шапкой
  useEffect(() => {
    if (!ready) return
    const el = document.querySelector('.wsteps') as HTMLElement | null
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 96, behavior: 'smooth' })
  }, [ready, step, !!rec]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!products || !p) return <Loading h={400} />
  const short = SHORT[code]
  const shown = Math.min(step, 4)
  const askView = step === 0 && !rec
  const termOpts = p.min_term === p.max_term ? [p.min_term] : Array.from(new Set([6, 9, 12, 18, 24, 30, 36, 48, 60, 72, 84, term].filter((t) => t >= p.min_term && t <= p.max_term))).sort((a, b) => a - b)
  const upCount = draft ? draft.required_documents.filter((d) => d.uploaded).length : 0

  const Nav = ({ label = 'Продолжить', onClick = next, disabled = busy }: { label?: string; onClick?: () => void; disabled?: boolean }) => (
    <div className="wnav"><button className="back" onClick={() => go(step - 1)}>Назад</button><button className="btn primary lg" onClick={onClick} disabled={disabled}>{busy ? 'Сохраняем…' : label} <IArrow /></button></div>
  )

  return (
    <div>
      {more && <ProductDetails code={more} onClose={() => setMore(null)} onPick={(c) => { setMore(null); setCode(c); go(1) }} />}
      <TitleBar>{rec && step === 0 ? 'Подберём под твою задачу' : TITLES[step]}</TitleBar>
      <WizSteps step={shown} />
      <div key={step + (rec ? 'r' : '')} className="swap">

      {step === 0 && askView && (
        <div className="stack lg">
          <h2 style={{ fontSize: 26, fontWeight: 700 }}>Опиши задачу — подскажем подходящий продукт</h2>
          <div>
            <AssistantBox value={need} onChange={setNeed} onSubmit={() => recommend()} busy={recBusy} label="ИИ-помощник · планируемая функция" />
            <div className="chips2">{CHIPS.map((c) => <button key={c} onClick={() => recommend(c)}>{c}</button>)}</div>
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginTop: 14 }}>Или выбери продукт самостоятельно</h2>
          <div className="pgrid">{products.map((x, i) => <ProductCard i={i} key={x.code} name={SHORT[x.code]?.name ?? x.name} sub={SHORT[x.code]?.sub ?? x.tagline} on={false} onMore={() => setMore(x.code)} onClick={() => { setCode(x.code); go(1) }} />)}</div>
        </div>
      )}

      {step === 0 && rec && (
        <div className="stack lg">
          <div className="wcard" style={{ flexDirection: 'row', alignItems: 'center', padding: '22px 28px', borderRadius: 22 }}>
            <span style={{ width: 28 }}><StarMark /></span>
            <div className="grow"><div className="demotag">Твоя задача</div><div style={{ fontSize: 22, marginTop: 2 }}>{need}</div></div>
            <button className="back" style={{ background: 'none', border: 0, font: 'inherit', color: 'var(--ink-2)', cursor: 'pointer' }} onClick={() => setRec(null)}>Изменить запрос</button>
          </div>
          <div className="pgrid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {rec.items.slice(0, 3).map((r, i) => <ProductCard i={i} key={r.code} tag={i === 0 ? 'Подходит по задаче' : 'Другой сценарий'} name={SHORT[r.code]?.name ?? r.code} sub={SHORT[r.code]?.sub ?? ''} on={code === r.code} onMore={() => setMore(r.code)} onClick={() => setCode(r.code)} />)}
          </div>
          <div className="pgrid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {rec.items.slice(0, 3).map((r, i) => <div key={r.code} className="tipcard"><b>{i === 0 && r.score > 0 ? r.reason : TIPS[r.code]}</b><span>Выбор продукта не означает одобрение</span></div>)}
          </div>
          <div className="row wrap" style={{ gap: 24 }}><button className="btn primary lg" onClick={() => go(1)}>Выбрать {short.pick} <IArrow /></button><span className="muted">Пример результата будущего ИИ-подбора</span></div>
        </div>
      )}

      {step > 0 && (
        <div className="wiz2">
          <div>
            <section className="wcard">
              {step === 1 && (<>
                <div><h2>Сколько нужно твоему бизнесу?</h2><p className="sub">Параметры можно изменить до отправки заявки</p></div>
                <Field label="Сумма кредита"><Money value={amount} onChange={(n) => n && setAmount(Math.min(Math.max(n, p.min_amount), p.max_amount))} /></Field>
                <div style={{ padding: '0 6px' }}><input type="range" aria-label="Сумма" min={p.min_amount} max={p.max_amount} step={50000} value={amount} style={{ ['--p' as any]: pctOf(amount, p.min_amount, p.max_amount) + '%' }} onChange={(e) => setAmount(Number(e.target.value))} />
                  <div className="row between tiny muted" style={{ marginTop: 6 }}><span>{rub(p.min_amount)}</span><span>{rub(p.max_amount)}</span></div></div>
                <div className="grid g2">
                  <Field label="Срок" hint={p.min_term === p.max_term ? 'Срок фиксированный для этого продукта' : undefined}>
                    <select className="input" value={term} disabled={termOpts.length === 1} onChange={(e) => setTerm(Number(e.target.value))}>{termOpts.map((t) => <option key={t} value={t}>{months(t)}</option>)}</select>
                  </Field>
                  <Field label="Обеспечение" hint={p.allows_collateral ? 'С залогом ставка ниже на 1 п. п.' : 'Для этого продукта залог не предусмотрен'}>
                    <select className="input" value={collateral ? 'yes' : 'no'} disabled={!p.allows_collateral} onChange={(e) => setCollateral(e.target.value === 'yes')}><option value="no">Без залога</option><option value="yes">С залогом</option></select>
                  </Field>
                </div>
                <p className="sumnote">Демонстрационный расчёт: итоговые условия появятся после проверки.{calc.data ? ` Ориентировочный платёж — около ${rub(calc.data.monthly_payment)} в месяц.` : ''}</p>
                <Nav />
              </>)}

              {step === 2 && (<>
                <div><h2>Найдём компанию по ИНН</h2><p className="sub">Покажем сведения из реестра — проверь их перед продолжением</p></div>
                <div>
                  <Field label="ИНН компании или ИП" error={errs.inn || innErr}>
                    <div className="row" style={{ gap: 16, alignItems: 'stretch' }}>
                      <input className={'input num grow' + (innErr ? ' err' : '')} inputMode="numeric" maxLength={12} value={inn} onChange={(e) => lookup(e.target.value.replace(/\D/g, ''))} placeholder="0000000000" />
                      <button className="btn primary lg" onClick={() => (inn.length === 10 || inn.length === 12 ? lookup(inn) : setInnErr('ИНН — 10 цифр для организации или 12 для ИП'))}>Найти компанию <IArrow /></button>
                    </div>
                  </Field>
                </div>
                {company && (
                  <div className="grayrow" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 22, padding: '26px 30px' }} aria-live="polite">
                    <div className="row between"><b style={{ fontSize: 26 }}>{company.name}</b><span className="demotag">Демо-данные</span></div>
                    <div className="kvgrid">
                      <div><div className="k">Статус</div><div className="v" style={{ color: company.status === 'active' ? undefined : 'var(--red)' }}>{company.status === 'active' ? 'Действует' : 'Ликвидируется'}</div></div>
                      <div><div className="k">Дата регистрации</div><div className="v">{company.reg_date ? dateOnly(company.reg_date) : '—'} <span className="muted small" style={{ fontWeight: 400 }}>· {age(company.age_months)}</span></div></div>
                      <div><div className="k">Руководитель</div><div className="v">{company.director}</div></div>
                      <div><div className="k">Деятельность</div><div className="v">{company.okved}</div></div>
                    </div>
                    {company.status !== 'active' && <div className="pinkalert"><b>Компания ликвидируется</b><span>Заявку можно отправить, но банк, скорее всего, не сможет её одобрить.</span></div>}
                  </div>
                )}
                {demo && (
                  <details><summary className="small muted">Демо-ИНН для проверки сценариев</summary>
                    <div className="stack sm" style={{ marginTop: 12 }}>{demo.map((d) => <button key={d.inn} className="docrow" style={{ border: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => lookup(d.inn)}><span className="grow"><b>{d.name}</b><div className="tiny muted">{d.title}</div></span><span className="num small">{d.inn}</span></button>)}</div></details>
                )}
                <Nav />
              </>)}

              {step === 3 && (<>
                <div><h2>Как идут дела у бизнеса?</h2><p className="sub">Показатели за последний год · в демо все значения вымышлены</p></div>
                <div className="grid g2" style={{ gap: 20 }}>
                  <Field label="Выручка за год" error={errs.revenue}><Money value={fin.revenue_year} onChange={(v) => setFin({ ...fin, revenue_year: v })} placeholder="24 000 000" /></Field>
                  <Field label="Чистая прибыль за год" error={errs.profit}><Money value={fin.net_profit_year} onChange={(v) => setFin({ ...fin, net_profit_year: v })} placeholder="4 800 000" /></Field>
                  <Field label="Средний оборот в месяц" error={errs.turnover}><Money value={fin.monthly_turnover} onChange={(v) => setFin({ ...fin, monthly_turnover: v })} placeholder="2 000 000" /></Field>
                  <Field label="Платежи по кредитам в месяц" error={errs.obl}><Money value={fin.monthly_obligations} onChange={(v) => setFin({ ...fin, monthly_obligations: v })} placeholder="0" /></Field>
                  <Field label="Контактное лицо" error={errs.cname}><input className="input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="Демо-пользователь" /></Field>
                  <Field label="Телефон" error={errs.phone}><input className="input" inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="+7 (000) 000-00-00" /></Field>
                </div>
                {collateral && <Field label="Что в залоге"><input className="input" value={collNote} onChange={(e) => setCollNote(e.target.value)} placeholder="Например, грузовой автомобиль 2021 г." /></Field>}
                <Nav />
              </>)}

              {step === 4 && draft && (<>
                <div><h2>Добавь документы компании</h2><p className="sub">PDF, JPG, PNG или XLSX · до 5 МБ на файл в демо-сценарии</p></div>
                <input ref={fileRef} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f && uploadKind) upload(uploadKind, f); e.target.value = '' }} />
                <div className="stack">
                  {draft.required_documents.map((rd) => { const doc = draft.documents.find((d) => d.kind === rd.kind)
                    return (
                      <div key={rd.kind} className="grayrow">
                        <div><b>{rd.label}</b>
                          {doc ? <><div className="small muted" style={{ marginTop: 6 }}>Загружен{doc.filename.includes('demo') ? ' · демо-файл' : ''}</div><div className="small muted">{doc.filename} · {fileSize(doc.size)}</div></>
                            : <><div className="small" style={{ color: 'var(--red)', marginTop: 6 }}>Не загружен</div><div className="small muted">Добавь файл или продолжи без него</div></>}</div>
                        <button className="btn white2 lg" disabled={busy} onClick={() => { setUploadKind(rd.kind); fileRef.current?.click() }}>Загрузить</button>
                      </div>) })}
                </div>
                <p className="muted">Не хватает документа? Можно отправить заявку и дослать его по запросу.{missingDocs.length > 0 && <> <button className="back" style={{ background: 'none', border: 0, font: 'inherit', color: 'var(--red)', cursor: 'pointer', padding: 0 }} onClick={demoDocs}>Приложить демо-файлы</button></>}</p>
                <Nav label="Проверить" onClick={() => go(5)} />
              </>)}

              {step === 5 && draft && (<>
                <div><h2>Всё в одном месте</h2><p className="sub">Демонстрационная заявка · {draft.company.name}</p></div>
                <div>
                  <div className="reviewrow"><span className="k">Продукт</span><span className="v">{short.name}</span><button onClick={() => go(0)}>Изменить</button></div>
                  <div className="reviewrow"><span className="k">Параметры</span><span className="v">{rub(amount)} · {months(term)}</span><button onClick={() => go(1)}>Изменить</button></div>
                  <div className="reviewrow"><span className="k">Документы</span><span className="v">{upCount} из {draft.required_documents.length} файлов загружен{upCount === 1 ? '' : 'о'}</span><button onClick={() => go(4)}>Изменить</button></div>
                </div>
                {missingDocs.length > 0 && <div className="pinkalert"><b>Не хватает: {missingDocs.map((d) => d.label.toLowerCase()).join(', ')}</b><span>После отправки банк сможет запросить недостающий документ.</span></div>}
                <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>Согласен на обработку данных и запрос сведений<div className="small muted">из реестров и БКИ. В демо реальные запросы не выполняются.</div></span></label>
                <Nav label="Отправить заявку" onClick={submit} disabled={busy || !consent} />
              </>)}
            </section>
          </div>
          <aside>
            <div className="sidecard">
              <h4>Твоя заявка</h4><div className="pn">{short.name}</div><div className="big num">{rub(amount)}</div><div className="muted" style={{ marginTop: 6 }}>на {months(term)}{collateral ? ' · с залогом' : ''}</div>
              <hr /><div className="sumnote">Ставка и платёж — после проверки</div><div className="small muted" style={{ marginTop: 8 }}>Параметры приведены для демо</div>
            </div>
            <div className="sidecard"><div className="help"><span style={{ width: 28 }}><StarMark /></span>Нужна помощь?</div><p className="muted" style={{ marginTop: 10 }}>Поясним поля и следующий шаг.</p><div className="redlink" style={{ marginTop: 10 }}>ИИ-помощник — в планах</div></div>
          </aside>
        </div>
      )}
      </div>
    </div>
  )
}
