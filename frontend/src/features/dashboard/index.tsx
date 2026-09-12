import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Activity, Network, Radio, Server } from 'lucide-react'
import { toast } from 'sonner'
import { useScenarioStore } from '@/stores/scenario-store'
import {
  api,
  type Experiment,
  type Metrics,
  type RuntimeSnapshot,
  type ScenarioStatus,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { EmsTopology } from '@/features/topology/ems-topology'

export function Dashboard() {
  const scenario = useScenarioStore((state) => state.scenario)

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
      const resp = await api.post(
        `/experiments/${exp.id}/${action}?scenario_id=${scenario}`
      )
      if (action === 'inject') {
        toast.error(`Falla inyectada: ${exp.title}`, {
          description:
            resp.data.state?.message || 'Condición de falla activada.',
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
  const totalUserPlaneKbps =
    (ogstunTraffic?.rx_kbps ?? 0) + (ogstunTraffic?.tx_kbps ?? 0)

  return (
    <Main className='overflow-y-auto pb-10'>
      <h1 className='sr-only'>Resumen</h1>
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
      <div className='mt-4 grid min-h-0 gap-4 lg:h-[480px] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <Card className='flex h-[480px] min-h-0 min-w-0 flex-col lg:h-full'>
          <CardHeader className='pb-2'>
            <div className='flex items-center justify-between'>
              <CardTitle>Topología en vivo</CardTitle>
              <div className='flex items-center gap-2'>
                <Badge
                  variant='outline'
                  className='font-mono text-xs text-muted-foreground'
                >
                  Host: {runtime.data?.hostname ?? 'ems-testbed'}
                </Badge>
                <Badge
                  variant='outline'
                  className='font-mono text-xs text-muted-foreground'
                >
                  Origen: {metrics.data?.source ?? 'ssh'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className='min-h-0 flex-1'>
            <EmsTopology
              components={status.data?.components ?? []}
              alarms={alarmCenter.data?.items ?? []}
            />
          </CardContent>
        </Card>

        <div className='grid min-h-0 min-w-0 gap-4 lg:h-full lg:grid-rows-2'>
          {/* Live Throughput Sparkline */}
          <Card className='min-h-0 overflow-auto'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium'>
                Telemetría de Tráfico en Vivo
              </CardTitle>
              <CardDescription>
                Rendimiento por interfaz telco en tiempo real
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ThroughputChart history={metrics.data?.history} />
            </CardContent>
          </Card>

          {/* Alarms Panel */}
          <Card className='flex min-h-0 flex-col overflow-hidden'>
            <CardHeader className='pb-2'>
              <div className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <CardTitle className='text-sm font-medium'>
                    Alarmas Telco Activas
                  </CardTitle>
                  <Link
                    to='/alarms'
                    className='text-[11px] text-primary hover:underline'
                  >
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
                  <Badge
                    variant={
                      alarmCenter.data?.total ? 'destructive' : 'secondary'
                    }
                  >
                    {alarmCenter.data?.total ?? 0}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className='min-h-0 flex-1 space-y-2 overflow-y-auto'>
              {alarmCenter.data?.items?.length ? (
                alarmCenter.data.items.map((alarm) => (
                  <div
                    key={alarm.id}
                    className='rounded-lg border p-2.5 text-xs'
                  >
                    <div className='flex items-center justify-between'>
                      <b className='font-semibold'>
                        {alarm.network_function || alarm.component}
                      </b>
                      <Badge
                        variant={
                          alarm.severity === 'critical'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className={`font-mono text-[9px] uppercase ${alarm.severity === 'major' ? 'bg-amber-500 text-white' : ''}`}
                      >
                        {alarm.severity}
                      </Badge>
                    </div>
                    <p className='mt-1 text-muted-foreground'>
                      {alarm.message}
                    </p>
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

      <Card className='mt-4 gap-0 overflow-hidden py-0 shadow-none'>
        <CardHeader className='border-b px-4 py-3'>
          <CardTitle className='text-sm font-semibold'>
            Laboratorio de fallas
          </CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-sm'>
              <thead className='border-b bg-muted/30 text-xs text-muted-foreground'>
                <tr>
                  <th className='px-4 py-2 font-medium'>Prueba</th>
                  <th className='px-4 py-2 font-medium'>Estado</th>
                  <th className='px-4 py-2 font-medium'>Tiempo activo</th>
                  <th className='px-4 py-2 text-right font-medium'>Acción</th>
                </tr>
              </thead>
              <tbody className='divide-y'>
                {experiments.data?.map((exp) => {
                  const isInjected = exp.state?.status === 'injected'
                  const isWorking = injectingId === exp.id
                  return (
                    <tr
                      key={exp.id}
                      className={isInjected ? 'bg-destructive/5' : ''}
                    >
                      <td className='px-4 py-3'>
                        <details className='max-w-3xl'>
                          <summary className='cursor-pointer font-medium'>
                            {exp.title}
                          </summary>
                          <div className='mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground'>
                            <p>{exp.description}</p>
                            <p>
                              Interfaces: {exp.interfaces.join(', ') || '—'}
                            </p>
                            <p>
                              Objetivo de detección: {exp.expected_detection}
                            </p>
                          </div>
                        </details>
                      </td>
                      <td className='px-4 py-3 whitespace-nowrap'>
                        <span
                          className={
                            isInjected
                              ? 'font-medium text-destructive'
                              : 'text-muted-foreground'
                          }
                        >
                          {isInjected ? 'Falla activa' : 'Nominal'}
                        </span>
                      </td>
                      <td className='px-4 py-3 font-mono text-xs whitespace-nowrap text-muted-foreground'>
                        {isInjected
                          ? `${exp.state?.elapsed_seconds ?? 0} s`
                          : '—'}
                      </td>
                      <td className='px-4 py-3 text-right'>
                        <Button
                          size='sm'
                          variant='outline'
                          className='min-w-28 text-xs'
                          disabled={injectingId !== null}
                          onClick={() => handleExperimentToggle(exp)}
                        >
                          {isWorking
                            ? isInjected
                              ? 'Restaurando…'
                              : 'Inyectando…'
                            : isInjected
                              ? 'Restaurar'
                              : 'Inyectar falla'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
                {(experiments.isLoading ||
                  experiments.isError ||
                  !experiments.data?.length) && (
                  <tr>
                    <td
                      colSpan={4}
                      className='px-4 py-6 text-center text-sm text-muted-foreground'
                    >
                      {experiments.isLoading
                        ? 'Cargando pruebas…'
                        : experiments.isError
                          ? 'No se pudo cargar el catálogo de pruebas.'
                          : 'No hay pruebas disponibles para este escenario.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </Main>
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
            <span className='size-2 rounded-full bg-emerald-500' /> ogstun
            (Usuario)
          </span>
          <span className='flex items-center gap-1'>
            <span className='size-2 rounded-full bg-sky-400' /> lo (Control/SBI)
          </span>
        </div>
        <span className='font-mono text-[10px]'>
          Máx: {maxVal.toFixed(1)} Kbps
        </span>
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
