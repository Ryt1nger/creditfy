import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter as BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles.css'
import App from './App'
import { AuthProvider } from './api/auth'
import { ToastProvider } from './ui/kit'

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={qc}><BrowserRouter><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></BrowserRouter></QueryClientProvider></StrictMode>,
)
