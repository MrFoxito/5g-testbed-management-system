import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  Network,
  Radio,
  RotateCcw,
  Server,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  api,
  type Experiment,
  type Metrics,
  type RuntimeSnapshot,
  type ScenarioStatus,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { EmsTopology } from '@/features/topology/ems-topology'

export function Dashboard() {
  const [scenario, setScenario] = useState<'5g-sa' | '4g-epc'>('5g-sa')

  const status = useQuery({
    queryKey: ['status', scenario],
    queryFn: async () =>
      (await api.get<ScenarioStatus>(`/scenarios/${scenario}/status`)).data,
    refetchInterval: 3000,
  })

  const runtime = useQuery({
    queryKey: ['runtime', scenario],
    queryFn: async () =>
      (await api.get<RuntimeSnapshot>(`/runtime/${scenario}`)).data,
    refetchInterval: 3000,
  })

  const alarmCenter = useQuery({
    queryKey: ['alarm-center', scenario],
    queryFn: async () =>
      (
        await api.get<{
          items: {
            id: string
            component: string
            node_id?: string
            network_function: string
            severity: string
            message: string
            evidence?: string
            procedures?: string[]
            first_seen: number
            masked?: boolean
            silenced_until?: number
          }[]
          counts: Record<string, number>
          total: number
        }>(`/alarm-center/${scenario}`, {
          params: { visibility: 'visible' },
        })
      ).data,
    refetchInterval: 3000,
  })

  const metrics = useQuery({
    queryKey: ['metrics', scenario],
    queryFn: async () =>
      (await api.get<Metrics>(`/metrics?scenario_id=${scenario}`)).data,
    refetchInterval: 2500,
  })

  const experiments = useQuery({
    queryKey: ['experiments', scenario],
    queryFn: async () =>
      (await api.get<Experiment[]>(`/experiments/catalog/${scenario}`)).data,
    refetchInterval: 3000,
  })

  const [injectingId, setInjectingId] = useState<string | null>(null)

  const handleExperimentToggle = async (exp: Experiment) => {
    setInjectingId(exp.id)
    const isInjected = exp.state?.status === 'injected'
    const action = isInjected ? 'recover' : 'inject'
    try {
      const resp = await api.post(`/experiments/${exp.id}/${action}?scenario_id=${scenario}`)
      if (action === 'inject') {
        toast.error(`Falla inyectada: ${exp.title}`, {
          description: resp.data.state?.message || 'Condición de falla activada.',
        })
      } else {
        toast.success(`Servicio restablecido: ${exp.title}`, {
          description: resp.data.state?.message || 'Estado nominal recuperado.',
        })
      }
      await Promise.all([
        experiments.refetch(),
        status.refetch(),
        alarmCenter.refetch(),
        runtime.refetch(),
        metrics.refetch(),
      ])
    } catch {
      toast.error(`Error al ejecutar acción sobre ${exp.id}`)
    } finally {
      setInjectingId(null)
    }
  }

  const active =
    status.data?.components.filter((item) => item.status === 'running')
      .length ?? 0
  const total = status.data?.components.length ?? 0

  const ogstunTraffic = metrics.data?.interfaces?.ogstun
  const totalUserPlaneKbps = (ogstunTraffic?.rx_kbps ?? 0) + (ogstunTraffic?.tx_kbps ?? 0)

  return (
    <>
      <Header fixed>
        <Search />
        <div className='ms-auto flex items-center gap-3'>
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main className='overflow-y-auto pb-10'>
        <div className='mb-6 flex flex-wrap items-end justify-between gap-4'>
          <div>
            <p className='text-xs font-semibold tracking-[.18em] text-primary uppercase'>
              EMS EDUCATIVO · {scenario === '5g-sa' ? '5G STANDALONE' : '4G EPC'}
            </p>
            <h1 className='text-3xl font-bold tracking-tight'>
              Centro de operación y telemetría
            </h1>
            <p className='text-muted-foreground'>
              Supervisión en tiempo real de funciones de red, sesiones de usuario y recursos del testbed.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Select
              value={scenario}
              onValueChange={(val) => setScenario(val as '5g-sa' | '4g-epc')}
            >
              <SelectTrigger className='h-8 w-44 text-xs font-medium'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='5g-sa'>5G Standalone</SelectItem>
                <SelectItem value='4g-epc'>4G EPC</SelectItem>
              </SelectContent>
            </Select>
            <Badge
              variant={status.data?.state === 'running' ? 'default' : 'destructive'}
              className='px-3 py-1 text-xs font-medium tracking-wide uppercase'
            >
              ● {status.data?.state ?? 'conectando'}
            </Badge>
          </div>
        </div>

        {/* METRICS ROW */}
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <Metric
            title='Funciones de red activas'
            value={`${metrics.data?.telco?.active_nfs ?? active}/${metrics.data?.telco?.total_nfs ?? total}`}
            subtitle='Estado del Core y RAN'
            icon={Activity}
          />
          <Metric
            title='Sesiones PDU / UE'
            value={`${metrics.data?.telco?.pdu_sessions ?? 0} activa(s)`}
            subtitle={`UE registrado: ${metrics.data?.telco?.ue_registered ? 'Sí' : 'No'}`}
            icon={Radio}
          />
          <Metric
            title='Tráfico Plano Usuario (N6)'
            value={`${totalUserPlaneKbps.toFixed(1)} Kbps`}
            subtitle={`Rx: ${ogstunTraffic?.rx_kbps ?? 0} | Tx: ${ogstunTraffic?.tx_kbps ?? 0} Kbps`}
            icon={Network}
          />
          <Metric
            title='Recursos VM (Ubuntu)'
            value={`CPU ${metrics.data?.cpu_percent ?? 0}%`}
            subtitle={`Memoria: ${metrics.data?.memory_percent ?? 0}%`}
            icon={Server}
          />
        </div>

        {/* TOPOLOGY & LIVE TELEMETRY / ALARMS */}
        <div className='mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[2fr_1fr]'>
          <Card className='flex flex-col min-h-[470px]'>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <CardTitle>Topología en vivo</CardTitle>
                <div className='flex items-center gap-2'>
                  <Badge variant='outline' className='text-xs font-mono text-muted-foreground'>
                    Host: {runtime.data?.hostname ?? 'ems-testbed'}
                  </Badge>
                  <Badge variant='outline' className='text-xs font-mono text-muted-foreground'>
                    Origen: {metrics.data?.source ?? 'ssh'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className='flex-1 h-[340px]'>
              <EmsTopology
                components={status.data?.components ?? []}
                alarms={alarmCenter.data?.items ?? []}
              />
            </CardContent>
          </Card>

          <div className='space-y-4'>
            {/* Live Throughput Sparkline */}
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium'>Telemetría de Tráfico en Vivo</CardTitle>
                <CardDescription>Rendimiento por interfaz telco en tiempo real</CardDescription>
              </CardHeader>
              <CardContent>
                <ThroughputChart history={metrics.data?.history} />
              </CardContent>
            </Card>

            {/* Alarms Panel */}
            <Card className='max-h-[260px] overflow-auto'>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <div className='flex items-center gap-2'>
                    <CardTitle className='text-sm font-medium'>Alarmas Telco Activas</CardTitle>
                    <Link to='/alarms' className='text-[11px] text-primary hover:underline'>
                      Ver todas →
                    </Link>
                  </div>
                  <div className='flex items-center gap-1 font-mono text-[10px]'>
                    {alarmCenter.data?.counts?.critical ? (
                      <span className='rounded bg-red-600 px-1.5 py-0.5 font-bold text-white shadow-xs'>
                        {alarmCenter.data.counts.critical} CRIT
                      </span>
                    ) : null}
                    {alarmCenter.data?.counts?.major ? (
                      <span className='rounded bg-amber-500 px-1.5 py-0.5 font-bold text-white shadow-xs'>
                        {alarmCenter.data.counts.major} MAJ
                      </span>
                    ) : null}
                    <Badge variant={alarmCenter.data?.total ? 'destructive' : 'secondary'}>
                      {alarmCenter.data?.total ?? 0}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='space-y-2'>
                {alarmCenter.data?.items?.length ? (
                  alarmCenter.data.items.map((alarm) => (
                    <div key={alarm.id} className='rounded-lg border p-2.5 text-xs'>
                      <div className='flex items-center justify-between'>
                        <b className='font-semibold'>{alarm.network_function || alarm.component}</b>
                        <Badge
                          variant={alarm.severity === 'critical' ? 'destructive' : 'secondary'}
                          className={`text-[9px] uppercase font-mono ${alarm.severity === 'major' ? 'bg-amber-500 text-white' : ''}`}
                        >
                          {alarm.severity}
                        </Badge>
                      </div>
                      <p className='mt-1 text-muted-foreground'>{alarm.message}</p>
                      {alarm.evidence && (
                        <p className='mt-0.5 font-mono text-[10px] text-muted-foreground/80'>
                          {alarm.evidence}
                        </p>
                      )}
                      {alarm.procedures && alarm.procedures.length > 0 && (
                        <p className='mt-0.5 text-[10px] text-primary/80'>
                          Procedimiento: {alarm.procedures.join(', ')}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className='grid h-24 place-items-center text-xs text-muted-foreground'>
                    Sin incidentes activos · Testbed saludable
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* FAULT INJECTION ENGINE SECTION */}
        <Card className='mt-6'>
          <CardHeader className='pb-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <AlertTriangle className='h-5 w-5 text-amber-500' />
                  Laboratorio de Inyección de Fallas Reversibles (Evaluación de Resiliencia)
                </CardTitle>
                <CardDescription>
                  Permite simular eventos críticos de red de forma controlada y medir el tiempo de detección y recuperación del EMS.
                </CardDescription>
              </div>
              <Badge variant='outline' className='text-xs font-mono'>
                Casos E1-E4 / Fallas 5G
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {experiments.data?.map((exp) => {
                const isInjected = exp.state?.status === 'injected'
                const isWorking = injectingId === exp.id
                return (
                  <div
                    key={exp.id}
                    className={`rounded-xl border p-4 transition-colors flex flex-col justify-between ${
                      isInjected
                        ? 'border-destructive/60 bg-destructive/5'
                        : 'border-border bg-card'
                    }`}
                  >
                    <div>
                      <div className='flex items-center justify-between gap-2 mb-2'>
                        <Badge
                          variant={isInjected ? 'destructive' : 'secondary'}
                          className='text-[10px] font-mono'
                        >
                          {exp.id.toUpperCase()}
                        </Badge>
                        <Badge
                          variant={isInjected ? 'destructive' : 'outline'}
                          className='text-[10px]'
                        >
                          {isInjected ? '🔴 Falla Activa' : '🟢 Nominal'}
                        </Badge>
                      </div>
                      <h4 className='text-sm font-semibold'>{exp.title}</h4>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {exp.description}
                      </p>
                      <div className='mt-3 flex flex-wrap gap-1'>
                        {exp.interfaces.map((intf) => (
                          <span
                            key={intf}
                            className='inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground'
                          >
                            {intf}
                          </span>
                        ))}
                        <span className='inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary'>
                          Obj: {exp.expected_detection}
                        </span>
                      </div>
                    </div>

                    <div className='mt-4 pt-3 border-t flex items-center justify-between gap-2'>
                      <span className='text-[11px] text-muted-foreground'>
                        {isInjected
                          ? `Inyectado hace: ${exp.state?.elapsed_seconds ?? 0}s`
                          : 'Listo para probar'}
                      </span>
                      <Button
                        size='sm'
                        variant={isInjected ? 'default' : 'outline'}
                        className={`text-xs gap-1.5 ${
                          isInjected
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'border-destructive/40 text-destructive hover:bg-destructive/10'
                        }`}
                        disabled={isWorking}
                        onClick={() => handleExperimentToggle(exp)}
                      >
                        {isInjected ? (
                          <>
                            <RotateCcw className='h-3.5 w-3.5' />
                            {isWorking ? 'Recuperando...' : 'Restaurar Salud'}
                          </>
                        ) : (
                          <>
                            <Zap className='h-3.5 w-3.5' />
                            {isWorking ? 'Inyectando...' : 'Inyectar Falla'}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}

function Metric({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string
  value: string
  subtitle?: string
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
          {subtitle || 'actualización en vivo'}
        </p>
      </CardContent>
    </Card>
  )
}

function ThroughputChart({
  history,
}: {
  history?: { time: string; ogstun_kbps: number; lo_kbps: number }[]
}) {
  if (!history || history.length < 2) {
    return (
      <div className='flex h-24 items-center justify-center text-xs text-muted-foreground'>
        Recolectando telemetría...
      </div>
    )
  }

  const maxVal = Math.max(
    ...history.map((d) => Math.max(d.ogstun_kbps, d.lo_kbps)),
    10
  )
  const width = 360
  const height = 80
  const padding = 8

  const getPoints = (key: 'ogstun_kbps' | 'lo_kbps') =>
    history
      .map((d, i) => {
        const x = padding + (i / (history.length - 1)) * (width - 2 * padding)
        const y = height - padding - (d[key] / maxVal) * (height - 2 * padding)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  const ogstunPoints = getPoints('ogstun_kbps')
  const loPoints = getPoints('lo_kbps')

  return (
    <div className='space-y-1.5'>
      <div className='flex items-center justify-between text-[11px] text-muted-foreground'>
        <div className='flex items-center gap-3'>
          <span className='flex items-center gap-1'>
            <span className='size-2 rounded-full bg-emerald-500' /> ogstun (Usuario)
          </span>
          <span className='flex items-center gap-1'>
            <span className='size-2 rounded-full bg-sky-400' /> lo (Control/SBI)
          </span>
        </div>
        <span className='font-mono text-[10px]'>Máx: {maxVal.toFixed(1)} Kbps</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className='h-20 w-full overflow-visible'
      >
        <polyline
          fill='none'
          stroke='hsl(var(--muted-foreground) / 0.15)'
          strokeWidth='1'
          points={`0,${height - padding} ${width},${height - padding}`}
        />
        <polyline
          fill='none'
          stroke='rgb(56 189 248)'
          strokeWidth='1.5'
          strokeDasharray='3 3'
          points={loPoints}
        />
        <polyline
          fill='none'
          stroke='rgb(16 185 129)'
          strokeWidth='2'
          points={ogstunPoints}
        />
      </svg>
    </div>
  )
}
