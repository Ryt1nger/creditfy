import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../api/auth'
import { API_BASE, MODE } from '../api/client'
import type { Me } from '../api/types'
import { Ribbon } from '../ui/Shell'
import { Decor, Field } from '../ui/kit'
import { IArrow, IBuild, IShield } from '../ui/Icons'

export default function Login() {
  const auth = useAuth(); const nav = useNavigate()
  const [slow, setSlow] = useState(false)
  useEffect(() => { if (MODE === 'live') fetch(API_BASE + '/api/health').catch(() => {}) }, [])
  const [audience, setAudience] = useState<'client' | 'bank'>('client')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [agree, setAgree] = useState(false)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function perform(action: () => Promise<Me>) {
    setErr(''); setBusy(true)
    const timer = setTimeout(() => setSlow(true), 2500)
    try {
      const user = await action()
      nav(user.role === 'client' ? '/' : '/bank', { replace: true })
    } catch (e) { setErr((e as Error).message) }
    finally { clearTimeout(timer); setBusy(false); setSlow(false) }
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'register' && name.trim().length < 2) return setErr('Укажите имя и фамилию')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr('Укажите корректную почту')
    if (!pw || (mode === 'register' && pw.length < 6)) return setErr(mode === 'register' ? 'Пароль — не короче 6 символов' : 'Введите пароль')
    await perform(() => mode === 'login' ? auth.login(email, pw) : auth.register(name, email, pw))
  }
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
              <div><h2>{mode === 'login' ? 'Вход в кабинет' : 'Регистрация'}</h2><p className="muted" style={{ marginTop: 6 }}>{mode === 'login' ? (audience === 'bank' ? 'Вход оператора или андеррайтера. Права назначает банк.' : 'Введите почту и пароль предпринимателя.') : 'Создайте кабинет предпринимателя — без писем и SMS.'}</p></div>
              {mode === 'login' && <div className="roles" role="radiogroup" aria-label="Тип кабинета">
                <button type="button" role="radio" aria-checked={audience === 'client'} onClick={() => setAudience('client')} className={audience === 'client' ? 'on' : ''}><IBuild size={22} /><b>Предприниматель</b><span>Подаю заявку на кредит</span></button>
                <button type="button" role="radio" aria-checked={audience === 'bank'} onClick={() => setAudience('bank')} className={audience === 'bank' ? 'on' : ''}><IShield size={22} /><b>Сотрудник банка</b><span>Рассматриваю заявки</span></button>
              </div>}
              <form className="stack" onSubmit={submit} noValidate>
                {mode === 'register' && <Field label="Имя и фамилия"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иван Иванов" autoComplete="name" /></Field>}
                <Field label="Эл. почта"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.ru" autoComplete="username" /></Field>
                <Field label="Пароль" hint={mode === 'register' ? 'Не короче 6 символов' : undefined}><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
                {mode === 'register' && <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span className="small">Согласен на обработку данных. Для проверки используйте вымышленные данные.</span></label>}
                {err && <div className="callout bad">{err}</div>}
                <button className="btn primary lg" disabled={busy || (mode === 'register' && !agree)}>{busy ? 'Открываем кабинет…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'} <IArrow /></button>
              </form>
              {(mode === 'register' || audience === 'client') && <button type="button" className="btn light lg" disabled={busy} onClick={() => perform(auth.demo)}>Продолжить с готовым кабинетом</button>}
              {slow && <div className="callout" role="status">Сервер запускается. Первый вход может занять до минуты.</div>}
              <div className="small muted" style={{ textAlign: 'center' }}>{mode === 'login' ? 'Нет кабинета? ' : 'Уже есть кабинет? '}<button className="linkbtn" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setAudience('client'); setErr('') }}>{mode === 'login' ? 'Зарегистрироваться' : 'Войти'}</button></div>

          </div>
        </section>
      </div>
    </>
  )
}
