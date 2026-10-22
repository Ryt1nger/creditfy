import { Link } from 'react-router-dom'
import { useMyApps } from '../api/hooks'
import type { ApplicationSummary } from '../api/types'
import { Empty, ErrorBox, Loading, Stepper, StatusPill } from '../ui/kit'
import { STEPS } from '../mock/engine'
import { IArrow, IPlus } from '../ui/Icons'
import { dt, months, pct, rub } from '../lib/format'

export function AppCard({ a, to }: { a: ApplicationSummary; to: string }) {
  const failed = ['REJECTED', 'EXPIRED', 'DECLINED_BY_CLIENT', 'CANCELLED'].includes(a.status)
  return (
    <Link to={to} className={'card app-card' + (a.group === 'action' ? ' accent' : '')}>
      <div className="row between wrap">
        <div className="row"><StatusPill a={a} />{a.group === 'action' && <span className="tag">Нужно ваше действие</span>}</div>
        <span className="tiny muted">{a.number} · обновлено {dt(a.updated_at)}</span>
      </div>
      <div className="row between wrap" style={{ alignItems: 'flex-end', gap: 20 }}>
        <div><div className="muted small">{a.product_name} · {a.company_name}</div><div className="sum num" style={{ marginTop: 6 }}>{rub(a.offer && a.status === 'OFFER_READY' ? a.offer.amount : a.amount)}</div><div className="muted small" style={{ marginTop: 4 }}>на {months(a.offer?.term_months ?? a.term_months)}{a.offer ? ` · ${pct(a.offer.rate)} · ${rub(a.offer.monthly_payment)}/мес.` : ''}</div></div>
        <span className="btn light sm">Открыть <IArrow size={18} /></span>
      </div>
      <Stepper steps={STEPS} current={a.step} status={a.status} running={a.processing || a.group === 'progress'} />
      <div className={'small ' + (failed ? '' : 'muted')}>{a.hint}</div>
    </Link>
  )
}

import { TitleBar } from '../ui/alfa'

export default function MyApps() {
  const { data, isLoading, error, refetch } = useMyApps()
  return (
    <div className="stack lg">
      <TitleBar>Мои заявки</TitleBar>
      <div className="row between wrap"><span className="muted">Статусы обновляются сами — страницу перезагружать не нужно.</span><Link to="/apply" className="btn primary"><IPlus size={18} /> Новая заявка</Link></div>
      {isLoading && <div className="stack"><Loading h={200} /><Loading h={200} /></div>}
      {error && <ErrorBox error={error} retry={refetch} />}
      {data && data.length === 0 && <Empty title="Заявок пока нет" text="Начните с короткого описания задачи — подскажем подходящий продукт и посчитаем платёж." action={<Link className="btn primary" to="/apply">Подать первую заявку</Link>} />}
      <div className="grid g2" style={{ alignItems: 'stretch' }}>{(data ?? []).map((a) => <AppCard key={a.id} a={a} to={a.status === 'DRAFT' ? `/apply/${a.id}` : `/applications/${a.id}`} />)}</div>
    </div>
  )
}
