import { useQuery } from '@tanstack/react-query'
import { Outlet } from '@tanstack/react-router'
import { useScenarioStore } from '@/stores/scenario-store'
import { api } from '@/lib/api'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { TopNavigation } from '@/components/layout/top-navigation'
import { SkipToMain } from '@/components/skip-to-main'
import { VmConnectivity } from '@/features/vm-connectivity'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const scenario = useScenarioStore((state) => state.scenario)
  const deployment = useQuery({
    queryKey: ['deployment'],
    queryFn: async () =>
      (await api.get<{ stage: string; scenarios: string[] }>('/deployment'))
        .data,
    retry: false,
    refetchInterval: 30000,
  })
  const connectivityOnly = deployment.data?.stage === 'connectivity'
  return (
    <SearchProvider>
      <LayoutProvider>
        <div className='min-h-svh w-full min-w-0 bg-slate-50/60 dark:bg-background'>
          <SkipToMain />
          <TopNavigation connectivityOnly={connectivityOnly} />
          <div key={scenario} className='@container/content min-w-0'>
            {deployment.isError ? (
              <main id='content' className='p-6' role='alert'>
                No se pudo consultar el despliegue.{' '}
                <button
                  className='underline'
                  onClick={() => void deployment.refetch()}
                >
                  Reintentar
                </button>
              </main>
            ) : !deployment.data ? (
              <main id='content' className='p-6'>
                Consultando laboratorio…
              </main>
            ) : connectivityOnly ? (
              deployment.data.scenarios.includes(scenario) ? (
                <VmConnectivity scenario={scenario} />
              ) : (
                <main id='content' className='p-6'>
                  <h1 className='text-xl font-semibold'>
                    Sin laboratorio desplegado
                  </h1>
                  <p className='mt-2 text-muted-foreground'>
                    5G funciona en un entorno independiente. Selecciona 4G EPC
                    para consultar las VMs de este laboratorio.
                  </p>
                </main>
              )
            ) : (
              (children ?? <Outlet />)
            )}
          </div>
        </div>
      </LayoutProvider>
    </SearchProvider>
  )
}
