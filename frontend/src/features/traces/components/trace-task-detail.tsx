import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  Braces,
  CheckCircle2,
  Clock3,
  Download,
  FileJson,
  Fingerprint,
  GitBranch,
  HardDrive,
  Maximize2,
  Minimize2,
  Network,
  Radio,
  ShieldAlert,
  Square,
  Trash2,
} from 'lucide-react'
import type { Role } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  isActiveTrace,
  traceKind,
  type TraceAnalysis,
  type TraceArtifact,
  type TraceDiagnostic,
  type TraceEvent,
  type TraceIdentifier,
  type TraceTask,
} from '../types'
import { SequenceDiagram } from './sequence-diagram'
import {
  EmptyState,
  EvidenceBadge,
  ProcedureStatusIcon,
  TraceOutcomeBadge,
  TraceStatusBadge,
} from './trace-status'
import { formatBytes, formatDuration, formatTimestamp } from '../format'
import { TraceTimeline } from './trace-timeline'

type TraceTaskDetailProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  task?: TraceTask
  analysis?: TraceAnalysis
  isLoading: boolean
  analysisError?: Error | null
  role?: Role
  currentUsername?: string
  isStopping?: boolean
  isDeleting?: boolean
  onStop: (task: TraceTask) => void
  onDelete: (task: TraceTask) => void
  onDownload: (
    task: TraceTask,
    artifact: 'original' | 'filtered' | 'evidence'
  ) => void
}

