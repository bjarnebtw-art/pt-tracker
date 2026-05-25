import { NavLink } from 'react-router-dom'
import { LayoutDashboard, PlusCircle, Users, LogOut } from 'lucide-react'

const linkClass = ({ isActive }) =>
  [
    'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-medium transition-colors',
    isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700',
  ].join(' ')

export default function Navbar({ signOut }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 w-full shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="Hoofdnavigatie"
    >
      <div className="mx-auto flex max-w-3xl items-stretch">
        <NavLink to="/" end className={linkClass} title="Dashboard">
          <LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/new-session" className={linkClass} title="Nieuwe training">
          <PlusCircle className="h-5 w-5 shrink-0" aria-hidden />
          <span>Nieuwe training</span>
        </NavLink>

        <NavLink to="/clients" className={linkClass} title="Klanten">
          <Users className="h-5 w-5 shrink-0" aria-hidden />
          <span>Klanten</span>
        </NavLink>

        <button
          type="button"
          onClick={() => void signOut()}
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-2 py-2 text-xs font-medium text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-900/10"
          title="Uitloggen"
        >
          <LogOut className="h-5 w-5 shrink-0" aria-hidden />
          <span>Uitloggen</span>
        </button>
      </div>
    </nav>
  )
}
