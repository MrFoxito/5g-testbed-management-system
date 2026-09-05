import { useMemo, useState } from 'react'
import { ChevronRight, Filter, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { eventEndpointId, type TraceEvent } from '../types'
import { EmptyState, EvidenceBadge } from './trace-status'

export function TraceTimeline({
  events,
  selectedEventId,
  onSelectEvent,
}: {
  events: TraceEvent[]
  selectedEventId?: string
  onSelectEvent?: (event: TraceEvent) => void
}) {
  const [search, setSearch] = useState('')
  const [procedure, setProcedure] = useState('all')
  const procedures = useMemo(
    () => [
      ...new Set(
        events.map((event) => event.procedure).filter(Boolean) as string[]
      ),
    ],
    [events]
  )
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return [...events]
      .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
      .filter((event) => {
        if (procedure !== 'all' && event.procedure !== procedure) return false
        if (!term) return true
        return [
          event.message,
          event.protocol,
          event.interface_3gpp,
          event.interface,
          event.procedure,
          event.source_nf,
          event.target_nf,
          event.evidence,
        ].some((value) => value?.toLowerCase().includes(term))
      })
  }, [events, procedure, search])

  if (!events.length) {
    return (
      <EmptyState
        title='No hay eventos normalizados'
        description='La captura puede estar en curso, no contener tráfico o aún encontrarse en la fase de procesamiento.'
      />
    )
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <div className='relative flex-1'>
          <Search className='absolute top-2.5 left-2.5 size-4 text-muted-foreground' />
          <Input
            className='pl-8'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder='Buscar mensaje, protocolo, interfaz o NF…'
            aria-label='Buscar eventos'
          />
        </div>
        <Select value={procedure} onValueChange={setProcedure}>
          <SelectTrigger className='w-full sm:w-56'>
            <Filter />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>Todos los procedimientos</SelectItem>
            {procedures.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!filtered.length ? (
        <EmptyState
          title='Sin coincidencias'
          description='Ajuste el procedimiento o el texto de búsqueda.'
        />
      ) : (
        <div className='relative space-y-0'>
          <div className='absolute top-3 bottom-3 left-[5.45rem] w-px bg-border sm:left-[7.45rem]' />
          {filtered.map((event) => {
            const source = eventEndpointId(event.source, event.source_nf)
            const target = eventEndpointId(event.target, event.target_nf)
            const selected = selectedEventId === event.id
            return (
              <button
                key={event.id}
                type='button'
                className={cn(
                  'relative grid w-full grid-cols-[4.5rem_1fr] gap-4 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[6.5rem_1fr]',
                  selected && 'bg-primary/5 ring-1 ring-primary/30'
                )}
                onClick={() => onSelectEvent?.(event)}
              >
                <div className='pt-0.5 text-right font-mono text-[11px] text-muted-foreground'>
                  <p>{relativeTime(event)}</p>
                  <p className='mt-1'>{absoluteTime(event.timestamp)}</p>
                </div>
                <span
                  className={cn(
                    'absolute top-[1.15rem] left-[5.13rem] size-2.5 rounded-full border-2 border-background sm:left-[7.13rem]',
                    event.status === 'failure'
                      ? 'bg-destructive'
                      : event.status === 'success'
                        ? 'bg-emerald-500'
                        : event.evidence_type === 'correlated'
                          ? 'bg-amber-500'
                          : 'bg-sky-500'
                  )}
                />
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <Badge variant='secondary'>
                      {(event.protocol ?? 'evento').toUpperCase()}
                    </Badge>
                    {(event.interface_3gpp ?? event.interface) && (
                      <Badge variant='outline'>
                        {event.interface_3gpp ?? event.interface}
                      </Badge>
                    )}
                    <EvidenceBadge type={event.evidence_type} />
                    {(event.frame_number ?? event.packet_number) != null && (
                      <span className='text-[10px] text-muted-foreground'>
                        Frame #{event.frame_number ?? event.packet_number}
                      </span>
                    )}
                  </div>
                  <div className='mt-2 flex items-center gap-1.5 text-xs text-muted-foreground'>
                    <span className='font-medium text-foreground'>
                      {displayParticipant(source)}
                    </span>
                    <ChevronRight className='size-3' />
                    <span className='font-medium text-foreground'>
                      {displayParticipant(target)}
                    </span>
                    {event.procedure && <span>· {event.procedure}</span>}
                  </div>
                  <p className='mt-1.5 text-sm font-medium'>{event.message}</p>
                  {(event.cause || event.cause_code != null) && (
                    <p className='mt-1 text-xs text-destructive'>
                      Causa {event.cause_code}: {event.cause}
                    </p>
                  )}
                  {!!event.identifiers?.length && (
                    <div className='mt-2 flex flex-wrap gap-1'>
                      {event.identifiers
                        .slice(0, 5)
                        .map((identifier, index) => (
                          <Badge
                            key={`${identifier.kind ?? identifier.type}:${index}`}
                            variant='outline'
                            className='font-mono text-[10px]'
                          >
                            {(
                              identifier.label ??
                              identifier.kind ??
                              identifier.type ??
                              'ID'
                            ).toUpperCase()}{' '}
                            {identifier.masked_value ??
                              identifier.value ??
                              'detectado'}
                          </Badge>
                        ))}
                    </div>
                  )}
                  {selected && event.evidence && (
                    <div className='mt-3 rounded-md border bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground'>
                      {event.evidence}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function relativeTime(event: TraceEvent) {
  if (event.relative_ms == null) return `#${event.ordinal ?? '—'}`
  if (event.relative_ms < 1000) return `+${event.relative_ms.toFixed(0)} ms`
  return `+${(event.relative_ms / 1000).toFixed(3)} s`
}

function absoluteTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const base = date.toLocaleTimeString([], { hour12: false })
  return `${base}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

function displayParticipant(value: string) {
  return value === 'unknown' ? 'Origen desconocido' : value.toUpperCase()
}
