import { useEffect, useRef } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Database, Radio, Router, Server, Smartphone } from 'lucide-react'
import type { ComponentStatus, RuntimeSnapshot } from '@/lib/api'
import { alarmBelongsToComponent } from './topology-alarm'

export type TopologyView = 'physical' | 'telco'
export type TopologySelection =
  | { type: 'host'; id: string }
  | { type: 'component'; id: string }

export type NodeAlarmItem = {
  component?: string
  node_id?: string
  severity?: string
}

// Layout arquitectural 3GPP compacto y balanceado
const telcoPositions5G: Record<string, { x: number; y: number }> = {
  // Fila 1: Microservicios Core (Auth a la izquierda, Políticas a la derecha)
  mongodb: { x: 60, y: 40 },
  udr: { x: 230, y: 40 },
  udm: { x: 400, y: 40 },
  ausf: { x: 570, y: 40 },

  pcf: { x: 740, y: 40 },
  nssf: { x: 910, y: 40 },
  nrf: { x: 1080, y: 40 },
  scp: { x: 1250, y: 40 },

  // Fila 2: Plano de Control (AMF sobre gNodeB, SMF sobre UPF)
  amf: { x: 400, y: 220 },
  smf: { x: 740, y: 220 },

  // Fila 3: Plano de Usuario (Izquierda a Derecha: UE -> gNodeB -> UPF)
  ue: { x: 60, y: 390 },
  gnb: { x: 400, y: 390 },
  upf: { x: 740, y: 390 },
}

const telcoPositions4G: Record<string, { x: number; y: number }> = {
  mongodb: { x: 60, y: 40 },
  hss: { x: 380, y: 40 },
  pcrf: { x: 720, y: 40 },

  mme: { x: 380, y: 210 },
  sgwc: { x: 720, y: 210 },
  smf: { x: 1040, y: 210 },

  ue: { x: 60, y: 380 },
  enb: { x: 380, y: 380 },
  sgwu: { x: 720, y: 380 },
  upf: { x: 1040, y: 280 },
  upf2: { x: 1040, y: 440 },
}

// Mapeo unívoco y sobrio de interfaces 3GPP
const specificTelcoEdges: Record<string, { label: string; stroke: string }> = {
  // 5G SA
  'ue-gnb': { label: 'NR-Uu (Radio)', stroke: 'solid' },
  'gnb-amf': { label: 'N2 (NGAP)', stroke: 'solid' },
  'gnb-upf': { label: 'N3 (GTP-U)', stroke: 'solid' },
  'amf-smf': { label: 'N11 (SBI)', stroke: 'dashed' },
  'smf-upf': { label: 'N4 (PFCP)', stroke: 'solid' },
  'mongodb-udr': { label: 'BSON', stroke: 'dashed' },
  'udr-udm': { label: 'Nudr', stroke: 'dashed' },
  'udm-ausf': { label: 'Nausf', stroke: 'dashed' },
  'ausf-amf': { label: 'Namf / N12', stroke: 'dashed' },
  'pcf-smf': { label: 'Npcf', stroke: 'dashed' },
  'nssf-amf': { label: 'Nnssf', stroke: 'dashed' },
  'nrf-scp': { label: 'SBI', stroke: 'dashed' },

  // 4G EPC
  'ue-enb': { label: 'LTE-Uu', stroke: 'solid' },
  'enb-mme': { label: 'S1-MME', stroke: 'solid' },
  'enb-sgwu': { label: 'S1-U (GTP-U)', stroke: 'solid' },
  'hss-mme': { label: 'S6a', stroke: 'solid' },
  'mme-sgwc': { label: 'S11', stroke: 'solid' },
  'sgwc-sgwu': { label: 'S5/S8 Control', stroke: 'solid' },
  'sgwc-smf': { label: 'S5/S8-C', stroke: 'solid' },
  'sgwu-upf': { label: 'S5/S8-U', stroke: 'solid' },
  'pcrf-smf': { label: 'Gx', stroke: 'solid' },
  'mongodb-hss': { label: 'BSON', stroke: 'dashed' },
}

function getComponentIcon(id: string) {
  if (id === 'ue') {
    return <Smartphone className='mb-1 h-6 w-6 text-sky-500' />
  }
  if (id === 'gnb' || id === 'enb') {
    return <Radio className='mb-1 h-6 w-6 text-indigo-500' />
  }
  if (id === 'upf' || id === 'upf2' || id === 'sgwu') {
    return <Router className='mb-1 h-6 w-6 text-emerald-500' />
  }
  if (id === 'mongodb') {
    return <Database className='mb-1 h-6 w-6 text-amber-500' />
  }
  return <Server className='mb-1 h-5 w-5 text-purple-400/80' />
}

