import { GraduationCap, LogOut, ShieldCheck, User } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import useDialogState from '@/hooks/use-dialog-state'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((state) => state.auth.user)
  const isTeacher =
    user?.role === 'teacher' || user?.username.toLowerCase().includes('docente')
  const isAdmin = user?.role === 'admin'

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='relative flex size-8 items-center justify-center rounded-full border border-white/20 bg-white/10 p-0 text-white shadow-xs transition-all hover:bg-white/20 hover:border-white/35 dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-accent'
            aria-label='Menú de usuario'
            title={`Conectado como ${user?.username ?? 'usuario'} (${user?.role ?? 'rol'})`}
          >
            {isTeacher ? (
              <GraduationCap className='size-4 text-sky-200 transition-transform hover:scale-110 dark:text-primary' />
            ) : isAdmin ? (
              <ShieldCheck className='size-4 text-amber-300 transition-transform hover:scale-110 dark:text-primary' />
            ) : (
              <User className='size-4 text-sky-200 transition-transform hover:scale-110 dark:text-foreground' />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-56' align='end' forceMount>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex items-center gap-2.5 py-1'>
              <div className='flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary'>
                {isTeacher ? (
                  <GraduationCap className='size-4.5' />
                ) : isAdmin ? (
                  <ShieldCheck className='size-4.5' />
                ) : (
                  <User className='size-4.5' />
                )}
              </div>
              <div className='flex min-w-0 flex-col'>
                <p className='truncate text-sm leading-tight font-semibold'>
                  {user?.username ?? 'Usuario EMS'}
                </p>
                <p className='truncate text-xs leading-tight text-muted-foreground capitalize'>
                  {user?.role ?? 'sin rol'} · {user?.testbed ?? 'compartido'}
                </p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            <LogOut className='size-4 me-2' />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
