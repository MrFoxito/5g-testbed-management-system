import { useIsMutating } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { useScenarioStore, type ScenarioId } from '@/stores/scenario-store'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { sidebarData } from './data/sidebar-data'

export function TopNavigation() {
  const scenario = useScenarioStore((state) => state.scenario)
  const setScenario = useScenarioStore((state) => state.setScenario)
  const busy = useIsMutating() > 0
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const user = useAuthStore((state) => state.auth.user)
  const links = sidebarData.navGroups
    .flatMap((group) => group.items)
    .flatMap((item) => item.items ?? [item])
    .filter((item) => user?.role !== 'student' || item.url !== '/audit')

  return (
    <header className='sticky top-0 z-40 flex flex-wrap items-center gap-x-4 border-b px-3 md:px-4 xl:flex-nowrap bg-[#1B2A4A] border-white/10 dark:bg-background dark:border-border'>
      <Link
        to='/'
        aria-label='MAEstro · Inicio'
        className='flex h-14 shrink-0 items-center gap-2.5'
      >
        <img
          src='/images/logo-pucp.png'
          alt='PUCP'
          className='size-9 rounded-full object-cover dark:hidden'
        />
        <img
          src='/images/ems-network.svg'
          alt=''
          className='hidden size-8 dark:block'
        />
        <span className='hidden text-base font-bold tracking-tight sm:inline text-white dark:text-foreground'>
          <span>MAE</span>
          <span className='font-semibold'>stro</span>
        </span>
      </Link>
      <nav
        aria-label='Navegación principal'
        className='order-3 -mx-1 flex w-full min-w-0 items-center gap-0.5 overflow-x-auto px-1 pb-2 xl:order-none xl:mx-0 xl:h-14 xl:flex-1 xl:justify-center xl:pb-0'
      >
        {links.map((item) => {
          const active =
            item.url === '/'
              ? pathname === '/'
              : pathname === item.url || pathname.startsWith(`${item.url}/`)
          return (
            <Link
              key={item.url}
              to={item.url}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                // Light mode (PUCP blue bg)
                active
                  ? 'bg-white/15 text-white dark:bg-accent dark:text-accent-foreground'
                  : 'text-white/70 hover:bg-white/10 hover:text-white dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground',
                'focus-visible:ring-white/40 dark:focus-visible:ring-ring'
              )}
            >
              {item.title}
            </Link>
          )
        })}
      </nav>
      <div className='ml-auto flex h-14 shrink-0 items-center gap-2'>
        <Select
          value={scenario}
          onValueChange={(value) => setScenario(value as ScenarioId)}
          disabled={busy}
        >
          <SelectTrigger
            aria-label='Escenario global'
            className={cn(
              'h-8 w-32 text-xs sm:w-40',
              'border-white/20 bg-white/10 text-white hover:bg-white/15 [&>svg]:text-white/60',
              'dark:border-border dark:bg-transparent dark:text-foreground dark:hover:bg-accent dark:[&>svg]:text-muted-foreground'
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='5g-sa'>5G Standalone</SelectItem>
            <SelectItem value='4g-epc'>4G EPC</SelectItem>
          </SelectContent>
        </Select>
        <ThemeSwitch />
        <ProfileDropdown />
      </div>
    </header>
  )
}