function severityLabel(severity?: string) {
  if (severity === 'critical') return 'Crítica'
  if (severity === 'major') return 'Mayor'
  if (severity === 'minor') return 'Menor'
  if (severity === 'warning') return 'Aviso'
  return 'Incidencia'
}

// Componente de nodo limpio, sobrio y profesional con icono nativo de telecomunicaciones
function TelcoNode({ data }: NodeProps) {
  const isRunning = data.status === 'running'
  const id = String(data.id ?? data.label).toLowerCase()
  const kind = String(data.kind ?? '')
  const icon = getComponentIcon(id)
  const alarmSeverity = data.alarmSeverity as string | undefined
  const alarmCount = Number(data.alarmCount ?? 0)

  let containerStyle =
    'bg-card border-border hover:border-primary text-card-foreground hover:shadow-md'
  let ledStyle = 'bg-emerald-500 shadow-[0_0_6px_#10b981]'

  if (!isRunning) {
    containerStyle =
      'bg-destructive/8 border-destructive text-card-foreground shadow-md'
    ledStyle = 'bg-red-500 shadow-[0_0_8px_#ef4444]'
  } else if (alarmSeverity === 'critical') {
    containerStyle =
      'bg-destructive/8 border-red-500 ring-1 ring-red-500/30 text-card-foreground shadow-md'
    ledStyle = 'bg-red-500 shadow-[0_0_8px_#ef4444]'
  } else if (alarmSeverity === 'major') {
    containerStyle =
      'bg-amber-500/8 border-amber-500 ring-1 ring-amber-500/25 text-card-foreground shadow-md'
    ledStyle = 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'
  } else if (alarmSeverity === 'minor' || alarmSeverity === 'warning') {
    containerStyle =
      'bg-yellow-500/5 border-yellow-500/80 text-card-foreground shadow-sm'
    ledStyle = 'bg-yellow-500 shadow-[0_0_6px_#eab308]'
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-2xl border-2 px-5 py-3.5 shadow-sm transition-all duration-200 select-none ${containerStyle}`}
      style={{ minWidth: 140, minHeight: 74 }}
    >
      {/* Handles para conexiones limpias */}
      {[Position.Top, Position.Bottom, Position.Left, Position.Right].flatMap(
        (position) =>
          (['source', 'target'] as const).map((type) => (
            <Handle
              key={`${type}-${position}`}
              id={`${type}-${position}`}
              type={type}
              position={position}
              className='!h-2.5 !w-2.5 !border-card !bg-primary/50'
            />
          ))
      )}

      {/* Status LED */}
      <span
        className={`absolute top-2.5 right-2.5 h-2.5 w-2.5 rounded-full ${ledStyle}`}
      />

      {/* Badge de alarma activa si está corriendo pero con incidente telco */}
      {(!isRunning || (alarmSeverity && alarmCount > 0)) && (
        <span
          className={`absolute -top-2.5 -left-1.5 flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider uppercase shadow-md ${
            !isRunning || alarmSeverity === 'critical'
              ? 'border-red-700 bg-red-600 text-white'
              : alarmSeverity === 'major'
                ? 'border-amber-600 bg-amber-500 text-white'
                : 'border-yellow-600 bg-yellow-500 text-black'
          }`}
        >
          <span className='size-1.5 rounded-full bg-white/90' />
          {!isRunning
            ? 'No disponible'
            : `${severityLabel(alarmSeverity)}${alarmCount > 1 ? ` (${alarmCount})` : ''}`}
        </span>
      )}

      {/* Icono temático del nodo (Celular para UE, Antena para gNodeB, etc.) */}
      {icon}

      {/* Gran Nombre de la NF */}
      <span className='font-mono text-base leading-tight font-black tracking-tight text-foreground'>
        {String(data.label)}
      </span>

      {/* Rol / Subtítulo discreto */}
      <span className='mt-0.5 text-[9px] font-bold tracking-widest text-muted-foreground uppercase opacity-80'>
        {kind}
      </span>
    </div>
  )
}

function HostNode({ data }: NodeProps) {
  const isHealthy = data.healthy !== false
  const ledStyle = isHealthy
    ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]'
    : 'bg-red-500 shadow-[0_0_6px_#ef4444]'

  const rawLabel = String(data.label || '')
  let shortTitle = rawLabel
  if (data.id === 'ue-vm' || rawLabel.includes('ue-01'))
    shortTitle = 'EMS-UE-01'
  else if (data.id === 'gnb-vm' || rawLabel.includes('gnb-01'))
    shortTitle = 'EMS-GNB-01'
  else if (data.id === 'core' || rawLabel.includes('testbed'))
    shortTitle = 'EMS-CORE'
  else if (data.id === 'upf-vm' || rawLabel.includes('upf-01'))
    shortTitle = 'EMS-UPF-01'
  else if (data.id === 'upf-vm2' || rawLabel.includes('upf-02'))
    shortTitle = 'EMS-UPF-02'

  let shortRole = String(data.role || 'Host VM')
  if (data.id === 'ue-vm') shortRole = 'UE (Dual PDU)'
  else if (data.id === 'gnb-vm') shortRole = 'gNodeB (RAN)'
  else if (data.id === 'core') shortRole = '5G Core (CP)'
  else if (data.id === 'upf-vm') shortRole = 'UPF (Internet)'
  else if (data.id === 'upf-vm2') shortRole = 'UPF (Corporate)'

  return (
    <div
      className='relative flex cursor-pointer flex-col justify-between rounded-xl border-2 border-border bg-card px-3.5 py-2.5 text-card-foreground shadow-sm transition-all duration-200 select-none hover:border-primary hover:shadow-md'
      style={{ width: 195, minHeight: 82 }}
    >
      {[Position.Top, Position.Bottom, Position.Left, Position.Right].flatMap(
        (position) =>
          (['source', 'target'] as const).map((type) => (
            <Handle
              key={`${type}-${position}`}
              id={`${type}-${String(position).toLowerCase()}`}
              type={type}
              position={position}
              className='!h-2 !w-2 !border-card !bg-primary/50'
            />
          ))
      )}

      <div className='flex items-center justify-between gap-1.5'>
        <div className='flex min-w-0 items-center gap-2'>
          <Server className='h-4 w-4 shrink-0 text-indigo-400' />
          <div className='truncate'>
            <span className='block truncate font-mono text-sm leading-tight font-black text-foreground'>
              {shortTitle}
            </span>
            <p className='mt-0.5 truncate text-[10px] font-semibold tracking-wider text-muted-foreground uppercase'>
              {shortRole}
            </p>
          </div>
        </div>
        <span className={`h-2.5 w-2.5 rounded-full ${ledStyle} shrink-0`} />
      </div>

      <div className='mt-2 flex items-center justify-between gap-1 border-t border-border/50 pt-1.5 font-mono text-[10px] font-semibold'>
        <span className='truncate rounded bg-muted px-1.5 py-0.5 text-muted-foreground'>
          {String(data.ip || 'Sin IP')}
        </span>
        <span className='shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-primary'>
          {String(data.nfSummary || '')}
        </span>
      </div>
    </div>
  )
}

const nodeTypes = {
  telcoNode: TelcoNode,
  hostNode: HostNode,
}

function telcoElements(
  components: ComponentStatus[],
  alarms?: NodeAlarmItem[]
) {
  const is5g = components.some((c) => c.id === 'amf' || c.id === 'gnb')
  const posMap = is5g ? telcoPositions5G : telcoPositions4G

  // En la vista lógica 3GPP, colapsamos instancias del plano de usuario (ej. 2 UPFs)
  // en un único nodo arquitectural para mantener un diagrama canónico sin telarañas.
  const upfComps = components.filter(
    (c) => c.id === 'upf' || c.id === 'upf2' || c.kind === 'user-plane'
  )
  const hasMultipleUpfs = is5g && upfComps.length > 1

  let displayComponents: ComponentStatus[]
  if (hasMultipleUpfs) {
    const nonUpfs = components.filter(
      (c) => !(c.id === 'upf' || c.id === 'upf2' || c.kind === 'user-plane')
    )
    const allRunning = upfComps.every((c) => c.status === 'running')
    const aggregatedUpf: ComponentStatus = {
      id: 'upf',
      label: 'UPF',
      kind: 'user-plane',
      node_id: 'upf-cluster',
      unit: 'open5gs-upfd',
      interfaces: ['N3', 'N4', 'N6'],
      status: allRunning ? 'running' : 'stopped',
      procedures: [
        'Plano de Usuario Desagregado (CUPS)',
        'Soporte Multi-Slice: Internet (eMBB) + Corporativo (MEC)',
      ],
      expected_endpoints: upfComps.flatMap((c) => c.expected_endpoints || []),
      config_paths: ['/etc/open5gs/upf.yaml'],
      depends_on: ['smf'],
    }
    displayComponents = [...nonUpfs, aggregatedUpf]
  } else {
    displayComponents = components
  }

  const nodes: Node[] = displayComponents.map((component, idx) => {
    const defaultPos = { x: 50 + (idx % 4) * 200, y: Math.floor(idx / 4) * 120 }
    const pos = posMap[component.id] ?? defaultPos

    const compAlarms = (alarms ?? []).filter((a) => {
      if (component.id === 'upf' && hasMultipleUpfs) {
        return upfComps.some(
          (u) =>
            a.component === u.id ||
            a.component?.toLowerCase() === u.id.toLowerCase() ||
            (a.node_id &&
              (a.node_id === u.node_id ||
                a.node_id === 'upf-vm' ||
                a.node_id === 'upf-vm2'))
        )
      }
      return alarmBelongsToComponent(a, component)
    })
    const hasCritical = compAlarms.some((a) => a.severity === 'critical')
    const hasMajor = compAlarms.some((a) => a.severity === 'major')
    const hasMinor = compAlarms.some((a) => a.severity === 'minor')
    const hasWarning = compAlarms.some((a) => a.severity === 'warning')
    const highestSeverity = hasCritical
      ? 'critical'
      : hasMajor
        ? 'major'
        : hasMinor
          ? 'minor'
          : hasWarning
            ? 'warning'
            : null

    const subtitle =
      component.id === 'upf' && hasMultipleUpfs
        ? `${upfComps.length} Instancias (Internet + Corp)`
        : undefined

    return {
      id: component.id,
      type: 'telcoNode',
      position: pos,
      data: {
        selectionType: 'component',
        id: component.id,
        label: component.label,
        kind: component.kind,
        status: component.status,
        subtitle,
        alarmSeverity: highestSeverity,
        alarmCount: compAlarms.length,
      },
    }
  })

  // Enlaces arquitecturales sobrios y nítidos
  const edges: Edge[] = []
  const directTelcoLinks = is5g
    ? [
        { from: 'ue', to: 'gnb' },
        { from: 'gnb', to: 'upf' },
        { from: 'gnb', to: 'amf' },
        { from: 'amf', to: 'smf' },
        { from: 'smf', to: 'upf' },
        { from: 'mongodb', to: 'udr' },
        { from: 'udr', to: 'udm' },
        { from: 'udm', to: 'ausf' },
        { from: 'ausf', to: 'amf' },
        { from: 'pcf', to: 'smf' },
        { from: 'nssf', to: 'amf' },
        { from: 'nrf', to: 'scp' },
      ]
    : [
        { from: 'ue', to: 'enb' },
        { from: 'enb', to: 'sgwu' },
        { from: 'enb', to: 'mme' },
        { from: 'hss', to: 'mme' },
        { from: 'mme', to: 'sgwc' },
        { from: 'sgwc', to: 'sgwu' },
        { from: 'sgwc', to: 'smf' },
        { from: 'sgwu', to: 'upf' },
        { from: 'pcrf', to: 'smf' },
        { from: 'mongodb', to: 'hss' },
      ]

  for (const link of directTelcoLinks) {
    const hasSource = components.some((c) => c.id === link.from)
    const hasTarget = components.some((c) => c.id === link.to)
    if (!hasSource || !hasTarget) continue

    const key = `${link.from}-${link.to}`
    const info = specificTelcoEdges[key] ?? {
      label: 'Control',
      stroke: 'dashed',
    }

    const sourcePosition = nodes.find((node) => node.id === link.from)!.position
    const targetPosition = nodes.find((node) => node.id === link.to)!.position
    const horizontal = Math.abs(targetPosition.y - sourcePosition.y) < 1
    const sourceSide = horizontal
      ? targetPosition.x >= sourcePosition.x
        ? Position.Right
        : Position.Left
      : targetPosition.y >= sourcePosition.y
        ? Position.Bottom
        : Position.Top
    const targetSide = horizontal
      ? targetPosition.x >= sourcePosition.x
        ? Position.Left
        : Position.Right
      : targetPosition.y >= sourcePosition.y
        ? Position.Top
        : Position.Bottom

    edges.push({
      id: key,
      source: link.from,
      target: link.to,
      sourceHandle: `source-${String(sourceSide).toLowerCase()}`,
      targetHandle: `target-${String(targetSide).toLowerCase()}`,
      type: 'straight',
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: 'var(--muted-foreground)',
      },
      label: info.label,
      labelStyle: {
        fontSize: 10,
        fontWeight: 700,
        fill: 'var(--foreground)',
        fontFamily: 'ui-monospace, monospace',
      },
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 6,
      labelBgStyle: {
        fill: 'var(--card)',
        stroke: 'var(--border)',
        strokeWidth: 1.5,
      },
      style: {
        stroke: 'var(--muted-foreground)',
        strokeWidth: 2,
      },
    })
  }

  return { nodes, edges }
}

function physicalElements(
  components: ComponentStatus[],
  runtime?: RuntimeSnapshot
) {
  if (!runtime) return { nodes: [], edges: [] }

  const rawHosts =
    runtime.hosts && runtime.hosts.length > 1 ? runtime.hosts : null

  if (rawHosts) {
    const nodes: Node[] = rawHosts.map((host, idx) => {
      const hostComps = components.filter((c) => {
        if (host.id === 'upf-vm')
          return c.node_id === 'upf-vm' || c.id === 'upf'
        if (host.id === 'upf-vm2')
          return c.node_id === 'upf-vm2' || c.id === 'upf2'
        if (host.id === 'gnb-vm')
          return c.node_id === 'gnb-vm' || c.id === 'gnb'
        if (host.id === 'ue-vm') return c.node_id === 'ue-vm' || c.id === 'ue'
        return (
          c.node_id === 'core' ||
          (!['upf-vm', 'upf-vm2', 'gnb-vm', 'ue-vm'].includes(c.node_id) &&
            !['upf', 'upf2', 'gnb', 'ue'].includes(c.id))
        )
      })
      const active = hostComps.filter((c) => c.status === 'running').length
      const healthy = active === hostComps.length && hostComps.length > 0

      // Layout amplio y proporcional sin solapamiento
      let pos = { x: 80 + idx * 300, y: 190 }
      if (rawHosts.length === 5) {
        if (host.id === 'ue-vm') pos = { x: 60, y: 200 }
        else if (host.id === 'gnb-vm') pos = { x: 380, y: 200 }
        else if (host.id === 'core') pos = { x: 700, y: 200 }
        else if (host.id === 'upf-vm') pos = { x: 1020, y: 90 }
        else if (host.id === 'upf-vm2') pos = { x: 1020, y: 310 }
      } else if (rawHosts.length === 3) {
        if (idx === 0) pos = { x: 80, y: 190 }
        else if (idx === 1) pos = { x: 680, y: 90 }
        else if (idx === 2) pos = { x: 680, y: 310 }
      }

      const defaultRole =
        host.id === 'ue-vm'
          ? 'UE (Dual PDU)'
          : host.id === 'gnb-vm'
            ? 'gNodeB (RAN)'
            : host.id === 'upf-vm2'
              ? 'UPF (Corporate)'
              : host.id === 'upf-vm'
                ? 'UPF (Internet)'
                : '5G Core (CP)'

      const defaultIp =
        host.id === 'ue-vm'
          ? '10.210.50.11'
          : host.id === 'gnb-vm'
            ? '10.210.50.10'
            : host.id === 'upf-vm2'
              ? '10.210.50.9'
              : host.id === 'upf-vm'
                ? '10.210.50.8'
                : '10.210.50.1'

      return {
        id: host.id,
        type: 'hostNode',
        position: pos,
        data: {
          selectionType: 'host',
          id: host.id,
          label: host.hostname,
          role: defaultRole,
          ip: host.ip || defaultIp,
          nfSummary: `${active}/${hostComps.length} NFs activas`,
          healthy,
        },
      }
    })

    const edges: Edge[] = []
    if (rawHosts.length === 5) {
      const links = [
        {
          id: 'phys-ue-gnb',
          source: 'ue-vm',
          target: 'gnb-vm',
          sourceHandle: 'source-right',
          targetHandle: 'target-left',
          label: 'Radio Sim',
          stroke: '#38bdf8',
        },
        {
          id: 'phys-gnb-core',
          source: 'gnb-vm',
          target: 'core',
          sourceHandle: 'source-right',
          targetHandle: 'target-left',
          label: 'N2 (NGAP)',
          stroke: 'var(--primary)',
        },
        {
          id: 'phys-core-upf1',
          source: 'core',
          target: 'upf-vm',
          sourceHandle: 'source-right',
          targetHandle: 'target-left',
          label: 'N4 (Internet)',
          stroke: '#10b981',
        },
        {
          id: 'phys-core-upf2',
          source: 'core',
          target: 'upf-vm2',
          sourceHandle: 'source-right',
          targetHandle: 'target-left',
          label: 'N4 (Corporate)',
          stroke: '#06b6d4',
        },
      ]

      for (const link of links) {
        edges.push({
          id: link.id,
          source: link.source,
          target: link.target,
          sourceHandle: link.sourceHandle,
          targetHandle: link.targetHandle,
          type: 'straight',
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color: link.stroke,
          },
          label: link.label,
          labelStyle: {
            fontSize: 10,
            fontWeight: 700,
            fill: 'var(--foreground)',
            fontFamily: 'ui-monospace, monospace',
          },
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 6,
          labelBgStyle: {
            fill: 'var(--card)',
            stroke: 'var(--border)',
            strokeWidth: 1.5,
          },
          style: {
            stroke: link.stroke,
            strokeWidth: 2,
          },
        })
      }
    } else {
      const coreHost = rawHosts[0]
      for (let i = 1; i < rawHosts.length; i++) {
        const targetHost = rawHosts[i]
        const isUpf2 =
          targetHost.id === 'upf-vm2' || targetHost.ip === '10.210.50.9'
        const color = isUpf2 ? '#06b6d4' : 'var(--primary)'
        edges.push({
          id: `host-link-${targetHost.id}`,
          source: coreHost.id,
          target: targetHost.id,
          sourceHandle: 'source-right',
          targetHandle: 'target-left',
          type: 'straight',
          animated: false,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 14,
            height: 14,
            color,
          },
          label: isUpf2 ? 'N4 (Corporate)' : 'N4 (Internet)',
          labelStyle: {
            fontSize: 10,
            fontWeight: 700,
            fill: 'var(--foreground)',
            fontFamily: 'ui-monospace, monospace',
          },
          labelBgPadding: [6, 3],
          labelBgBorderRadius: 6,
          labelBgStyle: {
            fill: 'var(--card)',
            stroke: 'var(--border)',
            strokeWidth: 1.5,
          },
          style: {
            stroke: color,
            strokeWidth: 2,
          },
        })
      }
    }

    return { nodes, edges }
  }

  const active = components.filter(
    (component) => component.status === 'running'
  ).length
  const address = runtime.interfaces
    .flatMap((item) => item.addresses)
    .find((item) => item.family === 'inet' && !item.address.startsWith('127.'))

  const node: Node = {
    id: runtime.hostname,
    type: 'hostNode',
    position: { x: 320, y: 180 },
    data: {
      selectionType: 'host',
      id: runtime.hostname,
      label: runtime.hostname,
      role: 'Host Testbed',
      ip: address?.address ?? 'Sin IP',
      nfSummary: `${active}/${components.length} NFs activas`,
      healthy: active === components.length,
    },
  }
  return { nodes: [node], edges: [] }
}

export function EmsTopology({
  components,
  runtime,
  alarms,
  view = 'telco',
  onSelect,
}: {
  components: ComponentStatus[]
  runtime?: RuntimeSnapshot
  alarms?: NodeAlarmItem[]
  view?: TopologyView
  onSelect?: (selection: TopologySelection) => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const prevViewRef = useRef(view)
  useEffect(() => {
    const isViewChange = prevViewRef.current !== view
    prevViewRef.current = view

    const next =
      view === 'physical'
        ? physicalElements(components, runtime)
        : telcoElements(components, alarms)
    setNodes((current) => {
      if (isViewChange) {
        return next.nodes
      }
      const positions = new Map(current.map((node) => [node.id, node.position]))
      return next.nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) ?? node.position,
      }))
    })
    setEdges(next.edges)
  }, [components, runtime, alarms, setEdges, setNodes, view])

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    const type = node.data.selectionType === 'host' ? 'host' : 'component'
    onSelect?.({ type, id: node.id })
  }

  return (
    <ReactFlow
      nodeTypes={nodeTypes}
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      nodesDraggable
      nodesConnectable={false}
      proOptions={{ hideAttribution: true }}
      fitView
    >
      <Background color='var(--border)' gap={20} size={1} />
      <Controls
        showInteractive={false}
        className='overflow-hidden !rounded-lg !border !border-border !bg-card !shadow-md [&>button]:!border-border [&>button]:!bg-card [&>button]:!fill-foreground [&>button:hover]:!bg-muted'
      />
    </ReactFlow>
  )
}
