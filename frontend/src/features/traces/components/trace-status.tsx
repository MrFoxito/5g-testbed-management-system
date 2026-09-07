import {
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Loader2,
  MinusCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { isActiveTrace, type TraceEvidenceType, type TraceTask } from '../types'

const STATUS_LABELS: Record<string, string> = {
  queued: 'En cola',
  preparing: 'Preparando',
  starting: 'Iniciando',
  capturing: 'Capturando',
  running: 'Capturando',
  stopping: 'Deteniendo',
  processing: 'Correlacionando',
  completed: 'Captura finalizada',
  partial: 'Parcial',
  failed: 'Fallida',
  stopped: 'Detenida',
  cancelled: 'Cancelada',
  interrupted: 'Interrumpida',
}

export function TraceStatusBadge({ status }: { status: string }) {
  const active = [
    'queued',
    'preparing',
    'starting',
    'capturing',
    'running',
    'stopping',
    'processing',
  ].includes(status)
  const failed = ['failed', 'interrupted'].includes(status)
  const partial = ['partial', 'stopped', 'cancelled'].includes(status)
  const Icon = active
    ? Loader2
    : failed
      ? XCircle
      : partial
        ? CircleAlert
        : CheckCircle2

  return (
    <Badge
      title={
        status === 'completed'
          ? 'La tarea de captura terminó correctamente; el resultado del procedimiento se evalúa por separado.'
          : undefined
      }
      variant={failed ? 'destructive' : active ? 'default' : 'secondary'}
      className={cn(
        'gap-1 whitespace-nowrap',
        active && 'bg-sky-600 text-white hover:bg-sky-600',
        partial &&
          'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      )}
    >
      <Icon className={cn('size-3', active && 'animate-spin')} />
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

const OUTCOME_LABELS: Record<string, string> = {
  success: 'Procedimiento exitoso',
  procedure_failure: 'Falla de procedimiento',
  partial: 'Evidencia parcial',
  inconclusive: 'Procedimiento no verificado',
  no_traffic: 'Sin tráfico observado',
  unknown: 'Pendiente de análisis',
}

export function TraceOutcomeBadge({ outcome }: { outcome?: string }) {
  if (!outcome) return <span className='text-xs text-muted-foreground'>—</span>
  const failed = outcome === 'procedure_failure'
  const success = outcome === 'success'
  return (
    <Badge
      title='Resultado determinado a partir de los mensajes y procedimientos observados en la captura.'
      variant={failed ? 'destructive' : 'outline'}
      className={cn(
        success &&
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        !failed &&
          !success &&
          'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
      )}
    >
      {OUTCOME_LABELS[outcome] ?? outcome}
    </Badge>
  )
}

export function EvidenceBadge({ type }: { type?: TraceEvidenceType | string }) {
  const value = type ?? 'correlated'
  const labels: Record<string, string> = {
    pcap: 'PCAP',
    log: 'LOG',
    correlated: 'CORRELACIONADO',
    runtime: 'RUNTIME',
  }
  return (
    <Badge
      variant='outline'
      className={cn(
        'text-[10px]',
        value === 'pcap' && 'border-sky-500/40 text-sky-700 dark:text-sky-300',
        value === 'log' &&
          'border-violet-500/40 text-violet-700 dark:text-violet-300',
        value === 'correlated' &&
          'border-dashed border-amber-500/40 text-amber-700 dark:text-amber-300'
      )}
    >
      {labels[value] ?? value.toUpperCase()}
    </Badge>
  )
}

export function TraceProgress({ task }: { task: TraceTask }) {
  if (!isActiveTrace(task)) return null
  const percent = Math.min(Math.max(task.progress_percent ?? 0, 0), 100)
  return (
    <div className='mt-1.5 w-28' aria-label={`Progreso ${percent}%`}>
      <div className='h-1 overflow-hidden rounded-full bg-muted'>
        <div
          className={cn(
            'h-full rounded-full bg-sky-500 transition-all',
            task.progress_percent == null && 'w-2/5 animate-pulse'
          )}
          style={
            task.progress_percent == null ? undefined : { width: `${percent}%` }
          }
        />
      </div>
      {task.phase && (
        <p className='mt-1 truncate text-[10px] text-muted-foreground'>
          {task.phase}
        </p>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon: Icon = CircleDashed,
}: {
  title: string
  description: string
  icon?: LucideIcon
}) {
  return (
    <div className='flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center'>
      <div className='mb-3 rounded-full bg-muted p-3'>
        <Icon className='size-5 text-muted-foreground' />
      </div>
      <p className='font-medium'>{title}</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>
        {description}
      </p>
    </div>
  )
}

export function ProcedureStatusIcon({ status }: { status?: string }) {
  if (status === 'success')
    return <CheckCircle2 className='size-4 text-emerald-500' />
  if (status === 'failure')
    return <XCircle className='size-4 text-destructive' />
  if (status === 'partial')
    return <CircleAlert className='size-4 text-amber-500' />
  return <MinusCircle className='size-4 text-muted-foreground' />
}
