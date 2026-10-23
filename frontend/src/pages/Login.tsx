import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../api/auth'
import { Ribbon } from '../ui/Shell'
import { Decor, Field } from '../ui/kit'
import { IArrow, IBuild, IShield } from '../ui/Icons'

const STEPS = {
  login: { client: ['Проверяем почту и пароль', 'Открываем кабинет предпринимателя'], bank: ['Проверяем почту и пароль', 'Проверяем доступ сотрудника', 'Открываем кабинет банка'] },
  register: { client: ['Проверяем данные', 'Создаём профиль предпринимателя', 'Подтверждаем кабинет (симуляция)'], bank: ['Проверяем данные', 'Проверяем полномочия сотрудника (симуляция)', 'Создаём кабинет банка'] },
} as const
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function Login() {
  const { login, register } = useAuth(); const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login'); const [role, setRole] = useState<'client' | 'bank'>('client')
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [agree, setAgree] = useState(false)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState<{ i: number } | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (mode === 'register' && name.trim().length < 2) return setErr('Укажите имя и фамилию')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr('Укажите корректную почту')
    if (!pw || (mode === 'register' && pw.length < 6)) return setErr(mode === 'register' ? 'Пароль — не короче 6 символов' : 'Введите пароль')
    setBusy(true); setProgress({ i: 0 })
    const steps = STEPS[mode][role]
    // сам запрос идёт параллельно с показом шагов: пользователь видит процесс, а ошибка (чужой пароль, занятая почта) приходит сразу после него
    const call = (mode === 'login' ? login(email, pw) : register(name.trim(), email, pw, role)).then((u) => ({ u }), (x) => ({ x }))
    for (let i = 0; i < steps.length; i++) { setProgress({ i }); await sleep(650) }
    const r = await call
    if ('x' in r) { setProgress(null); setBusy(false); setErr((r.x as Error).message); return }
    if (role === 'client' && r.u.role !== 'client') { setProgress(null); setBusy(false); setErr('Эта почта относится к сотруднику банка — выберите «Сотрудник банка»'); return }
    if (role === 'bank' && r.u.role === 'client') { setProgress(null); setBusy(false); setErr('Эта почта относится к предпринимателю — выберите «Предприниматель»'); return }
    setProgress({ i: steps.length }); await sleep(350); nav(r.u.role === 'client' ? '/' : '/bank')
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
            {progress ? (
              <div className="stack lg" aria-live="polite">
                <div><h2>{mode === 'login' ? 'Входим…' : 'Создаём кабинет…'}</h2><p className="muted" style={{ marginTop: 6 }}>Это имитация: письма, SMS и звонков нет — всё происходит внутри продукта.</p></div>
                <ol className="authsteps">{STEPS[mode][role].map((t, i) => <li key={t} className={i < progress.i ? 'done' : i === progress.i ? 'cur' : ''}><span>{i < progress.i ? '✓' : i + 1}</span>{t}</li>)}</ol>
              </div>
            ) : (<>
              <div><h2>{mode === 'login' ? 'Вход в кабинет' : 'Регистрация'}</h2><p className="muted" style={{ marginTop: 6 }}>{mode === 'login' ? 'Выберите, кто вы, и введите почту и пароль.' : 'Создадим кабинет за полминуты — подтверждение прямо здесь.'}</p></div>
              <div className="roles" role="radiogroup" aria-label="Кто вы">
                <button type="button" role="radio" aria-checked={role === 'client'} className={role === 'client' ? 'on' : ''} onClick={() => setRole('client')}><IBuild size={22} /><b>Предприниматель</b><span>подаю заявку на кредит</span></button>
                <button type="button" role="radio" aria-checked={role === 'bank'} className={role === 'bank' ? 'on' : ''} onClick={() => setRole('bank')}><IShield size={22} /><b>Сотрудник банка</b><span>рассматриваю заявки</span></button>
              </div>
              <form className="stack" onSubmit={submit} noValidate>
                {mode === 'register' && <Field label="Имя и фамилия"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иван Иванов" autoComplete="name" /></Field>}
                <Field label="Эл. почта"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.ru" autoComplete="username" /></Field>
                <Field label="Пароль" hint={mode === 'register' ? 'Не короче 6 символов' : undefined}><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>
                {mode === 'register' && <label className="check"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span className="small">Согласен на обработку данных. Все данные в демо вымышлены.</span></label>}
                {err && <div className="callout bad">{err}</div>}
                <button className="btn primary lg" disabled={busy || (mode === 'register' && !agree)}>{mode === 'login' ? 'Войти' : 'Зарегистрироваться'} <IArrow /></button>
              </form>
              <div className="small muted" style={{ textAlign: 'center' }}>{mode === 'login' ? 'Нет кабинета? ' : 'Уже есть кабинет? '}<button className="linkbtn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr('') }}>{mode === 'login' ? 'Зарегистрироваться' : 'Войти'}</button></div>
            </>)}
          </div>
        </section>
      </div>
    </>
  )
}
