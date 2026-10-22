import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import type { ApplicationSummary, StatusCode } from '../api/types'
import { ICheck, IClock, IWarn, IBolt, IX } from './Icons'

// ── уведомления-тосты ──
const ToastCtx = createContext<(msg: string, err?: boolean) => void>(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; err: boolean } | null>(null)
  const show = useCallback((msg: string, err = false) => { setT({ msg, err }); setTimeout(() => setT(null), 4200) }, [])
  return <ToastCtx.Provider value={show}>{children}{t && <div className={'toast' + (t.err ? ' err' : '')} role="status">{t.msg}</div>}</ToastCtx.Provider>
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-bg" onClick={onClose} role="dialog" aria-modal aria-label={title}>
      <div className="modal stack" onClick={(e) => e.stopPropagation()}>
        <div className="row between"><h2>{title}</h2><button className="iconbtn" onClick={onClose} aria-label="Закрыть"><IX /></button></div>
        {children}
      </div>
    </div>
  )
}

// ── статус ──
const PILL: Record<string, string> = { draft: '', progress: 'blue', action: 'lime', final: '' }
export function statusPillClass(a: Pick<ApplicationSummary, 'group' | 'status'>) {
  if (a.status === 'DISBURSED') return 'green'
  if (['REJECTED', 'EXPIRED'].includes(a.status)) return 'red'
  return PILL[a.group] ?? ''
}
export function StatusPill({ a }: { a: Pick<ApplicationSummary, 'group' | 'status' | 'status_label' | 'processing'> }) {
  return <span className={'pill ' + statusPillClass(a)}>{a.processing && <span className="pulse" />}{a.status_label}</span>
}

export function StatusIcon({ a }: { a: Pick<ApplicationSummary, 'group' | 'status' | 'processing'> }) {
  const bad = ['REJECTED', 'EXPIRED'].includes(a.status), ok = a.status === 'DISBURSED'
  const cls = ok ? 'ok' : bad ? 'fail' : a.group === 'action' ? 'action' : 'progress'
  return <div className={'status-ico ' + cls}>{ok ? <ICheck size={30} /> : bad ? <IWarn size={30} /> : a.group === 'action' ? <IBolt size={30} /> : a.processing ? <div className="spinner" style={{ width: 28, height: 28 }} /> : <IClock size={30} />}</div>
}

export function Stepper({ steps, current, status, running }: { steps: string[]; current: number; status: StatusCode; running: boolean }) {
  const failed = ['REJECTED', 'EXPIRED', 'DECLINED_BY_CLIENT', 'CANCELLED'].includes(status), okfinal = status === 'DISBURSED'
  return (
    <div className="stepper" style={{ ['--n' as any]: steps.length }} role="list" aria-label="Этапы заявки">
      {steps.map((t, i) => {
        const done = i < current || (okfinal && i <= current)
        const cur = i === current && !okfinal
        const cls = ['s', done ? 'done' : '', cur ? 'cur' : '', cur && running ? 'running' : '', cur && failed ? 'fail' : '', okfinal && i === current ? 'cur okfinal' : ''].join(' ')
        return <div key={t} className={cls} role="listitem" aria-current={cur ? 'step' : undefined}><div className="bar" /><div className="t">{t}</div></div>
      })}
    </div>
  )
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <div className="card stack" style={{ alignItems: 'center', textAlign: 'center', padding: 48 }}><div className="pix" style={{ ['--c' as any]: 4, width: 64 }}>{[1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 0, 0, 1, 0].map((o, i) => <i key={i} style={{ opacity: o ? 1 : 0.15 }} />)}</div><h3>{title}</h3>{text && <p className="muted" style={{ maxWidth: 420 }}>{text}</p>}{action}</div>
}
export const Loading = ({ h = 120 }: { h?: number }) => <div className="skeleton" style={{ height: h }} aria-busy aria-label="Загрузка" />
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = (error as Error)?.message ?? 'Ошибка'
  return <div className="callout bad"><IWarn /><div className="grow"><b>Не получилось загрузить данные.</b><div className="small">{msg}</div></div>{retry && <button className="btn sm dark" onClick={retry}>Повторить</button>}</div>
}
export function Field({ label, hint, error, children }: { label?: string; hint?: string; error?: string; children: ReactNode }) {
  return <div className="field">{label && <label>{label}</label>}{children}{error ? <span className="errtext">{error}</span> : hint ? <span className="hint">{hint}</span> : null}</div>
}
export function Decor({ variant = 'a' }: { variant?: 'a' | 'b' }) {
  return variant === 'a' ? (
    <>
      <div className="deco cube lime" style={{ width: 150, height: 150, right: 70, top: 30, transform: 'rotate(14deg)' }} />
      <div className="deco cube purple" style={{ width: 110, height: 110, right: 210, bottom: -20, transform: 'rotate(-12deg)' }} />
      <div className="deco cube white" style={{ width: 90, height: 90, right: 20, bottom: 40, transform: 'rotate(22deg)' }} />
      <div className="deco cube blue" style={{ width: 56, height: 56, right: 250, top: 40, transform: 'rotate(-24deg)' }} />
    </>
  ) : (
    <>
      <div className="deco cube lime" style={{ width: 120, height: 120, right: -20, top: -20, transform: 'rotate(20deg)' }} />
      <div className="deco cube white" style={{ width: 70, height: 70, right: 90, bottom: -14, transform: 'rotate(-16deg)' }} />
    </>
  )
}
