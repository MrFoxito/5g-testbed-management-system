import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Radio,
  ShieldAlert,
  Terminal,
} from 'lucide-react'
import { api, canOperate, type RuntimeSnapshot, type ScenarioStatus } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmsPage } from '@/features/ems-page'
import {
  EmsTopology,
  type TopologySelection,
  type TopologyView,
} from './ems-topology'

export function TopologyPage() {
  const [scenario, setScenario] = useState('5g-sa')
  const [view, setView] = useState<TopologyView>('telco')
  const [selection, setSelection] = useState<TopologySelection | null>(null)
  const [pendingAction, setPendingAction] = useState<'start' | 'stop' | null>(null)
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
      (
        await api.get<{ lines: string[] }>(
          `/logs/${scenario}/${component?.id}`
        )
      ).data,
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
      actions={
        <div className='flex gap-2'>
          <Tabs value={view} onValueChange={(value) => setView(value as TopologyView)}>
            <TabsList>
              <TabsTrigger value='physical'>Física</TabsTrigger>
              <TabsTrigger value='telco'>Telco</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={scenario} onValueChange={(value) => { setScenario(value); setSelection(null) }}>
            <SelectTrigger className='w-48'><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value='5g-sa'>5G Standalone</SelectItem>
              <SelectItem value='4g-epc'>4G EPC</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      <Card className='h-[calc(100vh-12rem)]'>
        <CardHeader className='flex-row items-center justify-between'>
          <CardTitle>
            {status.data?.state ?? 'Conectando'} · {status.data?.components.length ?? 0} componentes
          </CardTitle>
          <Badge variant={runtime.data?.source === 'remote' ? 'default' : 'secondary'}>
            {runtime.data?.hostname ?? 'sin conexión'} · {runtime.data?.source ?? 'unknown'}
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

      <Sheet open={Boolean(selection)} onOpenChange={(open) => !open && setSelection(null)}>
        <SheetContent className='sm:max-w-xl'>
          {selection?.type === 'host' ? (
            <HostDetail runtime={runtime.data} components={status.data?.components ?? []} />
          ) : component ? (
            <>
              <SheetHeader>
                <div className='flex items-center gap-2'>
                  <SheetTitle>{component.label}</SheetTitle>
                  <Badge variant={component.status === 'running' ? 'default' : 'destructive'}>{component.status}</Badge>
                </div>
                <SheetDescription>{component.unit} · nodo {component.node_id}</SheetDescription>
              </SheetHeader>

              {(() => {
                const componentAlarms = (alarmCenter.data?.items ?? []).filter(
                  (a) =>
                    a.component === component.id ||
                    a.component?.toLowerCase() === component.id.toLowerCase() ||
                    (a.node_id && a.node_id === component.node_id)
                )
                return (
                  <>
                    {componentAlarms.length > 0 && (
                      <div className='mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs'>
                        <div className='flex items-center justify-between'>
                          <div className='flex items-center gap-1.5 font-semibold text-destructive'>
                            <AlertTriangle className='size-3.5' />
                            <span>Incidentes Telco Activos ({componentAlarms.length})</span>
                          </div>
                          <Link to={'/alarms' as any} search={{ component: component.id } as any}>
                            <Button variant='ghost' size='sm' className='h-6 px-1.5 text-[11px] text-destructive'>
                              Ver en Alarmas
                            </Button>
                          </Link>
                        </div>
                        <div className='mt-2 space-y-1.5'>
                          {componentAlarms.map((alm) => (
                            <div key={alm.id} className='flex items-start justify-between gap-2 rounded border bg-background/90 p-2 text-xs'>
                              <div>
                                <p className='font-medium'>{alm.message}</p>
                                {alm.evidence && <p className='text-[10px] font-mono text-muted-foreground'>{alm.evidence}</p>}
                              </div>
                              <Badge
                                variant={alm.severity === 'critical' ? 'destructive' : 'secondary'}
                                className={`text-[9px] uppercase font-mono ${alm.severity === 'major' ? 'bg-amber-500 text-white' : ''}`}
                              >
                                {alm.severity}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className='mx-4 mt-3 rounded-lg border bg-muted/20 p-3'>
                      <h4 className='text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2'>
                        Acciones del Operador (FCAPS)
                      </h4>
                      <div className='flex flex-wrap gap-2'>
                        <Link to={'/commands' as any} search={{ component: component.id } as any}>
                          <Button variant='outline' size='sm' className='h-7 gap-1.5 text-xs'>
                            <Terminal className='size-3 text-primary' />
                            Consola MML ({component.id.toUpperCase()})
                          </Button>
                        </Link>
                        <Link to='/traces'>
                          <Button variant='outline' size='sm' className='h-7 gap-1.5 text-xs'>
                            <Radio className='size-3 text-sky-500' />
                            Capturar Traza PCAP
                          </Button>
                        </Link>
                        <Link to={'/alarms' as any} search={{ component: component.id } as any}>
                          <Button variant='outline' size='sm' className='h-7 gap-1.5 text-xs'>
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
                <Detail title='Procedimientos relacionados' values={component.procedures} />
                <Detail title='Dependencias' values={component.depends_on} empty='Sin dependencias declaradas' />
                <Detail title='Configuraciones' values={component.config_paths} />
                <h3 className='mb-2 mt-5 text-sm font-semibold'>Endpoints esperados</h3>
                <div className='space-y-2'>
                  {component.expected_endpoints.map((endpoint) => {
                    const observed = runtime.data?.listening_ports.some(
                      (port) => port.protocol === endpoint.protocol && port.address === endpoint.address && port.port === endpoint.port
                    )
                    return (
                      <div key={`${endpoint.protocol}-${endpoint.address}-${endpoint.port}`} className='flex items-center justify-between rounded-md border p-2 text-xs'>
                        <span>{endpoint.interface} · {endpoint.protocol}://{endpoint.address}:{endpoint.port}</span>
                        <Badge variant={observed ? 'default' : 'destructive'}>{observed ? 'escuchando' : 'no detectado'}</Badge>
                      </div>
                    )
                  })}
                  {!component.expected_endpoints.length && <p className='text-sm text-muted-foreground'>Sin endpoint fijo declarado.</p>}
                </div>
                <h3 className='mb-2 mt-5 text-sm font-semibold'>Últimos logs</h3>
                <pre className='max-h-64 overflow-auto rounded-md bg-muted p-3 text-[11px] whitespace-pre-wrap'>
                  {logs.isLoading ? 'Consultando…' : logs.data?.lines.slice(-30).join('\n') || 'Sin líneas disponibles'}
                </pre>
              </ScrollArea>
              {canOperate(user?.role) && (
                <SheetFooter>
                  {component.status === 'running' ? (
                    <Button variant='destructive' onClick={() => setPendingAction('stop')}>Detener {component.label}</Button>
                  ) : (
                    <Button onClick={() => setPendingAction('start')}>Iniciar {component.label}</Button>
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

function Detail({ title, values, empty = 'Sin datos' }: { title: string; values: string[]; empty?: string }) {
  return (
    <section className='mt-5'>
      <h3 className='mb-2 text-sm font-semibold'>{title}</h3>
      <div className='flex flex-wrap gap-2'>
        {values.length ? values.map((value) => <Badge key={value} variant='secondary'>{value}</Badge>) : <span className='text-sm text-muted-foreground'>{empty}</span>}
      </div>
    </section>
  )
}

function HostDetail({ runtime, components }: { runtime?: RuntimeSnapshot; components: ScenarioStatus['components'] }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{runtime?.hostname ?? 'Host del testbed'}</SheetTitle>
        <SheetDescription>Vista física obtenida por {runtime?.source ?? 'fuente desconocida'}</SheetDescription>
      </SheetHeader>
      <ScrollArea className='min-h-0 flex-1 px-4'>
        <h3 className='mb-2 text-sm font-semibold'>Interfaces Linux</h3>
        <div className='space-y-2'>
          {runtime?.interfaces.map((item) => (
            <div key={item.name} className='rounded-md border p-3'>
              <div className='flex justify-between'><b>{item.name}</b><Badge variant='secondary'>{item.state}</Badge></div>
              <p className='mt-1 text-xs text-muted-foreground'>{item.addresses.map((address) => `${address.address}/${address.prefix_length}`).join(', ') || 'Sin direcciones'}</p>
            </div>
          ))}
        </div>
        <h3 className='mb-2 mt-5 text-sm font-semibold'>Funciones alojadas</h3>
        <div className='flex flex-wrap gap-2'>{components.map((item) => <Badge key={item.id} variant={item.status === 'running' ? 'default' : 'destructive'}>{item.label}</Badge>)}</div>
        <h3 className='mb-2 mt-5 text-sm font-semibold'>Sockets en escucha</h3>
        <p className='text-sm text-muted-foreground'>{runtime?.listening_ports.length ?? 0} endpoints TCP, UDP y SCTP detectados.</p>
      </ScrollArea>
    </>
  )
}
