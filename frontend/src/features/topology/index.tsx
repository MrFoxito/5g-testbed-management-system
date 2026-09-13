import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Radio, ShieldAlert, Terminal } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useScenarioStore } from '@/stores/scenario-store'
import {
  api,
  canOperate,
  type RuntimeSnapshot,
  type ScenarioStatus,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmsPage } from '@/features/ems-page'
import {
  EmsTopology,
  type TopologySelection,
  type TopologyView,
} from './ems-topology'

export function TopologyPage() {
  const scenario = useScenarioStore((state) => state.scenario)
  const [view, setView] = useState<TopologyView>('telco')
  const [selection, setSelection] = useState<TopologySelection | null>(null)
  const [pendingAction, setPendingAction] = useState<'start' | 'stop' | null>(
    null
  )
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)

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
    refetchInterval: 5000,
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
            first_seen: number
          }[]
        }>(`/alarm-center/${scenario}`)
      ).data,
    refetchInterval: 4000,
  })
  const component =
    selection?.type === 'component'
      ? status.data?.components.find((item) => item.id === selection.id)
      : undefined
  const logs = useQuery({
    queryKey: ['logs', scenario, component?.id],
    queryFn: async () =>
      (await api.get<{ lines: string[] }>(`/logs/${scenario}/${component?.id}`))
        .data,
    enabled: Boolean(component),
  })
  const operation = useMutation({
    mutationFn: async (action: 'start' | 'stop') =>
      (
        await api.post<ScenarioStatus>(
          `/scenarios/${scenario}/components/${component?.id}/${action}`
        )
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['status', scenario] })
      void queryClient.invalidateQueries({ queryKey: ['alarms', scenario] })
      void queryClient.invalidateQueries({ queryKey: ['logs', scenario] })
      setPendingAction(null)
    },
  })

  return (
    <EmsPage
      title='Topología'
      description='Vista física del testbed y vista semántica de funciones e interfaces 3GPP.'
    >
      <Card className='h-[calc(100dvh-7rem)]'>
        <CardHeader className='flex-row items-center justify-between'>
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as TopologyView)}
          >
            <TabsList>
              <TabsTrigger value='physical'>Física</TabsTrigger>
              <TabsTrigger value='telco'>Telco</TabsTrigger>
            </TabsList>
          </Tabs>
          <CardTitle className='sr-only'>
            {status.data?.state ?? 'Conectando'} ·{' '}
            {status.data?.components.length ?? 0} componentes
          </CardTitle>
          <Badge
            variant={
              runtime.data?.source === 'remote' ? 'default' : 'secondary'
            }
          >
            {runtime.data?.hostname ?? 'sin conexión'} ·{' '}
            {runtime.data?.source ?? 'unknown'}
          </Badge>
        </CardHeader>
        <CardContent className='h-[calc(100%-5rem)]'>
          <EmsTopology
            components={status.data?.components ?? []}
            runtime={runtime.data}
            alarms={alarmCenter.data?.items ?? []}
            view={view}
            onSelect={setSelection}
          />
        </CardContent>
      </Card>

      <Sheet
        open={Boolean(selection)}
        onOpenChange={(open) => !open && setSelection(null)}
      >
        <SheetContent className='sm:max-w-xl'>
          {selection?.type === 'host' ? (
            <HostDetail
              runtime={runtime.data}
              components={status.data?.components ?? []}
              selectedHostId={selection.id}
            />
          ) : component ? (
            <>
              {(() => {
                const isUpf = component.id === 'upf' || component.id === 'upf2'
                const upfInstances = isUpf
                  ? (status.data?.components ?? []).filter(
                      (c) => c.id === 'upf' || c.id === 'upf2' || c.kind === 'user-plane'
                    )
                  : []
                const isMultiUpf = upfInstances.length > 1

                const componentAlarms = (alarmCenter.data?.items ?? []).filter(
                  (a) => {
                    if (isMultiUpf) {
                      return upfInstances.some(
                        (u) =>
                          a.component === u.id ||
                          a.component?.toLowerCase() === u.id.toLowerCase() ||
                          (a.node_id &&
                            (a.node_id === u.node_id ||
                              a.node_id === 'upf-vm' ||
                              a.node_id === 'upf-vm2'))
                      )
                    }
                    return (
                      a.component === component.id ||
                      a.component?.toLowerCase() === component.id.toLowerCase() ||
                      (a.node_id && a.node_id === component.node_id)
                    )
                  }
                )

                const allUpfRunning = isMultiUpf && upfInstances.every((c) => c.status === 'running')

                return (
                  <>
                    <SheetHeader>
                      <div className='flex items-center gap-2'>
                        <SheetTitle>
                          {isMultiUpf ? 'UPF (Plano de Usuario)' : component.label}
                        </SheetTitle>
                        <Badge
                          variant={
                            (isMultiUpf ? allUpfRunning : component.status === 'running')
                              ? 'default'
                              : 'destructive'
                          }
                        >
                          {isMultiUpf
                            ? `${upfInstances.filter((c) => c.status === 'running').length}/${upfInstances.length} activas`
                            : component.status}
                        </Badge>
                      </div>
                      <SheetDescription>
                        {isMultiUpf
                          ? 'Arquitectura CUPS · 2 Instancias Dedicadas (Internet + Corporativo)'
                          : `${component.unit} · nodo ${component.node_id}`}
                      </SheetDescription>
                    </SheetHeader>

                    {/* Tarjetas de Instancias Multi-UPF */}
                    {isMultiUpf && (
                      <div className='mx-4 mt-3 space-y-2.5'>
                        <h4 className='text-[10px] font-semibold tracking-wider text-muted-foreground uppercase'>
                          Instancias Desplegadas ({upfInstances.length})
                        </h4>
                        {upfInstances.map((inst) => {
                          const isCorp =
                            inst.id === 'upf2' ||
                            inst.label.toLowerCase().includes('corporate')
                          const hostInfo = runtime.data?.hosts?.find((h) =>
                            isCorp ? h.id === 'upf-vm2' : h.id === 'upf-vm'
                          )
                          const ip =
                            hostInfo?.ip ||
                            (isCorp ? '10.210.50.9' : '10.210.50.8')
                          const sliceName = isCorp
                            ? 'Slice Corporativo (MEC)'
                            : 'Slice Internet (eMBB)'
                          const dnn = isCorp ? 'corporate' : 'internet'
                          const subnet = isCorp ? '10.46.0.0/16' : '10.45.0.0/16'

                          return (
                            <div
                              key={inst.id}
                              className='rounded-lg border p-3 bg-card/70 space-y-1.5 shadow-sm'
                            >
                              <div className='flex items-center justify-between'>
                                <div className='flex items-center gap-2'>
                                  <span className='font-bold font-mono text-xs text-foreground'>
                                    {inst.label}
                                  </span>
                                  <Badge
                                    variant='outline'
                                    className='text-[9px] font-mono'
                                  >
                                    {sliceName}
                                  </Badge>
                                </div>
                                <Badge
                                  variant={
                                    inst.status === 'running'
                                      ? 'default'
                                      : 'destructive'
                                  }
                                  className='text-[9px]'
                                >
                                  {inst.status}
                                </Badge>
                              </div>
                              <div className='grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] font-mono pt-1 text-muted-foreground'>
                                <div>
                                  <span className='text-foreground font-semibold'>
                                    IP N4/N3:
                                  </span>{' '}
                                  {ip}
                                </div>
                                <div>
                                  <span className='text-foreground font-semibold'>
                                    DNN:
                                  </span>{' '}
                                  {dnn}
                                </div>
                                <div>
                                  <span className='text-foreground font-semibold'>
                                    Subred:
                                  </span>{' '}
                                  {subnet}
                                </div>
                                <div>
                                  <span className='text-foreground font-semibold'>
                                    Host VM:
                                  </span>{' '}
                                  {inst.node_id}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {componentAlarms.length > 0 && (
                      <div className='mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs'>
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-1.5 font-semibold text-destructive'>
                            <AlertTriangle className='size-3.5' />
                            <span>
                              Incidentes Telco Activos ({componentAlarms.length})
                            </span>
                          </div>
                          <Link
                            to={'/alarms' as any}
                            search={{ component: component.id } as any}
                          >
                            <Button
                              variant='ghost'
                              size='sm'
                              className='h-6 px-1.5 text-[11px] text-destructive'
                            >
                              Ver en Alarmas
                            </Button>
                          </Link>
                        </div>
                        <div className='mt-2 space-y-1.5'>
                          {componentAlarms.map((alm) => (
                            <div
                              key={alm.id}
                              className='flex items-start justify-between gap-2 rounded border bg-background/90 p-2 text-xs'
                            >
                              <div>
                                <p className='font-medium'>{alm.message}</p>
                                {alm.evidence && (
                                  <p className='font-mono text-[10px] text-muted-foreground'>
                                    {alm.evidence}
                                  </p>
                                )}
                              </div>
                              <Badge
                                variant={
                                  alm.severity === 'critical'
                                    ? 'destructive'
                                    : 'secondary'
                                }
                                className={`font-mono text-[9px] uppercase ${alm.severity === 'major' ? 'bg-amber-500 text-white' : ''}`}
                              >
                                {alm.severity}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className='mx-4 mt-3 rounded-lg border bg-muted/20 p-3'>
                      <h4 className='mb-2 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase'>
                        Acciones del Operador (FCAPS)
                      </h4>
                      <div className='flex flex-wrap gap-2'>
                        <Link
                          to={'/commands' as any}
                          search={{ component: component.id } as any}
                        >
                          <Button
                            variant='outline'
                            size='sm'
                            className='h-7 gap-1.5 text-xs'
                          >
                            <Terminal className='size-3 text-primary' />
                            Consola MML ({component.id.toUpperCase()})
                          </Button>
                        </Link>
                        <Link to='/traces'>
                          <Button
                            variant='outline'
                            size='sm'
                            className='h-7 gap-1.5 text-xs'
                          >
                            <Radio className='size-3 text-sky-500' />
                            Capturar Traza PCAP
                          </Button>
                        </Link>
                        <Link
                          to={'/alarms' as any}
                          search={{ component: component.id } as any}
                        >
                          <Button
                            variant='outline'
                            size='sm'
                            className='h-7 gap-1.5 text-xs'
                          >
                            <ShieldAlert className='size-3 text-amber-500' />
                            Centro de Alarmas
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </>
                )
              })()}

              <ScrollArea className='min-h-0 flex-1 px-4'>
                <Detail title='Interfaces' values={component.interfaces} />
                <Detail
                  title='Procedimientos relacionados'
                  values={component.procedures}
                />
                <Detail
                  title='Dependencias'
                  values={component.depends_on}
                  empty='Sin dependencias declaradas'
                />
                <Detail
                  title='Configuraciones'
                  values={component.config_paths}
                />
                <h3 className='mt-5 mb-2 text-sm font-semibold'>
                  Endpoints esperados
                </h3>
                <div className='space-y-2'>
                  {component.expected_endpoints.map((endpoint) => {
                    const observed = runtime.data?.listening_ports.some(
                      (port) =>
                        port.protocol === endpoint.protocol &&
                        port.address === endpoint.address &&
                        port.port === endpoint.port
                    )
                    return (
                      <div
                        key={`${endpoint.protocol}-${endpoint.address}-${endpoint.port}`}
                        className='flex items-center justify-between rounded-md border p-2 text-xs'
                      >
                        <span>
                          {endpoint.interface} · {endpoint.protocol}://
                          {endpoint.address}:{endpoint.port}
                        </span>
                        <Badge variant={observed ? 'default' : 'destructive'}>
                          {observed ? 'escuchando' : 'no detectado'}
                        </Badge>
                      </div>
                    )
                  })}
                  {!component.expected_endpoints.length && (
                    <p className='text-sm text-muted-foreground'>
                      Sin endpoint fijo declarado.
                    </p>
                  )}
                </div>
                <h3 className='mt-5 mb-2 text-sm font-semibold'>
                  Últimos logs
                </h3>
                <pre className='max-h-64 overflow-auto rounded-md bg-muted p-3 text-[11px] whitespace-pre-wrap'>
                  {logs.isLoading
                    ? 'Consultando…'
                    : logs.data?.lines.slice(-30).join('\n') ||
                      'Sin líneas disponibles'}
                </pre>
              </ScrollArea>
              {canOperate(user?.role) && (
                <SheetFooter>
                  {component.status === 'running' ? (
                    <Button
                      variant='destructive'
                      onClick={() => setPendingAction('stop')}
                    >
                      Detener {component.label}
                    </Button>
                  ) : (
                    <Button onClick={() => setPendingAction('start')}>
                      Iniciar {component.label}
                    </Button>
                  )}
                </SheetFooter>
              )}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={`${pendingAction === 'stop' ? 'Detener' : 'Iniciar'} ${component?.label ?? 'componente'}`}
        desc='La operación se ejecutará realmente en la VM y quedará registrada en auditoría.'
        confirmText='Confirmar operación'
        destructive={pendingAction === 'stop'}
        isLoading={operation.isPending}
        handleConfirm={() => pendingAction && operation.mutate(pendingAction)}
      />
    </EmsPage>
  )
}

function Detail({
  title,
  values,
  empty = 'Sin datos',
}: {
  title: string
  values: string[]
  empty?: string
}) {
  return (
    <section className='mt-5'>
      <h3 className='mb-2 text-sm font-semibold'>{title}</h3>
      <div className='flex flex-wrap gap-2'>
        {values.length ? (
          values.map((value) => (
            <Badge key={value} variant='secondary'>
              {value}
            </Badge>
          ))
        ) : (
          <span className='text-sm text-muted-foreground'>{empty}</span>
        )}
      </div>
    </section>
  )
}

function HostDetail({
  runtime,
  components,
  selectedHostId,
}: {
  runtime?: RuntimeSnapshot
  components: ScenarioStatus['components']
  selectedHostId?: string
}) {
  const host = runtime?.hosts?.find((h) => h.id === selectedHostId)
  const title = host?.hostname ?? runtime?.hostname ?? 'Host del testbed'
  const role = host?.role ?? `Vista física obtenida por ${runtime?.source ?? 'fuente desconocida'}`
  const ifaces = host?.interfaces ?? runtime?.interfaces ?? []
  const ports = host?.listening_ports ?? runtime?.listening_ports ?? []
  const hostComps = host
    ? components.filter((c) => {
        if (host.id === 'upf-vm') return c.node_id === 'upf-vm' || c.id === 'upf'
        if (host.id === 'upf-vm2') return c.node_id === 'upf-vm2' || c.id === 'upf2'
        if (host.id === 'gnb-vm') return c.node_id === 'gnb-vm' || c.id === 'gnb'
        if (host.id === 'ue-vm') return c.node_id === 'ue-vm' || c.id === 'ue'
        return (
          c.node_id === 'core' ||
          (!['upf-vm', 'upf-vm2', 'gnb-vm', 'ue-vm'].includes(c.node_id) &&
            !['upf', 'upf2', 'gnb', 'ue'].includes(c.id))
        )
      })
    : components

  return (
    <>
      <SheetHeader>
        <div className='flex items-center justify-between gap-2'>
          <SheetTitle className='font-mono font-bold'>{title}</SheetTitle>
          {host?.ip && (
            <Badge variant='outline' className='font-mono text-xs font-semibold'>
              {host.ip}
            </Badge>
          )}
        </div>
        <SheetDescription>{role}</SheetDescription>
      </SheetHeader>
      <ScrollArea className='min-h-0 flex-1 px-4'>
        <h3 className='mb-2 text-sm font-semibold'>Interfaces de Red</h3>
        <div className='space-y-2'>
          {ifaces.map((item) => (
            <div key={item.name} className='rounded-md border p-3 bg-card/60'>
              <div className='flex justify-between items-center'>
                <b className='font-mono text-sm'>{item.name}</b>
                <Badge variant={item.state === 'up' ? 'default' : 'secondary'}>
                  {item.state}
                </Badge>
              </div>
              <p className='mt-1 text-xs text-muted-foreground font-mono'>
                {item.addresses
                  .map(
                    (address) => `${address.address}/${address.prefix_length}`
                  )
                  .join(', ') || 'Sin direcciones'}
              </p>
            </div>
          ))}
        </div>
        <h3 className='mt-5 mb-2 text-sm font-semibold'>
          Funciones alojadas en este host ({hostComps.length})
        </h3>
        <div className='flex flex-wrap gap-2'>
          {hostComps.map((item) => (
            <Badge
              key={item.id}
              variant={item.status === 'running' ? 'default' : 'destructive'}
            >
              {item.label}
            </Badge>
          ))}
        </div>
        <h3 className='mt-5 mb-2 text-sm font-semibold'>Sockets en escucha</h3>
        <p className='text-sm text-muted-foreground'>
          {ports.length} endpoints de red detectados.
        </p>
      </ScrollArea>
    </>
  )
}
