import { useEffect } from 'react'
import {
  Background,
  Controls,
  Handle,
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
import {
  Database,
  Radio,
  Router,
  Server,
  Smartphone,
} from 'lucide-react'
import type { ComponentStatus, RuntimeSnapshot } from '@/lib/api'

export type TopologyView = 'physical' | 'telco'
export type TopologySelection =
  | { type: 'host'; id: string }
  | { type: 'component'; id: string }

// Layout arquitectural 3GPP compacto y balanceado
const telcoPositions5G: Record<string, { x: number; y: number }> = {
  // Fila 1: Microservicios Core (Auth a la izquierda, Políticas a la derecha)
  mongodb: { x: 60,  y: 40 },
  udr:     { x: 230, y: 40 },
  udm:     { x: 400, y: 40 },
  ausf:    { x: 570, y: 40 },

  pcf:     { x: 740, y: 40 },
  nssf:    { x: 910, y: 40 },
  nrf:     { x: 1080, y: 40 },
  scp:     { x: 1250, y: 40 },

  // Fila 2: Plano de Control (AMF sobre gNodeB, SMF sobre UPF)
  amf:     { x: 400, y: 220 },
  smf:     { x: 740, y: 220 },

  // Fila 3: Plano de Usuario (Izquierda a Derecha: UE -> gNodeB -> UPF)
  ue:      { x: 60,  y: 390 },
  gnb:     { x: 400, y: 390 },
  upf:     { x: 740, y: 390 },
}

const telcoPositions4G: Record<string, { x: number; y: number }> = {
  mongodb: { x: 60,  y: 40 },
  hss:     { x: 380, y: 40 },
  pcrf:    { x: 720, y: 40 },

  mme:     { x: 380, y: 210 },
  sgwc:    { x: 720, y: 210 },
  smf:     { x: 1040, y: 210 },

  ue:      { x: 60,  y: 380 },
  enb:     { x: 380, y: 380 },
  sgwu:    { x: 720, y: 380 },
  upf:     { x: 1040, y: 380 },
}

// Mapeo unívoco y sobrio de interfaces 3GPP
const specificTelcoEdges: Record<string, { label: string; stroke: string }> = {
  // 5G SA
  'ue-gnb':      { label: 'NR-Uu (Radio)', stroke: 'solid' },
  'gnb-amf':     { label: 'N2 (NGAP)', stroke: 'solid' },
  'gnb-upf':     { label: 'N3 (GTP-U)', stroke: 'solid' },
  'amf-smf':     { label: 'N11 (SBI)', stroke: 'dashed' },
  'smf-upf':     { label: 'N4 (PFCP)', stroke: 'solid' },
  'mongodb-udr': { label: 'BSON', stroke: 'dashed' },
  'udr-udm':     { label: 'Nudr', stroke: 'dashed' },
  'udm-ausf':    { label: 'Nausf', stroke: 'dashed' },
  'ausf-amf':    { label: 'Namf / N12', stroke: 'dashed' },
  'pcf-smf':     { label: 'Npcf', stroke: 'dashed' },
  'nssf-amf':    { label: 'Nnssf', stroke: 'dashed' },
  'nrf-scp':     { label: 'SBI', stroke: 'dashed' },

  // 4G EPC
  'ue-enb':      { label: 'LTE-Uu', stroke: 'solid' },
  'enb-mme':     { label: 'S1-MME', stroke: 'solid' },
  'enb-sgwu':    { label: 'S1-U (GTP-U)', stroke: 'solid' },
  'hss-mme':     { label: 'S6a', stroke: 'solid' },
  'mme-sgwc':    { label: 'S11', stroke: 'solid' },
  'sgwc-sgwu':   { label: 'S5/S8 Control', stroke: 'solid' },
  'sgwc-smf':    { label: 'S5/S8-C', stroke: 'solid' },
  'sgwu-upf':    { label: 'S5/S8-U', stroke: 'solid' },
  'pcrf-smf':    { label: 'Gx', stroke: 'solid' },
  'mongodb-hss': { label: 'BSON', stroke: 'dashed' },
}

function getComponentIcon(id: string) {
  if (id === 'ue') {
    return <Smartphone className='h-6 w-6 text-sky-500 mb-1' />
  }
  if (id === 'gnb' || id === 'enb') {
    return <Radio className='h-6 w-6 text-indigo-500 mb-1' />
  }
  if (id === 'upf' || id === 'sgwu') {
    return <Router className='h-6 w-6 text-emerald-500 mb-1' />
  }
  if (id === 'mongodb') {
    return <Database className='h-6 w-6 text-amber-500 mb-1' />
  }
  return <Server className='h-5 w-5 text-purple-400/80 mb-1' />
}

// Componente de nodo limpio, sobrio y profesional con icono nativo de telecomunicaciones
function TelcoNode({ data }: NodeProps) {
  const isRunning = data.status === 'running'
  const id = String(data.id ?? data.label).toLowerCase()
  const kind = String(data.kind ?? '')
  const icon = getComponentIcon(id)

  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-2xl border-2 px-5 py-3.5 transition-all duration-200 select-none shadow-sm ${
        isRunning
          ? 'bg-card border-border hover:border-primary text-card-foreground hover:shadow-md'
          : 'bg-destructive/10 border-destructive text-destructive shadow-lg animate-pulse'
      }`}
      style={{ minWidth: 140, minHeight: 74 }}
    >
      {/* Handles para conexiones limpias */}
      {[Position.Top, Position.Bottom, Position.Left, Position.Right].flatMap((position) =>
        (['source', 'target'] as const).map((type) => (
          <Handle key={`${type}-${position}`} id={`${type}-${position}`} type={type} position={position} className='!w-2.5 !h-2.5 !bg-primary/50 !border-card' />
        ))
      )}

      {/* Status LED */}
      <span
        className={`absolute top-2.5 right-2.5 h-2.5 w-2.5 rounded-full ${
          isRunning ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'
        }`}
      />

      {/* Icono temático del nodo (Celular para UE, Antena para gNodeB, etc.) */}
      {icon}

      {/* Gran Nombre de la NF */}
      <span className='text-base font-black tracking-tight font-mono text-foreground leading-tight'>
        {String(data.label)}
      </span>

      {/* Rol / Subtítulo discreto */}
      <span className='mt-0.5 text-[9px] font-bold text-muted-foreground uppercase tracking-widest opacity-80'>
        {kind}
      </span>
    </div>
  )
}

const nodeTypes = {
  telcoNode: TelcoNode,
}

function telcoElements(components: ComponentStatus[]) {
  const is5g = components.some((c) => c.id === 'amf' || c.id === 'gnb')
  const posMap = is5g ? telcoPositions5G : telcoPositions4G

  const nodes: Node[] = components.map((component, idx) => {
    const defaultPos = { x: 50 + (idx % 4) * 200, y: Math.floor(idx / 4) * 120 }
    const pos = posMap[component.id] ?? defaultPos

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
      ? targetPosition.x >= sourcePosition.x ? Position.Right : Position.Left
      : targetPosition.y >= sourcePosition.y ? Position.Bottom : Position.Top
    const targetSide = horizontal
      ? targetPosition.x >= sourcePosition.x ? Position.Left : Position.Right
      : targetPosition.y >= sourcePosition.y ? Position.Top : Position.Bottom

    edges.push({
      id: key,
      source: link.from,
      target: link.to,
      sourceHandle: `source-${sourceSide}`,
      targetHandle: `target-${targetSide}`,
      type: 'straight',
      animated: false,
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
  const active = components.filter((component) => component.status === 'running')
    .length
  const address = runtime.interfaces
    .flatMap((item) => item.addresses)
    .find((item) => item.family === 'inet' && !item.address.startsWith('127.'))
  const node: Node = {
    id: runtime.hostname,
    position: { x: 320, y: 180 },
    data: {
      selectionType: 'host',
      label: `${runtime.hostname} · ${address?.address ?? 'sin IP'} · ${active}/${components.length} NFs`,
    },
    style: {
      width: 280,
      padding: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: active === components.length ? 'var(--primary)' : 'var(--destructive)',
      background: 'var(--card)',
      color: 'var(--card-foreground)',
      fontWeight: 600,
    },
  }
  return { nodes: [node], edges: [] }
}

export function EmsTopology({
  components,
  runtime,
  view = 'telco',
  onSelect,
}: {
  components: ComponentStatus[]
  runtime?: RuntimeSnapshot
  view?: TopologyView
  onSelect?: (selection: TopologySelection) => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    const next =
      view === 'physical'
        ? physicalElements(components, runtime)
        : telcoElements(components)
    setNodes((current) => {
      const positions = new Map(current.map((node) => [node.id, node.position]))
      return next.nodes.map((node) => ({
        ...node,
        position: positions.get(node.id) ?? node.position,
      }))
    })
    setEdges(next.edges)
  }, [components, runtime, setEdges, setNodes, view])

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
        className='!bg-card !border-border !border !shadow-md !rounded-lg overflow-hidden [&>button]:!bg-card [&>button]:!border-border [&>button]:!fill-foreground [&>button:hover]:!bg-muted'
      />
    </ReactFlow>
  )
}
