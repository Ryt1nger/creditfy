import { Link } from 'react-router-dom'
import { useApp, useMyApps } from '../api/hooks'
import { Empty, Loading } from '../ui/kit'
import { TitleBar } from '../ui/alfa'
import { IDoc } from '../ui/Icons'
import { fileSize } from '../lib/format'

function AppDocs({ id, number, product }: { id: number; number: string; product: string }) {
  const { data } = useApp(id)
  if (!data) return <Loading h={90} />
  return (
    <section className="wcard" style={{ gap: 14 }}>
      <div className="row between wrap"><h2 style={{ fontSize: 22 }}>{product} · {number}</h2><Link className="btn white2 sm" to={data.status === 'DRAFT' ? `/apply/${id}` : `/applications/${id}`}>Открыть заявку</Link></div>
      {data.required_documents.length === 0 && <p className="muted">Для этой заявки документы не требуются.</p>}
      {data.required_documents.map((rd) => { const d = data.documents.find((x) => x.kind === rd.kind)
        return (
          <div key={rd.kind} className="grayrow"><div className="row"><IDoc /><div><b style={{ fontSize: 17 }}>{rd.label}</b><div className="small muted">{d ? `${d.filename} · ${fileSize(d.size)}` : 'Не загружен'}</div></div></div>
            <span className={'pill ' + (d ? 'green' : 'red')}>{d ? (d.status === 'verified' ? 'Проверен' : d.status === 'rejected' ? 'Отклонён' : 'Загружен') : 'Не загружен'}</span></div>) })}
    </section>
  )
}

export default function Documents() {
  const { data, isLoading } = useMyApps()
  return (
    <div className="stack lg">
      <TitleBar>Документы</TitleBar>
      {isLoading && <Loading h={200} />}
      {data && data.length === 0 && <Empty title="Документов пока нет" text="Они появятся, когда вы начнёте заявку." action={<Link className="btn primary" to="/apply">Подать заявку</Link>} />}
      {data?.map((a) => <AppDocs key={a.id} id={a.id} number={a.number} product={a.product_name} />)}
    </div>
  )
}
