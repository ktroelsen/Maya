import { BookOpen, BookText, Camera, History, Map, type LucideIcon } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import OfflineBanner from './OfflineBanner';

const nav: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/', label: 'Kapitler', icon: BookOpen },
  { to: '/tidslinje', label: 'Tidslinje', icon: History },
  { to: '/kort', label: 'Kort', icon: Map },
  { to: '/ordliste', label: 'Ordliste', icon: BookText },
  { to: '/guide', label: 'Guide', icon: Camera },
];

// Mobile: top bar + bottom tab bar. Desktop: the same links in the top bar.
export default function Layout() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b-2 border-accent/60 bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2">
            <img src="/icons/icon-192.png" alt="" className="h-8 w-8 rounded-lg" />
            <span className="font-serif text-xl font-semibold tracking-wide">Mayaerne</span>
          </NavLink>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                    isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <OfflineBanner />

      <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-10">
        <div className="mx-auto max-w-3xl px-4 py-6 md:py-10">
          <Outlet />
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-5 border-t-2 border-accent/60 bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-xs ${isActive ? 'text-accent' : 'text-muted'}`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
