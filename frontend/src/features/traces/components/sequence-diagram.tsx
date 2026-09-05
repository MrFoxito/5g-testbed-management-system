import { useMemo, useRef, useState } from 'react'
import {
  Filter,
  Layers,
  RotateCcw,
  Search,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  eventEndpointId,
  type TraceEvent,
  type TraceParticipant,
} from '../types'
import { EmptyState } from './trace-status'

const PARTICIPANT_WIDTH = 118
const CANONICAL_ORDER = [
  'ue',
  'gnb',
  'enb',
  'amf',
  'mme',
  'ausf',
  'udm',
  'udr',
  'nrf',
  'nssf',
  'pcf',
  'smf',
  'sgwc',
  'upf',
  'sgwu',
  'dn',
]

function isPureTcpAck(event: TraceEvent) {
  const msg = (event.message || '').toLowerCase()
  const proto = (event.protocol || '').toLowerCase()

  // Descartar fragmentos internos HTTP/2, ráfagas de control de flujo y heartbeats de demonios
  if (
    msg.includes('heartbeat') ||
    msg.includes('data[') ||
    msg.includes('headers[') ||
    msg.includes('window_update') ||
    msg.includes('magic') ||
    msg.includes('settings') ||
    (msg.includes('nnrf') && msg.includes('status'))
  ) {
    return true
  }

  // Si contiene indicadores explícitos de 3GPP, SBI o ICMP, no es un ACK puro de transporte
  if (
    proto.includes('ngap') ||
    proto.includes('nas') ||
    proto.includes('pfcp') ||
    proto.includes('gtp') ||
    proto.includes('icmp') ||
    proto.includes('http') ||
    proto.includes('sbi') ||
    proto.includes('radio') ||
    msg.includes('registration') ||
    msg.includes('authenticat') ||
    msg.includes('security') ||
    msg.includes('session') ||
    msg.includes('ping') ||
    msg.includes('initial') ||
    msg.includes('release') ||
    msg.includes('pdu') ||
    msg.includes('nausf') ||
    msg.includes('nudm') ||
    msg.includes('nudr') ||
    msg.includes('nsmf') ||
    msg.includes('npcf')
  ) {
    return false
  }
  return (
    (msg.includes('[ack]') || msg.includes('[psh, ack]') || proto === 'tcp') &&
    (msg.includes('seq=') || msg.includes('ack=') || msg.includes('win='))
  )
}

