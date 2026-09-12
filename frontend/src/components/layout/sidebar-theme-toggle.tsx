import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/context/theme-provider'
import { Badge } from '@/components/ui/badge'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

export function SidebarThemeToggle() {
  const { theme, setTheme } = useTheme()

  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark')
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='sm'
          onClick={toggleTheme}
          tooltip={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className='text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors'
        >
          {isDark ? (
            <Sun className='size-4 text-amber-500 transition-transform hover:rotate-45' />
          ) : (
            <Moon className='size-4 text-indigo-500 transition-transform hover:-rotate-12' />
          )}
          <span className='font-medium text-xs group-data-[collapsible=icon]:hidden'>
            {isDark ? 'Modo Claro' : 'Modo Oscuro'}
          </span>
          <Badge
            variant='outline'
            className='ms-auto text-[10px] px-1.5 py-0 h-4 border-sidebar-border font-normal text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden'
          >
            {isDark ? 'Oscuro' : 'Claro'}
          </Badge>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
