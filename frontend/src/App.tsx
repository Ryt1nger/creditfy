import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './api/auth'
import { Shell } from './ui/Shell'
import { Loading } from './ui/kit'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MyApps from './pages/MyApps'
import Documents from './pages/Documents'
import Quiz from './pages/Quiz'
import Wizard from './pages/Wizard'
import ApplicationDetail from './pages/ApplicationDetail'
import { BankQueue, BankReview, BankStats } from './pages/Bank'

function QuizKeyed() { const loc = useLocation(); return <Quiz key={loc.key} /> }

export default function App() {
  const { me, ready } = useAuth()
  if (!ready) return <div style={{ padding: 40 }}><Loading h={200} /></div>
  if (!me) return <Routes><Route path="/login" element={<Login />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>
  const bank = me.role !== 'client'
  return (
    <Routes>
      <Route element={<Shell />}>
        {bank ? (<><Route path="/bank" element={<BankQueue />} /><Route path="/bank/applications/:id" element={<BankReview />} /><Route path="/bank/stats" element={<BankStats />} /><Route path="*" element={<Navigate to="/bank" replace />} /></>)
          : (<><Route path="/" element={<Dashboard />} /><Route path="/applications" element={<MyApps />} /><Route path="/documents" element={<Documents />} /><Route path="/apply" element={<QuizKeyed />} /><Route path="/apply/:id" element={<Wizard />} /><Route path="/applications/:id" element={<ApplicationDetail />} /><Route path="*" element={<Navigate to="/" replace />} /></>)}
      </Route>
    </Routes>
  )
}