export function SequenceDiagram({
  events,
  participants,
  selectedEventId,
  onSelectEvent,
}: {
  events: TraceEvent[]
  participants?: Array<TraceParticipant | string>
  selectedEventId?: string
  onSelectEvent?: (event: TraceEvent) => void
}) {
  const [filterMode, setFilterMode] = useState<'telco' | 'all'>('telco')
  const [searchTerm, setSearchTerm] = useState('')
  const [density, setDensity] = useState<'normal' | 'compact'>('normal')
  const [procedureFilter, setProcedureFilter] = useState<string>('all')
  const [zoomLevel, setZoomLevel] = useState(1)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const participantList = useMemo(
    () => buildParticipants(events, participants),
    [events, participants]
  )

  const eventHeight = density === 'normal' ? 54 : 36

  const filteredEvents = useMemo(() => {
    let result = [...events].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))

    if (filterMode === 'telco') {
      result = result.filter((e) => !isPureTcpAck(e))
    }

    if (procedureFilter !== 'all') {
      result = result.filter((e) => {
        if (procedureFilter === 'registration') {
          return e.procedure === 'registration' || (e.message && e.message.toLowerCase().includes('registration'))
        }
        if (procedureFilter === 'authentication') {
          return e.procedure === 'authentication' || (e.message && (e.message.toLowerCase().includes('authenticat') || e.message.toLowerCase().includes('security')))
        }
        if (procedureFilter === 'pdu-session') {
          return e.procedure === 'pdu-session' || (e.message && (e.message.toLowerCase().includes('pdu') || e.message.toLowerCase().includes('pfcp')))
        }
        if (procedureFilter === 'user-plane') {
          return e.procedure === 'user-plane' || (e.message && (e.message.toLowerCase().includes('ping') || e.message.toLowerCase().includes('icmp') || e.message.toLowerCase().includes('gtp')))
        }
        return true
      })
    }

    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase().trim()
      result = result.filter(
        (e) =>
          (e.message && e.message.toLowerCase().includes(query)) ||
          (e.protocol && e.protocol.toLowerCase().includes(query)) ||
          (e.procedure && e.procedure.toLowerCase().includes(query)) ||
          (e.interface_3gpp && e.interface_3gpp.toLowerCase().includes(query))
      )
    }

    return result.slice(0, 500)
  }, [events, filterMode, procedureFilter, searchTerm])

  if (!events.length || participantList.length < 2) {
    return (
      <EmptyState
        title='Secuencia aún no disponible'
        description='Se requieren eventos normalizados con funciones de origen y destino para construir el diagrama.'
      />
    )
  }

  const baseWidth = Math.max(participantList.length * PARTICIPANT_WIDTH, 750)
  const width = baseWidth * zoomLevel
  const height = Math.max(filteredEvents.length * eventHeight + 60, 200)

  const xFor = (id: string) => {
    const index = participantList.findIndex(
      (item) => item.id === normalizeParticipant(id)
    )
    return (Math.max(index, 0) + 0.5) * PARTICIPANT_WIDTH * zoomLevel
  }

  return (
    <div className='space-y-3'>
      {/* Barra de Herramientas y Controles de Vista */}
      <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/60 p-2.5 text-xs'>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='flex items-center rounded-md border bg-muted/30 p-0.5'>
            <Button
              variant={filterMode === 'telco' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 gap-1 px-2.5 text-xs font-semibold'
              onClick={() => {
                setFilterMode('telco')
                setProcedureFilter('all')
              }}
            >
              <Filter className='h-3 w-3 text-sky-500' />
              Señalización 3GPP
            </Button>
            <Button
              variant={filterMode === 'all' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 gap-1 px-2.5 text-xs font-semibold'
              onClick={() => {
                setFilterMode('all')
                setProcedureFilter('all')
              }}
            >
              <Layers className='h-3 w-3 text-muted-foreground' />
              Todos ({events.length})
            </Button>
          </div>

          {/* Filtros rápidos por Fase 3GPP */}
          <div className='hidden md:flex items-center gap-1 border-l pl-2'>
            <Button
              variant={procedureFilter === 'all' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 px-2 text-[11px]'
              onClick={() => setProcedureFilter('all')}
            >
              Todo
            </Button>
            <Button
              variant={procedureFilter === 'registration' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 px-2 text-[11px]'
              onClick={() => setProcedureFilter('registration')}
            >
              Registro (Attach)
            </Button>
            <Button
              variant={procedureFilter === 'authentication' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 px-2 text-[11px]'
              onClick={() => setProcedureFilter('authentication')}
            >
              5G-AKA
            </Button>
            <Button
              variant={procedureFilter === 'pdu-session' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 px-2 text-[11px]'
              onClick={() => setProcedureFilter('pdu-session')}
            >
              Sesión PDU
            </Button>
            <Button
              variant={procedureFilter === 'user-plane' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 px-2 text-[11px]'
              onClick={() => setProcedureFilter('user-plane')}
            >
              Ping (Datos)
            </Button>
          </div>

          <div className='relative w-48 sm:w-60'>
            <Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder='Buscar (ej: Registration, PDU, Ping)...'
              className='h-7 pl-8 text-xs'
            />
          </div>
        </div>

        <div className='flex items-center gap-2'>
          <Badge variant='outline' className='font-mono text-[11px]'>
            {filteredEvents.length} eventos
          </Badge>

          <div className='flex items-center gap-1 border-l pl-2'>
            <Button
              variant={zoomLevel <= 0.85 ? 'secondary' : 'outline'}
              size='sm'
              className='h-7 px-2 text-[11px] font-semibold gap-1'
              title='Ajustar para ver todas las NFs sin scroll'
              onClick={() => {
                setZoomLevel(0.8)
                setDensity('compact')
              }}
            >
              Ajustar
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='h-7 w-7'
              title='Subir al primer evento'
              onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <ArrowUp className='h-3 w-3' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='h-7 w-7'
              title='Bajar al último evento (tráfico y pings)'
              onClick={() => scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' })}
            >
              <ArrowDown className='h-3 w-3' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='h-7 w-7'
              title='Reducir zoom'
              disabled={zoomLevel <= 0.8}
              onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.15))}
            >
              <ZoomOut className='h-3 w-3' />
            </Button>
            <Button
              variant='outline'
              size='icon'
              className='h-7 w-7'
              title='Aumentar zoom'
              disabled={zoomLevel >= 1.4}
              onClick={() => setZoomLevel((z) => Math.min(1.5, z + 0.15))}
            >
              <ZoomIn className='h-3 w-3' />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='h-7 w-7'
              title='Restablecer vista'
              onClick={() => {
                setZoomLevel(1)
                setDensity('normal')
                setSearchTerm('')
              }}
            >
              <RotateCcw className='h-3 w-3' />
            </Button>
            <Button
              variant={density === 'compact' ? 'secondary' : 'outline'}
              size='sm'
              className='h-7 px-2 text-[11px]'
              onClick={() => setDensity((d) => (d === 'normal' ? 'compact' : 'normal'))}
            >
              {density === 'normal' ? 'Compacto' : 'Normal'}
            </Button>
          </div>
        </div>
      </div>

      {/* Contenedor Principal con Scroll Vertical y Horizontal */}
      <div className='relative flex flex-col rounded-xl border bg-card shadow-inner h-[620px] max-h-[calc(100vh-230px)] min-h-[420px] overflow-hidden'>
        {/* Cabecera Fija de Funciones de Red (Sticky Header) */}
        <div className='sticky top-0 z-30 flex shrink-0 border-b bg-card/95 backdrop-blur px-4 py-2.5 overflow-hidden shadow-sm'>
          <div
            className='flex items-center justify-between shrink-0 relative'
            style={{ width: `${width}px`, height: '32px' }}
          >
            {participantList.map((participant, index) => {
              const x = (index + 0.5) * PARTICIPANT_WIDTH * zoomLevel
              return (
                <div
                  key={participant.id}
                  className='flex flex-col items-center justify-center'
                  style={{
                    position: 'absolute',
                    left: `${x}px`,
                    transform: 'translateX(-50%)',
                  }}
                >
                  <div className='flex items-center gap-1.5 rounded-lg border bg-background/90 px-3 py-1.5 shadow-sm'>
                    <span className='font-mono text-xs font-black tracking-wide text-foreground'>
                      {participant.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Cuerpo del Diagrama de Secuencia con Scroll Autónomo y Barras Visibles */}
        <div
          ref={scrollContainerRef}
          className='relative flex-1 min-h-0 overflow-x-auto overflow-y-scroll p-4 select-none'
          style={{
            scrollbarWidth: 'thin',
          }}
        >
          <svg
            role='img'
            aria-label='Diagrama de secuencia de la traza'
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            className='block'
          >
            <defs>
              <marker
                id='trace-arrow'
                markerWidth='8'
                markerHeight='8'
                refX='7'
                refY='4'
                orient='auto'
              >
                <path d='M0,0 L8,4 L0,8 Z' fill='var(--primary)' />
              </marker>
              <marker
                id='trace-arrow-failure'
                markerWidth='8'
                markerHeight='8'
                refX='7'
                refY='4'
                orient='auto'
              >
                <path d='M0,0 L8,4 L0,8 Z' fill='#ef4444' />
              </marker>
            </defs>

            {/* Líneas de Vida de cada Función de Red */}
            {participantList.map((participant, index) => {
              const x = (index + 0.5) * PARTICIPANT_WIDTH * zoomLevel
              return (
                <line
                  key={`lifeline-${participant.id}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={height}
                  className='stroke-border/70'
                  strokeDasharray='4 5'
                  strokeWidth={1.5}
                />
              )
            })}

            {/* Mensajes y Flechas de la Secuencia */}
            {filteredEvents.map((event, index) => {
              const sourceId = eventEndpointId(event.source, event.source_nf)
              const targetId = eventEndpointId(event.target, event.target_nf)
              const sourceX = xFor(sourceId)
              const targetX = xFor(targetId)
              const y = index * eventHeight + 35
              const inferred = event.evidence_type === 'correlated'
              const failure = event.status === 'failure'
              const selected = selectedEventId === event.id
              const colorClass = failure
                ? 'stroke-red-500'
                : selected
                  ? 'stroke-sky-500'
                  : 'stroke-primary/70'
              const textClass = failure
                ? 'fill-red-500'
                : selected
                  ? 'fill-sky-500 font-bold'
                  : 'fill-foreground'
              const sameParticipant = Math.abs(sourceX - targetX) < 1

              return (
                <g
                  key={event.id}
                  role='button'
                  tabIndex={0}
                  className='cursor-pointer group outline-none'
                  onClick={() => onSelectEvent?.(event)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelectEvent?.(event)
                  }}
                >
                  <rect
                    x={8}
                    y={y - eventHeight / 2 + 6}
                    width={width - 16}
                    height={eventHeight - 10}
                    rx={6}
                    className={cn(
                      'transition-colors',
                      selected
                        ? 'fill-primary/10 stroke-primary/30'
                        : 'fill-transparent group-hover:fill-muted/30'
                    )}
                  />

                  {sameParticipant ? (
                    <path
                      d={`M ${sourceX} ${y} C ${sourceX + 45} ${y}, ${sourceX + 45} ${y + 20}, ${sourceX} ${y + 20}`}
                      fill='none'
                      className={colorClass}
                      strokeWidth={selected ? 2.5 : 1.5}
                      strokeDasharray={inferred ? '5 4' : undefined}
                      markerEnd={`url(#${failure ? 'trace-arrow-failure' : 'trace-arrow'})`}
                    />
                  ) : (
                    <line
                      x1={sourceX}
                      y1={y}
                      x2={targetX + (targetX > sourceX ? -8 : 8)}
                      y2={y}
                      className={colorClass}
                      strokeWidth={selected ? 2.5 : 1.5}
                      strokeDasharray={inferred ? '5 4' : undefined}
                      markerEnd={`url(#${failure ? 'trace-arrow-failure' : 'trace-arrow'})`}
                    />
                  )}

                  <text
                    x={(sourceX + targetX) / 2}
                    y={y - 6}
                    textAnchor='middle'
                    className={cn('font-mono text-[11px]', textClass)}
                  >
                    {truncate(event.message, Math.floor(42 * zoomLevel))}
                    <title>{event.message}</title>
                  </text>

                  <text
                    x={(sourceX + targetX) / 2}
                    y={sameParticipant ? y + 32 : y + 14}
                    textAnchor='middle'
                    className='fill-muted-foreground font-mono text-[9px] opacity-80'
                  >
                    {[
                      event.interface_3gpp ?? event.interface,
                      event.protocol?.toUpperCase(),
                      relativeTime(event),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Barra Flotante de Navegación Rápida con Flechas Arriba y Abajo */}
        {filteredEvents.length > 6 && (
          <div className='absolute bottom-4 right-5 z-40 flex items-center gap-1 rounded-full border bg-card/95 px-2.5 py-1 shadow-xl backdrop-blur-md'>
            <span className='text-[11px] font-medium text-muted-foreground mr-1'>
              {filteredEvents.length} eventos
            </span>
            <Button
              variant='ghost'
              size='icon'
              className='h-7 w-7 rounded-full hover:bg-sky-500/10 hover:text-sky-500'
              title='Subir al inicio (Primer evento)'
              onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              <ArrowUp className='h-3.5 w-3.5' />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='h-7 w-7 rounded-full hover:bg-sky-500/10 hover:text-sky-500'
              title='Subir un bloque (-400px)'
              onClick={() => scrollContainerRef.current?.scrollBy({ top: -400, behavior: 'smooth' })}
            >
              <ChevronUp className='h-3.5 w-3.5' />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='h-7 w-7 rounded-full hover:bg-sky-500/10 hover:text-sky-500'
              title='Bajar un bloque (+400px)'
              onClick={() => scrollContainerRef.current?.scrollBy({ top: 400, behavior: 'smooth' })}
            >
              <ChevronDown className='h-3.5 w-3.5 text-sky-500' />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              className='h-7 w-7 rounded-full hover:bg-sky-500/10 hover:text-sky-500'
              title='Bajar al final (Pings y Datos)'
              onClick={() => scrollContainerRef.current?.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' })}
            >
              <ArrowDown className='h-3.5 w-3.5' />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function buildParticipants(
  events: TraceEvent[],
  declared?: Array<TraceParticipant | string>
) {
  const labels = new Map<string, string>()
  for (const item of declared ?? []) {
    if (typeof item === 'string') {
      labels.set(normalizeParticipant(item), displayParticipant(item))
      continue
    }
    labels.set(
      normalizeParticipant(item.id ?? item.label),
      item.label ?? displayParticipant(item.id)
    )
  }
  for (const event of events) {
    const source = eventEndpointId(event.source, event.source_nf)
    const target = eventEndpointId(event.target, event.target_nf)
    labels.set(
      normalizeParticipant(source),
      endpointLabel(event.source, event.source_nf)
    )
    labels.set(
      normalizeParticipant(target),
      endpointLabel(event.target, event.target_nf)
    )
  }
  labels.delete('unknown')
  return [...labels.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort(
      (a, b) =>
        participantRank(a.id) - participantRank(b.id) ||
        a.id.localeCompare(b.id)
    )
}

function normalizeParticipant(value: string) {
  return value
    .toLowerCase()
    .replace(/gnodeb/g, 'gnb')
    .replace(/enodeb/g, 'enb')
    .replace(/[^a-z0-9-]/g, '')
}

function endpointLabel(endpoint: TraceEvent['source'], fallback?: string) {
  if (typeof endpoint === 'object')
    return (
      endpoint.label ??
      displayParticipant(endpoint.nf ?? endpoint.id ?? fallback ?? 'NF')
    )
  return displayParticipant(endpoint ?? fallback ?? 'NF')
}

function displayParticipant(value: string) {
  const normalized = normalizeParticipant(value)
  const labels: Record<string, string> = {
    ue: 'UE',
    gnb: 'gNodeB',
    enb: 'eNodeB',
    dn: 'Data Network',
  }
  return labels[normalized] ?? value.toUpperCase()
}

function participantRank(id: string) {
  const index = CANONICAL_ORDER.indexOf(id)
  return index === -1 ? CANONICAL_ORDER.length : index
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

function relativeTime(event: TraceEvent) {
  if (event.relative_ms == null) return `#${event.ordinal ?? '—'}`
  return event.relative_ms < 1000
    ? `+${event.relative_ms.toFixed(0)} ms`
    : `+${(event.relative_ms / 1000).toFixed(3)} s`
}
