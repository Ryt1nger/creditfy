import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../api/auth'
import { api } from '../api/client'
import type { DemoAccount } from '../api/types'
import { Ribbon } from '../ui/Shell'
import { Decor, Field } from '../ui/kit'
import { IArrow, IBuild, IUser, IShield } from '../ui/Icons'

export default function Login() {
  const { login } = useAuth(); const nav = useNavigate()
  const [acc, setAcc] = useState<DemoAccount[]>([]); const [email, setEmail] = useState(''); const [pw, setPw] = useState('demo123')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  useEffect(() => { api<DemoAccount[]>('GET', '/auth/demo-accounts').then(setAcc).catch(() => {}) }, [])
  async function go(e: string, p: string) {
    setBusy(true); setErr('')
    try { const u = await login(e, p); nav(u.role === 'client' ? '/' : '/bank') } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  const submit = (e: FormEvent) => { e.preventDefault(); go(email, pw) }
  const clients = acc.filter((a) => a.role === 'client'), bank = acc.filter((a) => a.role !== 'client')
  const Row = ({ a }: { a: DemoAccount }) => (
    <button className="acc" onClick={() => go(a.email, 'demo123')} disabled={busy}>
      <span className="avatar" style={{ background: a.role === 'client' ? 'var(--lime)' : 'var(--purple)', color: a.role === 'client' ? 'var(--ink)' : '#fff' }}>{a.name[0]}</span>
      <span className="grow"><div style={{ fontWeight: 700 }}>{a.name}</div><div className="small muted">{a.hint}</div></span><IArrow size={20} />
    </button>
  )
  return (
    <>
      <Ribbon />
      <div className="login">
        <section className="hero">
          <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-0.04em' }}>Альфа-Банк <span style={{ fontWeight: 500, opacity: 0.8, fontSize: 16, marginLeft: 8 }}>для бизнеса</span></div>
          <div className="stack lg" style={{ position: 'relative', zIndex: 1 }}>
            <span className="tag" style={{ alignSelf: 'flex-start' }}>Умный кредитный кабинет</span>
            <h1>Кредит для бизнеса — от потребности до денег на счёте</h1>
            <p style={{ fontSize: 19, maxWidth: 480, opacity: 0.95 }}>Подберём продукт, проверим данные в реестрах, покажем каждый шаг и объясним решение. Без визитов в отделение, писем и звонков.</p>
            <div className="row wrap" style={{ gap: 10 }}>
              {['Подбор продукта', 'Статус в реальном времени', 'Понятное решение'].map((t) => <span key={t} className="pill" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}>{t}</span>)}
            </div>
          </div>
          <Decor />
        </section>
        <section className="panel">
          <div className="card stack lg" style={{ width: 480, maxWidth: '100%' }}>
            <div><h2>Войти в демо</h2><p className="muted" style={{ marginTop: 6 }}>Выберите роль — пароль подставится сам (<b>demo123</b>).</p></div>
            <div className="stack sm"><div className="row small muted" style={{ fontWeight: 600 }}><IBuild size={18} /> Предприниматель</div>{clients.map((a) => <Row key={a.email} a={a} />)}</div>
            <div className="stack sm"><div className="row small muted" style={{ fontWeight: 600 }}><IShield size={18} /> Сотрудник банка</div>{bank.map((a) => <Row key={a.email} a={a} />)}</div>
            <details>
              <summary className="small muted"><IUser size={16} style={{ verticalAlign: -3 }} /> Войти вручную</summary>
              <form className="stack" onSubmit={submit} style={{ marginTop: 14 }}>
                <Field label="Эл. почта"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ivan@demo.ru" autoComplete="username" /></Field>
                <Field label="Пароль"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
                <button className="btn primary lg" disabled={busy}>Войти</button>
              </form>
            </details>
            {err && <div className="callout bad">{err}</div>}
          </div>
        </section>
      </div>
    </>
  )
}
