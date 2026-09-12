import type { ReactNode } from 'react'
import { Main } from '@/components/layout/main'

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
      <h1 className='sr-only'>{title}</h1>
      {(headerLeft || actions) && (
        <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
          {headerLeft}
          {actions}
        </div>
      )}
      {children}
    </Main>
  )
}
