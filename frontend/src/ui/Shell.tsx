import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../api/auth'
import { useNotifications } from '../api/hooks'
import { api, MODE } from '../api/client'
import { resetDemo } from '../mock/engine'
import { dt } from '../lib/format'
import { IBell } from './Icons'
import { Logo } from './alfa'
import { useToast } from './kit'

export const Ribbon = () => (
  <div className="ribbon"><i /><b>Демо-прототип</b> · синтетические данные · симуляторы ЕГРЮЛ, БКИ и ФНС · не является реальным сервисом банка</div>
)

export function Shell() {
  const { me, logout } = useAuth(); const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast(); const loc = useLocation()
  const [open, setOpen] = useState<'' | 'n' | 'u'>(''); const ref = useRef<HTMLDivElement>(null)
  const { data: ns = [] } = useNotifications(); const unread = ns.filter((n) => !n.read).length
  const bank = me?.role !== 'client'
  useEffect(() => { const h = (e: MouseEvent) => { if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen('') }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [open])
  useEffect(() => { if (!loc.pathname.startsWith('/apply')) window.scrollTo({ top: 0, behavior: 'smooth' }) }, [loc.pathname])
  if (!me) return null
  const role = { client: 'Предприниматель', operator: 'Оператор банка', underwriter: 'Андеррайтер' }[me.role]
  const apps = loc.pathname.startsWith('/apply') || loc.pathname.startsWith('/applications')
  const soon = () => toast('Этот раздел в демо-версии не реализован')
  const anchor = (id: string) => { nav('/'); setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120) }
  const act = (a: any) => () => (a === 'soon' ? soon() : typeof a === 'string' ? anchor(a) : nav(a.to, { state: a.state }))
  return (
    <>
      <header className="header">
        <div className="in">
          <Link to="/" className="brand" aria-label="Альфа-Банк"><Logo /><span className="bank">Альфа-Банк</span><span className="prod">{bank ? 'Кабинет кредитного специалиста' : 'Кредитный кабинет'}</span></Link>
          <div className="grow" />
          <div className="hlinks"><button onClick={soon}>Помощь</button><button onClick={soon}>Настройки</button></div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10 }} ref={ref}>
            <button className="iconbtn" aria-label="Уведомления" onClick={() => { const o = open === 'n' ? '' : 'n'; setOpen(o); if (o && unread) api('POST', '/notifications/read-all').then(() => qc.invalidateQueries({ queryKey: ['notifications'] })) }}>
              <IBell />{unread > 0 && <span className="dot" />}
            </button>
            <button className="company" onClick={() => setOpen(open === 'u' ? '' : 'u')} aria-haspopup="menu" aria-expanded={open === 'u'}>
              <span className="av">{me.name[0]}</span><span className="nm">{me.name}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {open === 'n' && (
              <div className="popover" role="menu">
                <h4 style={{ padding: '10px 14px' }}>Уведомления</h4>
                {ns.length === 0 && <p className="muted small" style={{ padding: '4px 14px 14px' }}>Пока нет уведомлений. Все события по заявкам появятся здесь — письма и SMS не нужны.</p>}
                {ns.slice(0, 8).map((n) => (
                  <div key={n.id} className={'n' + (n.read ? '' : ' unread')} onClick={() => { setOpen(''); if (n.application_id) nav(bank ? `/bank/applications/${n.application_id}` : `/applications/${n.application_id}`) }}>
                    <div><div className="small" style={{ fontWeight: 600 }}>{n.text}</div><div className="tiny muted">{dt(n.created_at)}</div></div>
                  </div>
                ))}
              </div>
            )}
            {open === 'u' && (
              <div className="popover" role="menu" style={{ width: 260 }}>
                <div style={{ padding: '10px 14px' }}><div style={{ fontWeight: 700 }}>{me.name}</div><div className="tiny muted">{role}</div></div>
                <button className="btn light block" onClick={() => { logout(); nav('/login') }}>Выйти</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <nav className="tabs" aria-label="Разделы">
        {bank ? (<><NavLink to="/bank" end className={({ isActive }) => (isActive ? 'on' : '')}>Очередь заявок</NavLink><NavLink to="/bank/stats" className={({ isActive }) => (isActive ? 'on' : '')}>Аналитика</NavLink></>) : (
          <><NavLink to="/" end className={({ isActive }) => (isActive ? 'on' : '')}>Продукты</NavLink>
            <Link to="/applications" className={apps ? 'on' : ''}>Мои заявки</Link>
            <NavLink to="/documents" className={({ isActive }) => (isActive ? 'on' : '')}>Документы</NavLink></>)}
      </nav>
      <main className="page"><Outlet /></main>
      <footer className="bigfooter">
        {!bank && <div className="bf-cta">
          <div className="bf-cta-in">
            <div><h3>Деньги на развитие — без визита в банк</h3><p>Заявка занимает около пяти минут, статус виден в кабинете.</p></div>
            <Link to="/apply" className="btn white lg">Подать заявку <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
          </div>
          <i className="cube lime f1" /><i className="cube white f2" />
        </div>}
        <div className="bf-in">
          <div className="bf-top">
            <div className="bf-brand"><Logo h={44} /><b>Альфа-Банк</b><p>Кредитный кабинет предпринимателя — концепт цифрового кредитного конвейера для малого и микробизнеса.</p>
              <div className="bf-badges"><span>Web</span><span>Без SMS</span><span>Демо</span></div></div>
            {(bank
              ? [['Кабинет', [['Очередь заявок', { to: '/bank' }], ['Аналитика', { to: '/bank/stats' }]]], ['О прототипе', [['Скоринг и решения', 'soon'], ['Тестовые данные', 'soon']]]]
              : [['Бизнесу', [['Оборотный кредит', { to: '/apply', state: { code: 'working_capital' } }], ['Инвестиционный кредит', { to: '/apply', state: { code: 'investment' } }], ['Овердрафт', { to: '/apply', state: { code: 'overdraft' } }], ['Кредит на оборудование', { to: '/apply', state: { code: 'equipment' } }]]], ['Кабинет', [['Продукты', { to: '/' }], ['Мои заявки', { to: '/applications' }], ['Документы', { to: '/documents' }], ['Подать заявку', { to: '/apply' }]]], ['О прототипе', [['Как это работает', 'flow'], ['Скоринг и решения', 'why'], ['Условия продуктов', 'rates'], ['Тестовые данные', 'soon']]], ['Поддержка', [['Помощь', 'soon'], ['Вопросы и ответы', 'faq'], ['Безопасность', 'soon'], ['Контакты', 'soon']]]]
            ).map(([h, items]: any) => (
              <div key={h} className="bf-col"><h5>{h}</h5>{items.map(([t, a]: any) => <button key={t} onClick={act(a)}>{t}</button>)}</div>
            ))}
          </div>
          <p className="bf-legal">Это учебный прототип, созданный для хакатона. Он не является сервисом или офертой банка; все компании, ИНН, суммы и решения вымышлены. Реальные запросы в государственные реестры и бюро кредитных историй не выполняются. Название и стиль использованы только в рамках конкурсного задания.</p>
          <div className="bf-bot"><span>© Концепт хакатона · демонстрационные данные · симуляторы ЕГРЮЛ, БКИ, ФНС</span><span>{MODE === 'mock' ? <button onClick={resetDemo}>Сбросить демо-данные</button> : 'Режим подключения к API'}</span><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Наверх ↑</button></div>
          <div className="bf-mark" aria-hidden>Альфа</div>
        </div>
      </footer>
    </>
  )
}
