import { useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Filter,
  Layers,
  RotateCcw,
  Search,
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

const PARTICIPANT_WIDTH = 156
const TIME_GUTTER_WIDTH = 184
const HEADER_HEIGHT = 48
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
  'scp',
  'nssf',
  'pcf',
  'bsf',
  'smf',
  'sgwc',
  'upf',
  'sgwu',
  'dn',
]
type FilterMode = 'telco' | 'all'
type Density = 'normal' | 'compact'

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
  const [filterMode, setFilterMode] = useState<FilterMode>('telco')
  const [searchTerm, setSearchTerm] = useState('')
  const [density, setDensity] = useState<Density>('normal')
  const [procedureFilter, setProcedureFilter] = useState('all')
  const [zoomLevel, setZoomLevel] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const participantList = useMemo(
    () => buildParticipants(events, participants),
    [events, participants]
  )
  const filteredEvents = useMemo(() => {
    let result = [...events].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    if (filterMode === 'telco')
      result = result.filter((event) => !isNoise(event))
    if (procedureFilter !== 'all')
      result = result.filter((event) =>
        matchesProcedure(event, procedureFilter)
      )
    const query = searchTerm.trim().toLowerCase()
    if (query) {
      result = result.filter((event) =>
        [
          event.message,
          event.protocol,
          event.procedure,
          event.interface_3gpp,
          event.interface,
          event.source_nf,
          event.target_nf,
        ].some((value) => value?.toLowerCase().includes(query))
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

  const rowHeight = density === 'normal' ? 44 : 34
  const diagramWidth = Math.max(
    participantList.length * PARTICIPANT_WIDTH * zoomLevel,
    780
  )
  const bodyHeight = Math.max(filteredEvents.length * rowHeight, 250)
  const totalWidth = TIME_GUTTER_WIDTH + diagramWidth
  const xFor = (id: string) => {
    const index = participantList.findIndex(
      (item) => item.id === normalizeParticipant(id)
    )
    return (Math.max(index, 0) + 0.5) * PARTICIPANT_WIDTH * zoomLevel
  }

  return (
    <div className='space-y-3'>
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
              <Filter className='h-3 w-3 text-sky-500' /> Señalización 3GPP
            </Button>
            <Button
              variant={filterMode === 'all' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-7 gap-1 px-2.5 text-xs font-semibold'
              onClick={() => setFilterMode('all')}
            >
              <Layers className='h-3 w-3' /> Todos ({events.length})
            </Button>
          </div>
          <div className='hidden items-center gap-1 border-l pl-2 xl:flex'>
            {(
              [
                ['all', 'Todo'],
                ['registration', 'Registro'],
                ['authentication', '5G-AKA'],
                ['pdu-session', 'Sesión PDU'],
                ['user-plane', 'Datos'],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                variant={procedureFilter === id ? 'secondary' : 'ghost'}
                size='sm'
                className='h-7 px-2 text-[11px]'
                onClick={() => setProcedureFilter(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className='relative w-52 sm:w-64'>
            <Search className='absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder='Mensaje, protocolo, interfaz…'
              className='h-7 pl-8 text-xs'
            />
          </div>
        </div>
        <div className='flex items-center gap-1.5'>
          <Badge variant='outline' className='font-mono text-[10px]'>
            {filteredEvents.length} eventos
          </Badge>
          <Button
            variant='outline'
            size='icon'
            className='h-7 w-7'
            title='Primer evento'
            onClick={() =>
              scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            }
          >
            <ArrowUp className='h-3 w-3' />
          </Button>
          <Button
            variant='outline'
            size='icon'
            className='h-7 w-7'
            title='Último evento'
            onClick={() =>
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: 'smooth',
              })
            }
          >
            <ArrowDown className='h-3 w-3' />
          </Button>
          <Button
            variant='outline'
            size='icon'
            className='h-7 w-7'
            disabled={zoomLevel <= 0.7}
            title='Reducir zoom'
            onClick={() => setZoomLevel((value) => Math.max(0.7, value - 0.15))}
          >
            <ZoomOut className='h-3 w-3' />
          </Button>
          <Button
            variant='outline'
            size='icon'
            className='h-7 w-7'
            disabled={zoomLevel >= 1.5}
            title='Aumentar zoom'
            onClick={() => setZoomLevel((value) => Math.min(1.5, value + 0.15))}
          >
            <ZoomIn className='h-3 w-3' />
          </Button>
          <Button
            variant={density === 'compact' ? 'secondary' : 'outline'}
            size='sm'
            className='h-7 px-2 text-[11px]'
            onClick={() =>
              setDensity(density === 'normal' ? 'compact' : 'normal')
            }
          >
            {density === 'normal' ? 'Compacto' : 'Normal'}
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='h-7 w-7'
            title='Restablecer'
            onClick={() => {
              setZoomLevel(1)
              setDensity('normal')
              setSearchTerm('')
              setProcedureFilter('all')
            }}
          >
            <RotateCcw className='h-3 w-3' />
          </Button>
        </div>
      </div>

      <div className='overflow-hidden rounded-xl border bg-card shadow-inner'>
        <div
          ref={scrollRef}
          className='relative h-[620px] max-h-[calc(100vh-230px)] min-h-[420px] overflow-auto'
          style={{ scrollbarWidth: 'thin' }}
        >
          <div
            className='relative'
            style={{ width: totalWidth, minHeight: HEADER_HEIGHT + bodyHeight }}
          >
            <div
              className='sticky top-0 z-40 flex border-b bg-card/95 shadow-sm backdrop-blur'
              style={{ width: totalWidth, height: HEADER_HEIGHT }}
            >
              <div
                className='sticky left-0 z-50 flex shrink-0 items-center justify-between border-r bg-card px-3 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase'
                style={{ width: TIME_GUTTER_WIDTH }}
              >
                <span>Timestamp</span>
                <span>Δ</span>
              </div>
              <div
                className='relative shrink-0'
                style={{ width: diagramWidth }}
              >
                {participantList.map((participant, index) => {
                  const x = (index + 0.5) * PARTICIPANT_WIDTH * zoomLevel
                  return (
                    <div
                      key={participant.id}
                      className='absolute top-2 flex -translate-x-1/2 items-center gap-1.5 rounded-md border border-slate-500/50 bg-background px-3 py-1.5 shadow-sm'
                      style={{ left: x, maxWidth: PARTICIPANT_WIDTH - 14 }}
                      title={participant.label}
                    >
                      <span className='size-1.5 shrink-0 rounded-full bg-sky-500' />
                      <span className='truncate font-mono text-xs font-bold tracking-wide'>
                        {participant.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className='relative flex' style={{ height: bodyHeight }}>
              {!filteredEvents.length && (
                <div
                  className='absolute top-20 z-20 flex justify-center px-6'
                  style={{ left: TIME_GUTTER_WIDTH, width: diagramWidth }}
                >
                  <div className='max-w-md rounded-lg border border-amber-500/30 bg-card/95 px-4 py-3 text-center shadow-sm'>
                    <p className='text-sm font-semibold'>
                      No se observaron eventos de{' '}
                      {procedureLabel(procedureFilter)}
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      Esto no representa un resultado exitoso: el procedimiento
                      no fue ejecutado o no estuvo visible en esta captura.
                    </p>
                  </div>
                </div>
              )}
              <div
                className='sticky left-0 z-30 shrink-0 border-r bg-card'
                style={{ width: TIME_GUTTER_WIDTH, height: bodyHeight }}
              >
                {filteredEvents.map((event, index) => (
                  <button
                    key={`time-${event.id}`}
                    type='button'
                    onClick={() => onSelectEvent?.(event)}
                    className={cn(
                      'absolute left-0 grid w-full grid-cols-[1fr_auto] items-center gap-2 border-b border-dotted px-3 text-left font-mono transition-colors hover:bg-muted/70',
                      selectedEventId === event.id &&
                        'bg-primary/10 text-primary'
                    )}
                    style={{ top: index * rowHeight, height: rowHeight }}
                  >
                    <span className='truncate text-[10px]'>
                      {absoluteTime(event.timestamp)}
                    </span>
                    <span className='text-[9px] text-muted-foreground'>
                      {relativeTime(event)}
                    </span>
                  </button>
                ))}
              </div>

              <svg
                role='img'
                aria-label='Flujo de señalización extremo a extremo'
                width={diagramWidth}
                height={bodyHeight}
                viewBox={`0 0 ${diagramWidth} ${bodyHeight}`}
                className='block shrink-0'
              >
                {filteredEvents.map((event, index) => (
                  <rect
                    key={`row-${event.id}`}
                    pointerEvents='none'
                    x={0}
                    y={index * rowHeight}
                    width={diagramWidth}
                    height={rowHeight}
                    fill={
                      selectedEventId === event.id
                        ? 'color-mix(in oklab, var(--primary) 10%, transparent)'
                        : index % 2
                          ? 'color-mix(in oklab, var(--muted) 12%, transparent)'
                          : 'transparent'
                    }
                    stroke='color-mix(in oklab, var(--border) 70%, transparent)'
                    strokeDasharray='2 4'
                    strokeWidth={0.7}
                  />
                ))}
                {participantList.map((participant, index) => {
                  const x = (index + 0.5) * PARTICIPANT_WIDTH * zoomLevel
                  return (
                    <line
                      key={`lifeline-${participant.id}`}
                      pointerEvents='none'
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={bodyHeight}
                      stroke='color-mix(in oklab, var(--muted-foreground) 42%, transparent)'
                      strokeWidth={2}
                    />
                  )
                })}
                {filteredEvents.map((event, index) => {
                  const sourceX = xFor(
                    eventEndpointId(event.source, event.source_nf)
                  )
                  const targetX = xFor(
                    eventEndpointId(event.target, event.target_nf)
                  )
                  const y = index * rowHeight + rowHeight / 2 + 5
                  const selected = selectedEventId === event.id
                  const inferred = event.evidence_type === 'correlated'
                  const color = eventColor(event)
                  const sameParticipant = Math.abs(sourceX - targetX) < 1
                  const direction = targetX >= sourceX ? 1 : -1
                  const endX = targetX - direction * 9
                  const labelWidth = Math.min(
                    Math.max(event.message.length * 6.2 + 18, 96),
                    Math.max(Math.abs(targetX - sourceX) - 12, 116)
                  )
                  const labelX = sameParticipant
                    ? sourceX + 42
                    : (sourceX + targetX) / 2
                  return (
                    <g
                      key={event.id}
                      role='button'
                      tabIndex={0}
                      className='cursor-pointer outline-none'
                      onClick={() => onSelectEvent?.(event)}
                      onKeyDown={(keyEvent) => {
                        if (keyEvent.key === 'Enter' || keyEvent.key === ' ')
                          onSelectEvent?.(event)
                      }}
                    >
                      {sameParticipant ? (
                        <path
                          d={`M ${sourceX} ${y} C ${sourceX + 55} ${y}, ${sourceX + 55} ${y + 20}, ${sourceX} ${y + 20}`}
                          fill='none'
                          stroke={color}
                          strokeWidth={selected ? 3 : 2}
                          strokeDasharray={inferred ? '6 4' : undefined}
                        />
                      ) : (
                        <line
                          x1={sourceX + direction * 7}
                          y1={y}
                          x2={endX}
                          y2={y}
                          stroke={color}
                          strokeWidth={selected ? 3 : 2}
                          strokeDasharray={inferred ? '6 4' : undefined}
                        />
                      )}
                      <polygon
                        points={arrowPoints(
                          sameParticipant ? sourceX : targetX,
                          sameParticipant ? y + 20 : y,
                          sameParticipant ? -1 : direction
                        )}
                        fill={color}
                      />
                      <rect
                        x={labelX - labelWidth / 2}
                        y={index * rowHeight + 4}
                        width={labelWidth}
                        height={17}
                        rx={3}
                        fill={selected ? color : 'var(--card)'}
                        stroke={color}
                        strokeWidth={selected ? 1.5 : 0.8}
                      />
                      <text
                        x={labelX}
                        y={index * rowHeight + 16}
                        textAnchor='middle'
                        fill={selected ? '#ffffff' : color}
                        className='font-mono text-[10px] font-semibold'
                      >
                        {formatPillMessage(
                          event.message,
                          Math.max(12, Math.floor(labelWidth / 6.4)),
                          Boolean(event.interpretation_policy)
                        )}
                        <title>{event.message}</title>
                      </text>
                      <text
                        x={Math.min(sourceX, targetX) + 5}
                        y={index * rowHeight + rowHeight - 5}
                        fill='var(--muted-foreground)'
                        className='font-mono text-[8px]'
                      >
                        {(() => {
                          const proto = event.protocol?.toUpperCase()
                          const iface = event.interface_3gpp ?? event.interface
                          const parts = [proto, iface].filter(
                            Boolean
                          ) as string[]
                          // Avoid duplicating when protocol already contains the interface name
                          if (
                            parts.length === 2 &&
                            proto &&
                            iface &&
                            proto.toLowerCase().includes(iface.toLowerCase())
                          )
                            return proto
                          return parts.join(' · ')
                        })()}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/15 px-3 py-2 text-[10px] text-muted-foreground'>
        <span className='font-semibold tracking-wide uppercase'>
          Protocolos
        </span>
        {['NAS', 'NGAP', 'HTTP2', 'PFCP', 'GTP-U', 'ICMP', 'NR-Uu'].map(
          (protocol) => (
            <span key={protocol} className='flex items-center gap-1.5'>
              <span
                className='h-0.5 w-5 rounded-full'
                style={{ backgroundColor: protocolColor(protocol) }}
              />
              {protocol}
            </span>
          )
        )}
        <span className='ml-auto'>
          Línea discontinua = evento correlacionado
        </span>
      </div>
    </div>
  )
}

function isNoise(event: TraceEvent) {
  // Keep R16 protocol evidence, including NRF management and HTTP responses.
  if (event.interpretation_policy) return event.interface_3gpp === 'Transport'
  const message = (event.message || '').toLowerCase()
  const protocol = (event.protocol || '').toLowerCase()
  if (
    [
      'heartbeat',
      'nnrf_nfmanagement',
      '204 no content',
      'window_update',
      'settings',
      'magic',
      'data[',
      'headers[',
    ].some((term) => message.includes(term))
  )
    return true
  const semantic = [
    'ngap',
    'nas',
    'pfcp',
    'gtp',
    'icmp',
    'http',
    'sbi',
    'registration',
    'authentication',
    'security',
    'session',
    'release',
    'pdu',
  ].some((term) => protocol.includes(term) || message.includes(term))
  return !semantic && protocol === 'tcp'
}

function matchesProcedure(event: TraceEvent, procedure: string) {
  if (event.interpretation_policy) {
    if (procedure === 'registration') {
      return (
        event.procedure === 'registration' ||
        event.procedure === 'authentication'
      )
    }
    return event.procedure === procedure
  }
  const message = event.message.toLowerCase()
  if (event.procedure === procedure) return true
  if (procedure === 'registration')
    return (
      message.includes('registration') ||
      message.includes('attach') ||
      message.includes('authenticat') ||
      message.includes('security')
    )
  if (procedure === 'authentication')
    return message.includes('authenticat') || message.includes('security')
  if (procedure === 'pdu-session')
    return (
      message.includes('pdu') ||
      message.includes('pfcp') ||
      message.includes('session')
    )
  if (procedure === 'user-plane')
    return (
      message.includes('ping') ||
      message.includes('icmp') ||
      message.includes('gtp-u')
    )
  return true
}

function procedureLabel(value: string) {
  return (
    {
      all: 'la selección actual',
      registration: 'Registro',
      authentication: '5G-AKA',
      'pdu-session': 'Sesión PDU',
      'user-plane': 'Datos',
    }[value] ?? value
  )
}

function eventColor(event: TraceEvent) {
  return event.status === 'failure'
    ? '#ef4444'
    : protocolColor(event.protocol ?? event.interface_3gpp ?? '')
}
function protocolColor(value: string) {
  const protocol = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (protocol.includes('nas')) return '#0ea5e9'
  if (protocol.includes('ngap') || protocol.includes('s1ap')) return '#14b8a6'
  if (protocol.includes('http') || protocol.includes('sbi')) return '#8b5cf6'
  if (protocol.includes('pfcp') || protocol.includes('n4')) return '#f59e0b'
  if (protocol.includes('gtpu') || protocol.includes('n3')) return '#22c55e'
  if (protocol.includes('gtpc')) return '#eab308'
  if (protocol.includes('icmp')) return '#06b6d4'
  if (protocol.includes('sctp')) return '#64748b'
  if (protocol.includes('nruu') || protocol.includes('radio')) return '#ec4899'
  return '#7c3aed'
}
function arrowPoints(x: number, y: number, direction: number) {
  return direction > 0
    ? `${x},${y} ${x - 10},${y - 5} ${x - 10},${y + 5}`
    : `${x},${y} ${x + 10},${y - 5} ${x + 10},${y + 5}`
}

function buildParticipants(
  events: TraceEvent[],
  declared?: Array<TraceParticipant | string>
) {
  const labels = new Map<string, string>()
  for (const item of declared ?? []) {
    if (typeof item === 'string')
      labels.set(normalizeParticipant(item), displayParticipant(item))
    else
      labels.set(
        normalizeParticipant(item.id ?? item.label ?? 'NF'),
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
  return typeof endpoint === 'object'
    ? (endpoint.label ??
        displayParticipant(endpoint.nf ?? endpoint.id ?? fallback ?? 'NF'))
    : displayParticipant(endpoint ?? fallback ?? 'NF')
}
function displayParticipant(value: string) {
  const normalized = normalizeParticipant(value)
  return (
    (
      { ue: 'UE', gnb: 'gNodeB', enb: 'eNodeB', dn: 'Data Network' } as Record<
        string,
        string
      >
    )[normalized] ?? value.toUpperCase()
  )
}
function participantRank(id: string) {
  const index = CANONICAL_ORDER.indexOf(id)
  return index === -1 ? CANONICAL_ORDER.length : index
}
function formatPillMessage(value: string, max: number, literal = false) {
  if (literal) return truncate(value, max)
  const text = value
    .replace(/N2 Initial UE Message \(Registration Request\)/gi, 'N2 Initial UE (Reg Req)')
    .replace(/N2 Initial Context Setup Request \(Registration Accept\)/gi, 'N2 Init Context (Reg Accept)')
    .replace(/N2 Initial Context Setup Response/gi, 'N2 Init Context Resp')
    .replace(/NAS Registration Complete \+ PDU Session Establishment Request \(PSI: 1 & 2\)/gi, 'NAS Reg OK + PDU Req [PSI 1,2]')
    .replace(/NAS Registration Complete/gi, 'NAS Reg Complete')
    .replace(/NAS Configuration Update Command/gi, 'NAS Config Update Cmd')
    .replace(/NAS Authentication Request \(RAND, AUTN, ngKSI\)/gi, 'NAS Auth Req (RAND, AUTN)')
    .replace(/NAS Authentication Response \(RES\*\)/gi, 'NAS Auth Resp (RES*)')
    .replace(/NAS Security Mode Command/gi, 'NAS Security Mode Cmd')
    .replace(/NAS Security Mode Complete/gi, 'NAS Security Mode OK')
    .replace(/Nausf_UEAuthentication_Authenticate Request/gi, 'Nausf_Auth Req')
    .replace(/Nausf_UEAuthentication_Authenticate Response/gi, 'Nausf_Auth Resp')
    .replace(/Nudm_UEAuthentication_ResultConfirmation \(auth-events\) Request/gi, 'Nudm_Auth ResultConfirm')
    .replace(/Nudm_UEAuthentication Response/gi, 'Nudm_Auth Resp')
    .replace(/Nudr_DM_Query Request/gi, 'Nudr_DM Query Req')
    .replace(/Nudr_DM_Query Response/gi, 'Nudr_DM Query Resp')
    .replace(/Nudr_DM_Update/gi, 'Nudr_DM Update')
    .replace(/Nudr_DM Response/gi, 'Nudr_DM Resp')
    .replace(/Nudm_UECM_Registration/gi, 'Nudm_UECM Reg')
    .replace(/Nudm_SDM_Get Request/gi, 'Nudm_SDM Get Req')
    .replace(/Nudm_SDM_Get Response/gi, 'Nudm_SDM Get Resp')
    .replace(/Nudm_SDM_Subscribe Request/gi, 'Nudm_SDM Sub Req')
    .replace(/Nudm_SDM_Subscribe Response/gi, 'Nudm_SDM Sub Resp')
    .replace(/Npcf_AMPolicyControl_Create Request/gi, 'Npcf_AMPolicy Create Req')
    .replace(/Npcf_AMPolicyControl_Create Response/gi, 'Npcf_AMPolicy Create Resp')
    .replace(/Npcf_SMPolicyControl_Create Request/gi, 'Npcf_SMPolicy Create Req')
    .replace(/Npcf_SMPolicyControl_Create Response/gi, 'Npcf_SMPolicy Create Resp')
    .replace(/Nbsf_Management_Register Request/gi, 'Nbsf_Reg Req')
    .replace(/Nbsf_Management_Register Response/gi, 'Nbsf_Reg Resp')
    .replace(/Nsmf_PDUSession_CreateSMContext Request/gi, 'Nsmf_CreateSMContext Req')
    .replace(/Nsmf_PDUSession_CreateSMContext Response/gi, 'Nsmf_CreateSMContext Resp')
    .replace(/Namf_Communication_N1N2MessageTransfer/gi, 'Namf_N1N2Transfer')
    .replace(/N2 PDU Session Resource Setup Request \(PDU Session Establishment Accept\)/gi, 'N2 PDU Setup Req (Accept)')
    .replace(/N2 PDU Session Resource Setup Response/gi, 'N2 PDU Setup Resp')
    .replace(/N4 Session Establishment Request/gi, 'N4 Estab Req')
    .replace(/N4 Session Establishment Response/gi, 'N4 Estab Resp')
    .replace(/N4 Session Modification Request/gi, 'N4 Mod Req')
    .replace(/N4 Session Modification Response/gi, 'N4 Mod Resp')
    .replace(/\[UPF-01 \/ Internet\]/gi, '[Internet]')
    .replace(/\[UPF-02 \/ Corporate\]/gi, '[Corp]')
    .replace(/PDUSessionResourceSetupRequest/gi, 'PDU Setup Req')
    .replace(/PDUSessionResourceSetupResponse/gi, 'PDU Setup Resp')
    .replace(/PFCP Session Establishment Request/gi, 'PFCP Estab Req')
    .replace(/PFCP Session Establishment Response/gi, 'PFCP Estab Resp')
    .replace(/PFCP Session Modification Request/gi, 'PFCP Mod Req')
    .replace(/PFCP Session Modification Response/gi, 'PFCP Mod Resp')
    .replace(/PDU Session Establishment Accept/gi, 'PDU Estab Accept')
    .replace(/PDU Session Establishment Request/gi, 'PDU Estab Req')
    .replace(/RRC Reconfiguration Complete/gi, 'RRC Reconfig OK')
    .replace(/Npcf_SMPolicyControl \(Create Policy\)/gi, 'Npcf_SMPolicy Create')
    .replace(/Npcf_SMPolicyControl \(SM Policy\)/gi, 'Npcf_SMPolicy')
    .replace(/Nsmf_PDUSession Create Context/gi, 'Nsmf_PDU Create Context')
    .replace(/Nsmf_PDUSession Modify Context/gi, 'Nsmf_PDU Modify Context')
    .replace(/\(Corporate \/ UPF-02\)/gi, '[Corp]')
    .replace(/\(Internet \/ UPF-01\)/gi, '[Internet]')
    .replace(/\(PSI: 1 & 2\)/gi, '[PSI 1,2]')
    .replace(/Security Mode Command/gi, 'Security Mode Cmd')
    .replace(/Security Mode Complete/gi, 'Security Mode OK')
    .replace(/Authentication Request/gi, 'Auth Request')
    .replace(/Authentication Response/gi, 'Auth Response')
    .replace(/Nausf_UEAuthentication/gi, 'Nausf_Auth')
    .replace(/Nudm_UEAuthentication/gi, 'Nudm_Auth')

  return truncate(text, max)
}

function truncate(value: string, max: number) {
  return value.length <= max
    ? value
    : `${value.slice(0, Math.max(max - 1, 1))}…`
}
function relativeTime(event: TraceEvent) {
  if (event.relative_ms == null) return `#${event.ordinal ?? '—'}`
  return event.relative_ms < 1000
    ? `+${event.relative_ms.toFixed(0)}ms`
    : `+${(event.relative_ms / 1000).toFixed(3)}s`
}
function absoluteTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const base = date.toLocaleTimeString([], { hour12: false })
  return `${base}.${String(date.getMilliseconds()).padStart(3, '0')}`
}
