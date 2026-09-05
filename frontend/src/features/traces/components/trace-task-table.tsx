import { useMemo, useState } from 'react'
import {
  Download,
  Eye,
  FileJson,
  Filter,
  MoreHorizontal,
  Search,
  Square,
  Trash2,
  UserRoundSearch,
} from 'lucide-react'
import type { Role } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  isActiveTrace,
  traceKind,
  type TraceArtifact,
  type TraceTask,
} from '../types'
import {
  EmptyState,
  TraceOutcomeBadge,
  TraceProgress,
  TraceStatusBadge,
} from './trace-status'
import { formatBytes, formatDuration, formatTimestamp } from '../format'

type TraceTaskTableProps = {
  tasks?: TraceTask[]
  isLoading: boolean
  error?: Error | null
  currentUsername?: string
  role?: Role
  pendingStopId?: string
  pendingDeleteId?: string
  onView: (task: TraceTask) => void
  onStop: (task: TraceTask) => void
  onDelete: (task: TraceTask) => void
  onDownload: (
    task: TraceTask,
    artifact: 'original' | 'filtered' | 'evidence'
  ) => void
}

export function TraceTaskTable({
  tasks,
  isLoading,
  error,
  currentUsername,
  role,
  pendingStopId,
  pendingDeleteId,
  onView,
  onStop,
  onDelete,
  onDownload,
}: TraceTaskTableProps) {
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deleteCandidate, setDeleteCandidate] = useState<TraceTask | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (tasks ?? []).filter((task) => {
      if (kindFilter !== 'all' && traceKind(task) !== kindFilter) return false
      if (statusFilter === 'active' && !isActiveTrace(task)) return false
      if (statusFilter === 'completed' && task.status !== 'completed')
        return false
      if (
        statusFilter === 'failed' &&
        !['failed', 'interrupted'].includes(task.status)
      )
        return false
      if (!term) return true
      return [
        task.name,
        task.id,
        task.capture_point,
        task.capture_point_label,
        task.component_id,
        task.component_label,
        task.identifier_masked,
        task.identifier,
        task.owner,
      ].some((value) => value?.toLowerCase().includes(term))
    })
  }, [kindFilter, search, statusFilter, tasks])

  const activeCount = tasks?.filter(isActiveTrace).length ?? 0

  return (
    <>
      <Card>
        <CardHeader className='gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex items-center gap-3'>
            <div>
              <CardTitle>Centro de tareas</CardTitle>
              <p className='mt-1 text-sm text-muted-foreground'>
                Captura, procesamiento, correlación y artefactos en un solo
                flujo.
              </p>
            </div>
            <Badge variant={activeCount ? 'default' : 'secondary'}>
              {activeCount} activas
            </Badge>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <div className='relative min-w-56'>
              <Search className='absolute top-2.5 left-2.5 size-4 text-muted-foreground' />
              <Input
                className='pl-8'
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder='Buscar tarea, NF o suscriptor…'
                aria-label='Buscar tareas'
              />
            </div>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className='w-full sm:w-40'>
                <Filter />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>Todos los tipos</SelectItem>
                <SelectItem value='interface'>Interface Trace</SelectItem>
                <SelectItem value='subscriber'>Subscriber Trace</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className='w-full sm:w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>Todos los estados</SelectItem>
                <SelectItem value='active'>En curso</SelectItem>
                <SelectItem value='completed'>Completadas</SelectItem>
                <SelectItem value='failed'>Fallidas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <Alert variant='destructive'>
              <AlertTitle>No se pudieron consultar las tareas</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          ) : isLoading ? (
            <TableSkeleton />
          ) : !tasks?.length ? (
            <EmptyState
              title='Aún no existen tareas de traza'
              description='Cree un Interface Trace para observar una interfaz o un Subscriber Trace para reconstruir el recorrido de un UE.'
            />
          ) : !filtered.length ? (
            <EmptyState
              title='Ninguna tarea coincide'
              description='Cambie los filtros o el texto de búsqueda para volver a mostrar resultados.'
            />
          ) : (
            <div className='overflow-x-auto rounded-lg border'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarea</TableHead>
                    <TableHead>Objetivo</TableHead>
                    <TableHead>Ámbito</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead className='w-20 text-right'>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((task) => {
                    const kind = traceKind(task)
                    const canControl =
                      role === 'admin' ||
                      role === 'teacher' ||
                      (!!task.owner && task.owner === currentUsername)
                    return (
                      <TableRow
                        key={task.id}
                        className='cursor-pointer select-none hover:bg-muted/50 transition-colors'
                        onClick={() => onView(task)}
                        onDoubleClick={() => onView(task)}
                        title='Doble clic para abrir análisis completo'
                      >
                        <TableCell className='min-w-52'>
                          <p className='font-medium'>
                            {task.name ?? legacyTaskName(task)}
                          </p>
                          <p className='mt-1 font-mono text-[10px] text-muted-foreground'>
                            {shortId(task.id)}
                          </p>
                        </TableCell>
                        <TableCell className='min-w-44'>
                          <Badge
                            variant={
                              kind === 'subscriber' ? 'default' : 'outline'
                            }
                            className='gap-1'
                          >
                            {kind === 'subscriber' && (
                              <UserRoundSearch className='size-3' />
                            )}
                            {kind === 'subscriber' ? 'Subscriber' : 'Interface'}
                          </Badge>
                          <p className='mt-1.5 text-xs text-muted-foreground'>
                            {kind === 'subscriber'
                              ? `${(task.identifier_type ?? 'IMSI').toUpperCase()} ${task.identifier_masked ?? task.identifier ?? 'enmascarado'}`
                              : (task.capture_point_label ??
                                task.capture_point?.toUpperCase() ??
                                'Punto heredado')}
                          </p>
                        </TableCell>
                        <TableCell className='min-w-44'>
                          <p className='text-sm'>
                            {task.component_label ??
                              task.component_id?.toUpperCase() ??
                              'Captura automática'}
                          </p>
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {task.capture_agent_label ??
                              task.capture_agent_id ??
                              task.source ??
                              'local'}
                            {task.node_id ? ` · ${task.node_id}` : ''}
                          </p>
                        </TableCell>
                        <TableCell>
                          <TraceStatusBadge status={task.status} />
                          <TraceProgress task={task} />
                        </TableCell>
                        <TableCell className='min-w-44'>
                          <TraceOutcomeBadge
                            outcome={task.outcome ?? task.result}
                          />
                          <p className='mt-1.5 text-xs text-muted-foreground'>
                            {task.packet_count ?? 0} paquetes ·{' '}
                            {formatBytes(task.size_bytes)}
                            {task.event_count != null
                              ? ` · ${task.event_count} eventos`
                              : ''}
                          </p>
                        </TableCell>
                        <TableCell className='min-w-40 text-xs'>
                          {formatTimestamp(task.started_at ?? task.created_at)}
                          <p className='mt-1 text-muted-foreground'>
                            {formatDuration(task.duration_seconds)}
                          </p>
                        </TableCell>
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant='ghost'
                                size='icon'
                                aria-label={`Acciones de ${task.name ?? task.id}`}
                              >
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end'>
                              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                              <DropdownMenuItem onSelect={() => onView(task)}>
                                <Eye /> Ver análisis
                              </DropdownMenuItem>
                              {isActiveTrace(task) && canControl && (
                                <DropdownMenuItem
                                  disabled={pendingStopId === task.id}
                                  onSelect={() => onStop(task)}
                                >
                                  <Square /> Detener tarea
                                </DropdownMenuItem>
                              )}
                              {!isActiveTrace(task) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      onDownload(task, 'original')
                                    }
                                  >
                                    <Download /> PCAP original
                                  </DropdownMenuItem>
                                  {hasArtifact(task, 'filtered') && (
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        onDownload(task, 'filtered')
                                      }
                                    >
                                      <Download /> PCAP filtrado
                                    </DropdownMenuItem>
                                  )}
                                  {hasArtifact(task, 'evidence') && (
                                    <DropdownMenuItem
                                      onSelect={() =>
                                        onDownload(task, 'evidence')
                                      }
                                    >
                                      <FileJson /> Evidencia JSON
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                              {canControl && !isActiveTrace(task) && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className='text-destructive focus:text-destructive'
                                    disabled={pendingDeleteId === task.id}
                                    onSelect={() => setDeleteCandidate(task)}
                                  >
                                    <Trash2 /> Eliminar
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
        title='Eliminar tarea y sus artefactos'
        desc='Esta operación elimina los metadatos, PCAP y evidencia generada por la tarea. No puede deshacerse.'
        confirmText='Eliminar tarea'
        destructive
        isLoading={
          deleteCandidate ? pendingDeleteId === deleteCandidate.id : false
        }
        handleConfirm={() => {
          if (!deleteCandidate) return
          onDelete(deleteCandidate)
          setDeleteCandidate(null)
        }}
      />
    </>
  )
}

function hasArtifact(task: TraceTask, kind: TraceArtifact['kind']) {
  if (!task.artifacts?.length) return traceKind(task) === 'subscriber'
  return task.artifacts.some(
    (artifact) =>
      (artifact.kind ?? artifact.id) === kind && artifact.available !== false
  )
}

function legacyTaskName(task: TraceTask) {
  return (
    task.capture_point_label ??
    `${task.protocol?.toUpperCase() ?? 'PCAP'} en ${task.interface ?? 'interfaz'}`
  )
}

function shortId(id: string) {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

function TableSkeleton() {
  return (
    <div className='animate-pulse space-y-2'>
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className='h-16 rounded-lg bg-muted' />
      ))}
    </div>
  )
}
