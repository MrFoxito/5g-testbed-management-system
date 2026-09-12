import type { ReactNode } from 'react'
import { Main } from '@/components/layout/main'
import { SidebarTrigger } from '@/components/ui/sidebar'

export function EmsPage({
  title,
  actions,
  headerLeft,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  headerLeft?: ReactNode
  children: ReactNode
}) {
  return (
    <Main className='overflow-y-auto pb-10'>
      <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2.5'>
          <SidebarTrigger variant='outline' className='size-8 md:hidden' />
          <h1 className='text-xl font-semibold tracking-tight'>{title}</h1>
          {headerLeft}
        </div>
        {actions && (
          <div className='flex flex-wrap items-center gap-2'>{actions}</div>
        )}
      </div>
      {children}
    </Main>
  )
}
