import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Navbar from './components/Navbar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewSession from './pages/NewSession'
import SessionLog from './pages/SessionLog'
import GroupSession from './pages/GroupSession'
import ClientProgress from './pages/ClientProgress'
import ClientList from './pages/ClientList'
import Manage from './pages/Manage'

function AppShell({ signOut }) {
  return (
    <div className="min-h-svh w-full flex flex-col bg-slate-50 text-left">
      <div className="flex min-h-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>
      <Navbar signOut={signOut} />
    </div>
  )
}

export default function App() {
  const { user, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Laden…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<AppShell signOut={signOut} />}>
        <Route index element={<Dashboard />} />
        <Route path="new-session" element={<NewSession />} />
        <Route path="group-session" element={<GroupSession />} />
        <Route path="clients" element={<ClientList />} />
        <Route path="manage" element={<Manage />} />
        <Route path="session/:id" element={<SessionLog />} />
        <Route path="client/:clientId/progress" element={<ClientProgress />} />
      </Route>
    </Routes>
  )
}