export function TraceTaskDetail({
  open,
  onOpenChange,
  task,
  analysis,
  isLoading,
  analysisError,
  role,
  currentUsername,
  isStopping,
  isDeleting,
  onStop,
  onDelete,
  onDownload,
}: TraceTaskDetailProps) {
  const [selectedEvent, setSelectedEvent] = useState<TraceEvent | undefined>()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const canControl =
    !!task &&
    (role === 'admin' ||
      role === 'teacher' ||
      (!!task.owner && task.owner === currentUsername))
  const events = analysis?.events ?? []
  const identifiers = useMemo(
    () => buildIdentifierChain(task, analysis?.identifiers),
    [analysis?.identifiers, task]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className={cn(
          'flex flex-col gap-0 p-0 transition-all duration-150',
          isFullscreen
            ? '!fixed !inset-0 !top-0 !left-0 !transform-none !translate-x-0 !translate-y-0 !h-screen !max-h-screen !w-screen !max-w-none !rounded-none !border-none !z-50 overflow-hidden'
            : 'h-[94vh] max-h-[94vh] w-[calc(100%-1rem)] max-w-none overflow-hidden sm:max-w-[min(1600px,calc(100%-2rem))]'
        )}
      >
        <DialogHeader className='shrink-0 border-b px-5 py-4 pr-12'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setIsFullscreen((prev) => !prev)}
                  className='gap-1.5'
                  title={isFullscreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
                >
                  {isFullscreen ? <Minimize2 className='h-4 w-4' /> : <Maximize2 className='h-4 w-4' />}
                  <span className='hidden sm:inline'>{isFullscreen ? 'Salir' : 'Pantalla completa'}</span>
                </Button>
                <DialogTitle className='truncate text-xl'>
                  {task?.name ?? 'Detalle de tarea'}
                </DialogTitle>
                {task && <TraceStatusBadge status={task.status} />}
                {task && (
                  <TraceOutcomeBadge
                    outcome={analysis?.outcome ?? task.outcome ?? task.result}
                  />
                )}
              </div>
              <DialogDescription className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-1'>
                <span className='font-mono'>
                  {task ? shortId(task.id) : 'Consultando…'}
                </span>
                {task?.owner && (
                  <>
                    <span>·</span>
                    <span>creada por {task.owner}</span>
                  </>
                )}
                {task?.created_at && (
                  <>
                    <span>·</span>
                    <span>{formatTimestamp(task.created_at)}</span>
                  </>
                )}
              </DialogDescription>
            </div>
            {task && (
              <div className='flex flex-wrap items-center gap-2'>
                {isActiveTrace(task) && canControl && (
                  <Button
                    variant='destructive'
                    size='sm'
                    disabled={isStopping}
                    onClick={() => onStop(task)}
                  >
                    <Square /> {isStopping ? 'Deteniendo…' : 'Detener'}
                  </Button>
                )}
                {!isActiveTrace(task) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='outline' size='sm'>
                        <Download /> Descargar
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuItem
                        onSelect={() => onDownload(task, 'original')}
                      >
                        <Download /> PCAP original
                      </DropdownMenuItem>
                      {traceKind(task) === 'subscriber' && (
                        <>
                          <DropdownMenuItem
                            onSelect={() => onDownload(task, 'filtered')}
                          >
                            <Download /> PCAP filtrado
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => onDownload(task, 'evidence')}
                          >
                            <FileJson /> Evidencia JSON
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {!isActiveTrace(task) && canControl && (
                  <Button
                    variant='ghost'
                    size='icon'
                    aria-label='Eliminar tarea'
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className='text-destructive' />
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className='min-h-0 flex-1'>
          <div className='space-y-5 p-4 sm:p-6'>
            {isLoading || !task ? (
              <DetailSkeleton />
            ) : (
              <>
                <SummaryCards task={task} analysis={analysis} />

                {traceKind(task) === 'subscriber' && (
                  <IdentifierChain
                    identifiers={identifiers}
                    status={analysis?.correlation_status}
                  />
                )}

                {analysisError && (
                  <Alert variant='destructive'>
                    <ShieldAlert />
                    <AlertTitle>El análisis no está disponible</AlertTitle>
                    <AlertDescription>
                      {analysisError.message}. El PCAP original y los metadatos
                      de captura siguen disponibles.
                    </AlertDescription>
                  </Alert>
                )}

                <Tabs defaultValue='overview' className='gap-4'>
                  <div className='overflow-x-auto pb-1'>
                    <TabsList>
                      <TabsTrigger value='overview'>
                        <Activity /> Resumen
                      </TabsTrigger>
                      <TabsTrigger value='timeline'>
                        <GitBranch /> Timeline{' '}
                        <Badge variant='secondary'>{events.length}</Badge>
                      </TabsTrigger>
                      <TabsTrigger value='sequence'>
                        <Network /> Secuencia
                      </TabsTrigger>
                      <TabsTrigger value='evidence'>
                        <Braces /> Evidencia
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value='overview'>
                    <Overview task={task} analysis={analysis} />
                  </TabsContent>
                  <TabsContent value='timeline'>
                    <TraceTimeline
                      events={events}
                      selectedEventId={selectedEvent?.id}
                      onSelectEvent={setSelectedEvent}
                    />
                  </TabsContent>
                  <TabsContent value='sequence'>
                    <SequenceDiagram
                      events={events}
                      participants={analysis?.participants}
                      selectedEventId={selectedEvent?.id}
                      onSelectEvent={setSelectedEvent}
                    />
                    {selectedEvent && (
                      <SelectedEventCard
                        event={selectedEvent}
                        onOpenTimeline={() => undefined}
                      />
                    )}
                  </TabsContent>
                  <TabsContent value='evidence'>
                    <EvidenceView
                      task={task}
                      analysis={analysis}
                      onDownload={onDownload}
                    />
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>

      {task && (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title='Eliminar tarea y artefactos'
          desc='Se eliminarán los PCAP, eventos correlacionados y archivos de evidencia asociados. Esta acción no puede deshacerse.'
          confirmText='Eliminar definitivamente'
          destructive
          isLoading={isDeleting}
          handleConfirm={() => {
            onDelete(task)
            setDeleteOpen(false)
          }}
        />
      )}
    </Dialog>
  )
}

function SummaryCards({
  task,
  analysis,
}: {
  task: TraceTask
  analysis?: TraceAnalysis
}) {
  const cards = [
    {
      label: 'Modalidad',
      value:
        traceKind(task) === 'subscriber'
          ? 'Subscriber Trace'
          : 'Interface Trace',
      detail:
        traceKind(task) === 'subscriber'
          ? `${(task.identifier_type ?? 'IMSI').toUpperCase()} ${maskIdentifier(task.identifier_masked ?? task.identifier, task.identifier_type)}`
          : (task.capture_point_label ??
            task.capture_point?.toUpperCase() ??
            'Punto de captura'),
      icon: Radio,
    },
    {
      label: 'Duración',
      value: formatDuration(task.duration_seconds),
      detail: `${formatTimestamp(task.started_at ?? task.created_at)} · ${formatTimestamp(task.completed_at)}`,
      icon: Clock3,
    },
    {
      label: 'Evidencia',
      value: `${task.packet_count ?? 0} paquetes`,
      detail: `${formatBytes(task.size_bytes)} · ${analysis?.events?.length ?? task.event_count ?? 0} eventos`,
      icon: HardDrive,
    },
    {
      label: 'Correlación',
      value: correlationLabel(analysis?.correlation_status),
      detail: analysis?.analysis_version
        ? `Motor ${analysis.analysis_version}`
        : 'Basada en evidencia disponible',
      icon: Fingerprint,
    },
  ]
  return (
    <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className='flex items-start justify-between gap-3 pt-5'>
            <div className='min-w-0'>
              <p className='text-xs font-medium text-muted-foreground'>
                {card.label}
              </p>
              <p className='mt-1 truncate text-lg font-semibold'>
                {card.value}
              </p>
              <p className='mt-1 truncate text-xs text-muted-foreground'>
                {card.detail}
              </p>
            </div>
            <div className='rounded-md bg-muted p-2'>
              <card.icon className='size-4 text-muted-foreground' />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function IdentifierChain({
  identifiers,
  status,
}: {
  identifiers: TraceIdentifier[]
  status?: string
}) {
  if (!identifiers.length) {
    return (
      <Card>
        <CardContent className='pt-5'>
          <EmptyState
            title='Identificadores aún no correlacionados'
            description='El motor mostrará aquí la relación SUPI/IMSI → NGAP IDs → PDU Session → SEID → TEID → IP UE.'
          />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader className='flex-row items-center justify-between'>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Fingerprint className='size-4 text-primary' /> Cadena de
          identificadores
        </CardTitle>
        <Badge
          variant='outline'
          className={cn(
            status === 'complete' && 'border-emerald-500/40 text-emerald-600'
          )}
        >
          {correlationLabel(status)}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className='flex items-stretch gap-2 overflow-x-auto pb-2'>
          {identifiers.map((identifier, index) => (
            <div
              key={`${identifier.kind ?? identifier.type}:${index}`}
              className='flex shrink-0 items-center gap-2'
            >
              <div className='min-w-36 rounded-lg border bg-muted/20 p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <p className='text-[10px] font-semibold tracking-wide text-muted-foreground uppercase'>
                    {identifier.label ??
                      identifierLabel(identifier.kind ?? identifier.type)}
                  </p>
                  <EvidenceBadge
                    type={identifier.evidence_type ?? identifier.source}
                  />
                </div>
                <p className='mt-1.5 font-mono text-xs font-medium'>
                  {maskIdentifier(
                    identifier.masked_value ?? identifier.value,
                    identifier.kind ?? identifier.type
                  )}
                </p>
                {identifier.confidence && (
                  <p className='mt-1 text-[10px] text-muted-foreground'>
                    {confidenceLabel(identifier.confidence)}
                  </p>
                )}
              </div>
              {index < identifiers.length - 1 && (
                <span
                  className={cn(
                    'h-px w-7 bg-border',
                    identifier.confidence === 'inferred' &&
                      'border-t border-dashed border-amber-500 bg-transparent'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function Overview({
  task,
  analysis,
}: {
  task: TraceTask
  analysis?: TraceAnalysis
}) {
  const procedures = analysis?.procedures ?? []
  const diagnostics = analysis?.diagnostics ?? []
  return (
    <div className='grid gap-4 xl:grid-cols-[1.25fr_.75fr]'>
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Procedimientos 3GPP</CardTitle>
          </CardHeader>
          <CardContent>
            {!procedures.length ? (
              <EmptyState
                title='Resultado aún no disponible'
                description={
                  isActiveTrace(task)
                    ? 'La tarea continúa capturando o procesando evidencia.'
                    : 'No se encontraron suficientes eventos para clasificar un procedimiento.'
                }
              />
            ) : (
              <div className='space-y-3'>
                {procedures.map((procedure, index) => (
                  <div
                    key={procedure.id ?? procedure.type ?? index}
                    className='flex items-start gap-3 rounded-lg border p-3'
                  >
                    <ProcedureStatusIcon status={procedure.status} />
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <p className='font-medium'>
                          {procedure.label ??
                            procedure.name ??
                            procedure.type ??
                            'Procedimiento'}
                        </p>
                        <Badge variant='outline'>
                          {procedure.status ?? 'pendiente'}
                        </Badge>
                      </div>
                      <div className='mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
                        {procedure.duration_ms != null && (
                          <span>{procedure.duration_ms.toFixed(0)} ms</span>
                        )}
                        {procedure.interface && (
                          <span>Interfaz {procedure.interface}</span>
                        )}
                        {procedure.affected_nf && (
                          <span>NF {procedure.affected_nf.toUpperCase()}</span>
                        )}
                      </div>
                      {procedure.last_successful_step && (
                        <p className='mt-2 text-xs'>
                          Último paso confirmado:{' '}
                          {procedure.last_successful_step}
                        </p>
                      )}
                      {procedure.failure_cause && (
                        <p className='mt-2 text-xs text-destructive'>
                          {procedure.failure_cause.domain}{' '}
                          {procedure.failure_cause.code}:{' '}
                          {procedure.failure_cause.text}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        {!!analysis?.summary && (
          <Alert>
            <CheckCircle2 />
            <AlertTitle>Conclusión del motor de trazabilidad</AlertTitle>
            <AlertDescription>{analysis.summary}</AlertDescription>
          </Alert>
        )}
      </div>
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Ámbito técnico</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <MetadataRow
              label='Escenario'
              value={task.scenario_id ?? 'No indicado'}
            />
            <MetadataRow label='Testbed' value={task.testbed_id ?? 'local'} />
            <MetadataRow
              label='Agente'
              value={
                task.capture_agent_label ??
                task.capture_agent_id ??
                task.source ??
                'primary'
              }
            />
            <MetadataRow
              label='Nodo'
              value={task.node_id ?? 'Ámbito automático'}
            />
            <MetadataRow
              label='NF'
              value={
                task.component_label ??
                task.component_id?.toUpperCase() ??
                'Varias NFs'
              }
            />
            <MetadataRow
              label='Interfaz'
              value={
                task.capture_point_label ??
                task.capture_point?.toUpperCase() ??
                'Multipunto'
              }
            />
            <MetadataRow
              label='Propietario'
              value={task.owner ?? 'No registrado'}
            />
          </CardContent>
        </Card>
        <Diagnostics diagnostics={diagnostics} />
      </div>
    </div>
  )
}

function Diagnostics({ diagnostics }: { diagnostics: TraceDiagnostic[] }) {
  if (!diagnostics.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>Diagnóstico contextual</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        {diagnostics.map((item, index) => (
          <Alert
            key={item.id ?? index}
            variant={
              ['critical', 'major'].includes(item.severity ?? '')
                ? 'destructive'
                : 'default'
            }
          >
            <ShieldAlert />
            <AlertTitle>{item.title}</AlertTitle>
            <AlertDescription>
              {(item.description || item.detail) && (
                <p>{item.description ?? item.detail}</p>
              )}
              {item.evidence && (
                <p className='font-mono text-xs'>{item.evidence}</p>
              )}
              {item.recommendation && (
                <p>
                  <strong>Recomendación:</strong> {item.recommendation}
                </p>
              )}
            </AlertDescription>
          </Alert>
        ))}
      </CardContent>
    </Card>
  )
}

function EvidenceView({
  task,
  analysis,
  onDownload,
}: {
  task: TraceTask
  analysis?: TraceAnalysis
  onDownload: TraceTaskDetailProps['onDownload']
}) {
  const artifacts = analysis?.artifacts ?? task.artifacts ?? []
  return (
    <div className='grid gap-4 xl:grid-cols-[1fr_.8fr]'>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Artefactos verificables</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <ArtifactRow
            kind='original'
            label='PCAP original'
            description='Captura íntegra obtenida del agente remoto.'
            task={task}
            artifacts={artifacts}
            onDownload={onDownload}
          />
          {traceKind(task) === 'subscriber' && (
            <>
              <ArtifactRow
                kind='filtered'
                label='PCAP del suscriptor'
                description='Paquetes asociados por identificadores confirmados.'
                task={task}
                artifacts={artifacts}
                onDownload={onDownload}
              />
              <ArtifactRow
                kind='evidence'
                label='Evidencia estructurada'
                description='Eventos, relaciones, causas y procedencia en JSON.'
                task={task}
                artifacts={artifacts}
                onDownload={onDownload}
              />
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>
            Trazabilidad de la evidencia
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4 text-sm'>
          <p className='text-muted-foreground'>
            Cada evento conserva su origen para distinguir observación directa e
            inferencia del correlador.
          </p>
          <EvidenceLegend
            type='pcap'
            title='PCAP'
            description='Campo decodificado directamente de una trama.'
          />
          <EvidenceLegend
            type='log'
            title='LOG'
            description='Evento emitido por Open5GS o UERANSIM.'
          />
          <EvidenceLegend
            type='runtime'
            title='RUNTIME'
            description='Estado consultado en el nodo durante la tarea.'
          />
          <EvidenceLegend
            type='correlated'
            title='CORRELACIONADO'
            description='Relación determinística o inferida entre evidencias.'
          />
          <Separator />
          <p className='text-xs text-muted-foreground'>
            Las relaciones inferidas se dibujan con línea discontinua y nunca se
            presentan como paquetes observados.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function ArtifactRow({
  kind,
  label,
  description,
  task,
  artifacts,
  onDownload,
}: {
  kind: 'original' | 'filtered' | 'evidence'
  label: string
  description: string
  task: TraceTask
  artifacts: TraceArtifact[]
  onDownload: TraceTaskDetailProps['onDownload']
}) {
  const artifact = artifacts.find(
    (item) => (item.kind ?? item.id) === kind
  )
  const available = artifact
    ? artifact.available !== false
    : kind === 'original' || traceKind(task) === 'subscriber'
  return (
    <div className='flex items-center justify-between gap-3 rounded-lg border p-3'>
      <div className='min-w-0'>
        <p className='font-medium'>{artifact?.label ?? label}</p>
        <p className='mt-1 text-xs text-muted-foreground'>{description}</p>
        {artifact?.sha256 && (
          <p className='mt-1 truncate font-mono text-[10px] text-muted-foreground'>
            SHA-256 {artifact.sha256}
          </p>
        )}
      </div>
      <Button
        variant='outline'
        size='sm'
        disabled={!available}
        onClick={() => onDownload(task, kind)}
      >
        <Download />{' '}
        {artifact?.size_bytes != null
          ? formatBytes(artifact.size_bytes)
          : 'Descargar'}
      </Button>
    </div>
  )
}

function EvidenceLegend({
  type,
  title,
  description,
}: {
  type: 'pcap' | 'log' | 'runtime' | 'correlated'
  title: string
  description: string
}) {
  return (
    <div className='flex items-start gap-3'>
      <EvidenceBadge type={type} />
      <div>
        <p className='font-medium'>{title}</p>
        <p className='text-xs text-muted-foreground'>{description}</p>
      </div>
    </div>
  )
}

function SelectedEventCard({
  event,
}: {
  event: TraceEvent
  onOpenTimeline: () => void
}) {
  return (
    <Card className='mt-4'>
      <CardContent className='pt-5'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge>{event.protocol?.toUpperCase() ?? 'EVENTO'}</Badge>
          <EvidenceBadge type={event.evidence_type} />
          {(event.frame_number ?? event.packet_number) != null && (
            <Badge variant='outline'>
              Frame #{event.frame_number ?? event.packet_number}
            </Badge>
          )}
        </div>
        <p className='mt-3 font-medium'>{event.message}</p>
        {event.evidence && (
          <p className='mt-2 font-mono text-xs text-muted-foreground'>
            {event.evidence}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-start justify-between gap-4'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='text-right font-medium'>{value}</span>
    </div>
  )
}

function buildIdentifierChain(task?: TraceTask, declared?: TraceIdentifier[]) {
  const items = [...(declared ?? [])]
  if (
    !items.length &&
    task?.identifier_type &&
    (task.identifier_masked || task.identifier)
  ) {
    items.push({
      kind: task.identifier_type,
      value: maskIdentifier(
        task.identifier_masked ?? task.identifier,
        task.identifier_type
      ),
      evidence_type: 'runtime',
      confidence: 'direct',
    })
  }
  const order = [
    'imsi',
    'supi',
    'suci',
    'ran_ue_ngap_id',
    'ran-ue-ngap-id',
    'amf_ue_ngap_id',
    'amf-ue-ngap-id',
    'pdu_session_id',
    'pdu-session-id',
    'pfcp_seid',
    'seid',
    'gtpu_teid',
    'teid',
    'ue_ip',
    'ue-ip',
  ]
  return items.sort((a, b) => {
    const aKey = (a.kind ?? a.type ?? '').toLowerCase()
    const bKey = (b.kind ?? b.type ?? '').toLowerCase()
    const aIndex = order.indexOf(aKey)
    const bIndex = order.indexOf(bKey)
    return (
      (aIndex === -1 ? order.length : aIndex) -
      (bIndex === -1 ? order.length : bIndex)
    )
  })
}

function identifierLabel(kind?: string) {
  const labels: Record<string, string> = {
    imsi: 'IMSI',
    supi: 'SUPI',
    suci: 'SUCI',
    ran_ue_ngap_id: 'RAN UE NGAP ID',
    'ran-ue-ngap-id': 'RAN UE NGAP ID',
    amf_ue_ngap_id: 'AMF UE NGAP ID',
    'amf-ue-ngap-id': 'AMF UE NGAP ID',
    pdu_session_id: 'PDU Session ID',
    'pdu-session-id': 'PDU Session ID',
    pfcp_seid: 'PFCP SEID',
    seid: 'PFCP SEID',
    gtpu_teid: 'GTP-U TEID',
    teid: 'GTP-U TEID',
    ue_ip: 'UE IP',
    'ue-ip': 'UE IP',
  }
  return (
    labels[(kind ?? '').toLowerCase()] ??
    (kind ?? 'Identificador').replace(/_/g, ' ').toUpperCase()
  )
}

function confidenceLabel(value: string) {
  const labels: Record<string, string> = {
    direct: 'Evidencia directa',
    transaction: 'Misma transacción',
    inferred: 'Relación inferida',
  }
  return labels[value] ?? value
}

function correlationLabel(value?: string) {
  const labels: Record<string, string> = {
    complete: 'Completa',
    partial: 'Parcial',
    insufficient: 'Insuficiente',
  }
  return value ? (labels[value] ?? value) : 'Pendiente'
}

function maskIdentifier(value?: string, kind?: string) {
  if (!value) return 'No identificado'
  if (value.includes('*') || value.includes('•')) return value
  const normalizedKind = (kind ?? '').toLowerCase()
  if (!['imsi', 'supi'].includes(normalizedKind) || value.length < 9)
    return value
  const prefix = value.toLowerCase().startsWith('imsi-') ? 'imsi-' : ''
  const digits = prefix ? value.slice(prefix.length) : value
  return `${prefix}${digits.slice(0, 5)}${'•'.repeat(Math.max(digits.length - 9, 3))}${digits.slice(-4)}`
}

function shortId(id: string) {
  return id.length > 20 ? `${id.slice(0, 12)}…${id.slice(-6)}` : id
}

function DetailSkeleton() {
  return (
    <div className='animate-pulse space-y-4'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className='h-28 rounded-xl bg-muted' />
        ))}
      </div>
      <div className='h-36 rounded-xl bg-muted' />
      <div className='h-96 rounded-xl bg-muted' />
    </div>
  )
}


export type TraceTaskDetailViewProps = {
  task?: TraceTask
  analysis?: TraceAnalysis
  isLoading: boolean
  analysisError?: Error | null
  role?: Role
  currentUsername?: string
  isStopping?: boolean
  isDeleting?: boolean
  onBack: () => void
  onStop: (task: TraceTask) => void
  onDelete: (task: TraceTask) => void
  onDownload: (
    task: TraceTask,
    artifact: 'original' | 'filtered' | 'evidence'
  ) => void
}

export function TraceTaskDetailView({
  task,
  analysis,
  isLoading,
  analysisError,
  role,
  currentUsername,
  isStopping,
  isDeleting,
  onBack,
  onStop,
  onDelete,
  onDownload,
}: TraceTaskDetailViewProps) {
  const [selectedEvent, setSelectedEvent] = useState<TraceEvent | undefined>()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const canControl =
    !!task &&
    (role === 'admin' ||
      role === 'teacher' ||
      (!!task.owner && task.owner === currentUsername))
  const events = analysis?.events ?? []
  const identifiers = useMemo(
    () => buildIdentifierChain(task, analysis?.identifiers),
    [analysis?.identifiers, task]
  )

  return (
    <div className='flex flex-col gap-5'>
      {/* Barra Superior con Navegación y Acciones */}
      <div className='flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5 shadow-xs lg:flex-row lg:items-center lg:justify-between'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2.5'>
            <Button
              variant='outline'
              size='sm'
              onClick={onBack}
              className='gap-1.5 font-semibold shadow-xs hover:bg-muted'
              title='Volver a la lista de tareas'
            >
              <ArrowLeft className='h-4 w-4' />
              <span>Volver a Trazas</span>
            </Button>
            <h2 className='truncate text-xl font-bold tracking-tight text-foreground'>
              {task?.name ?? 'Detalle de tarea'}
            </h2>
            {task && <TraceStatusBadge status={task.status} />}
            {task && (
              <TraceOutcomeBadge
                outcome={analysis?.outcome ?? task.outcome ?? task.result}
              />
            )}
          </div>
          <div className='mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground'>
            <span className='font-mono font-medium'>
              {task ? shortId(task.id) : 'Consultando…'}
            </span>
            {task?.owner && (
              <>
                <span>·</span>
                <span>creada por <strong>{task.owner}</strong></span>
              </>
            )}
            {task?.created_at && (
              <>
                <span>·</span>
                <span>{formatTimestamp(task.created_at)}</span>
              </>
            )}
          </div>
        </div>

        {task && (
          <div className='flex flex-wrap items-center gap-2'>
            {isActiveTrace(task) && canControl && (
              <Button
                variant='destructive'
                size='sm'
                disabled={isStopping}
                onClick={() => onStop(task)}
              >
                <Square /> {isStopping ? 'Deteniendo…' : 'Detener'}
              </Button>
            )}
            {!isActiveTrace(task) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='outline' size='sm' className='gap-1.5 font-semibold shadow-xs'>
                    <Download className='h-4 w-4' /> Descargar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem
                    onSelect={() => onDownload(task, 'original')}
                  >
                    <Download /> PCAP original
                  </DropdownMenuItem>
                  {traceKind(task) === 'subscriber' && (
                    <>
                      <DropdownMenuItem
                        onSelect={() => onDownload(task, 'filtered')}
                      >
                        <Download /> PCAP filtrado
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => onDownload(task, 'evidence')}
                      >
                        <FileJson /> Evidencia JSON
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!isActiveTrace(task) && canControl && (
              <Button
                variant='ghost'
                size='icon'
                aria-label='Eliminar tarea'
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className='text-destructive' />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Contenido Principal sin modales */}
      {isLoading || !task ? (
        <DetailSkeleton />
      ) : (
        <div className='space-y-5'>
          <SummaryCards task={task} analysis={analysis} />

          {traceKind(task) === 'subscriber' && (
            <IdentifierChain
              identifiers={identifiers}
              status={analysis?.correlation_status}
            />
          )}

          {analysisError && (
            <Alert variant='destructive'>
              <ShieldAlert />
              <AlertTitle>El análisis no está disponible</AlertTitle>
              <AlertDescription>
                {analysisError.message}. El PCAP original y los metadatos
                de captura siguen disponibles.
              </AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue='sequence' className='gap-4'>
            <div className='overflow-x-auto pb-1'>
              <TabsList className='border bg-card p-1 shadow-xs'>
                <TabsTrigger value='sequence' className='gap-1.5 font-medium'>
                  <Network className='h-4 w-4 text-sky-500' /> Secuencia E2E
                </TabsTrigger>
                <TabsTrigger value='overview' className='gap-1.5 font-medium'>
                  <Activity className='h-4 w-4 text-emerald-500' /> Resumen
                </TabsTrigger>
                <TabsTrigger value='timeline' className='gap-1.5 font-medium'>
                  <GitBranch className='h-4 w-4 text-violet-500' /> Timeline{' '}
                  <Badge variant='secondary' className='ml-1 text-[10px]'>{events.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value='evidence' className='gap-1.5 font-medium'>
                  <Braces className='h-4 w-4 text-amber-500' /> Evidencia 3GPP
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value='sequence' className='mt-2 space-y-4'>
              <SequenceDiagram
                events={events}
                participants={analysis?.participants}
                selectedEventId={selectedEvent?.id}
                onSelectEvent={setSelectedEvent}
              />
              {selectedEvent && (
                <SelectedEventCard
                  event={selectedEvent}
                  onOpenTimeline={() => undefined}
                />
              )}
            </TabsContent>
            <TabsContent value='overview' className='mt-2'>
              <Overview task={task} analysis={analysis} />
            </TabsContent>
            <TabsContent value='timeline' className='mt-2'>
              <TraceTimeline
                events={events}
                selectedEventId={selectedEvent?.id}
                onSelectEvent={setSelectedEvent}
              />
            </TabsContent>
            <TabsContent value='evidence' className='mt-2'>
              <EvidenceView
                task={task}
                analysis={analysis}
                onDownload={onDownload}
              />
            </TabsContent>
          </Tabs>

          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title='Eliminar tarea y artefactos'
            desc={`¿Deseas eliminar "${task.name ?? task.id}"? Se eliminarán los PCAP, eventos correlacionados y archivos de evidencia asociados. Esta acción no puede deshacerse.`}
            confirmText='Eliminar definitivamente'
            destructive
            isLoading={isDeleting}
            handleConfirm={() => {
              onDelete(task)
              setDeleteOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
