import { useQuery } from '@tanstack/react-query'
import { Activity, Cpu, Database, MemoryStick } from 'lucide-react'
import { api, type Alarm, type Metrics, type ScenarioStatus } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { EmsTopology } from '@/features/topology/ems-topology'

export function Dashboard() {
  const scenarioId = '5g-sa'
  const status = useQuery({
    queryKey: ['status', scenarioId],
    queryFn: async () =>
      (await api.get<ScenarioStatus>(`/scenarios/${scenarioId}/status`)).data,
    refetchInterval: 3000,
  })
  const metrics = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => (await api.get<Metrics>('/metrics')).data,
    refetchInterval: 3000,
  })
  const alarms = useQuery({
    queryKey: ['alarms', scenarioId],
    queryFn: async () => (await api.get<Alarm[]>(`/alarms/${scenarioId}`)).data,
    refetchInterval: 3000,
  })
  const active =
    status.data?.components.filter((item) => item.status === 'running')
      .length ?? 0
  const total = status.data?.components.length ?? 0

  return (
    <>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center gap-3'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main fixed>
        <div className='mb-6 flex items-end justify-between'>
          <div>
            <p className='text-xs font-semibold tracking-[.18em] text-primary'>
              EMS EDUCATIVO · 5G SA
            </p>
            <h1 className='text-3xl font-bold tracking-tight'>
              Centro de operación del testbed
            </h1>
            <p className='text-muted-foreground'>
              El core ya desplegado se observa desde un único plano de gestión.
            </p>
          </div>
          <Badge
            variant={
              status.data?.state === 'running' ? 'default' : 'destructive'
            }
          >
            {status.data?.state ?? 'conectando'}
          </Badge>
        </div>
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <Metric
            title='Componentes activos'
            value={`${active}/${total}`}
            icon={Activity}
          />
          <Metric
            title='CPU del host'
            value={`${metrics.data?.cpu_percent ?? 0}%`}
            icon={Cpu}
          />
          <Metric
            title='Memoria'
            value={`${metrics.data?.memory_percent ?? 0}%`}
            icon={MemoryStick}
          />
          <Metric
            title='Alarmas activas'
            value={`${alarms.data?.length ?? 0}`}
            icon={Database}
          />
        </div>
        <div className='mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[2fr_1fr]'>
          <Card className='min-h-[470px]'>
            <CardHeader>
              <CardTitle>Topología en vivo</CardTitle>
            </CardHeader>
            <CardContent className='h-[390px]'>
              <EmsTopology scenarioId={scenarioId} components={status.data?.components ?? []} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Alarmas</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              {alarms.data?.length ? (
                alarms.data.map((alarm) => (
                  <div key={alarm.id} className='rounded-lg border p-3'>
                    <div className='flex items-center justify-between'>
                      <b className='text-sm'>{alarm.component}</b>
                      <Badge variant='destructive'>{alarm.severity}</Badge>
                    </div>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {alarm.message}
                    </p>
                  </div>
                ))
              ) : (
                <div className='grid h-48 place-items-center text-sm text-muted-foreground'>
                  Sin alarmas activas
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}

function Metric({
  title,
  value,
  icon: Icon,
}: {
  title: string
  value: string
  icon: React.ElementType
}) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between pb-2'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        <Icon className='size-4 text-muted-foreground' />
      </CardHeader>
      <CardContent>
        <div className='text-2xl font-bold'>{value}</div>
        <p className='text-xs text-muted-foreground'>
          actualización cada 3 segundos
        </p>
      </CardContent>
    </Card>
  )
}
