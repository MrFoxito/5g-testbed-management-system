import { useEffect, useState, useCallback, type CSSProperties } from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type ComponentStatus } from '@/lib/api'

// Fallback layout columns
const columns: Record<string, number> = {
  database: 0,
  core: 1,
  'user-plane': 2,
  ran: 3,
  ue: 4,
}

// Layout teórico SBA 5GC por defecto
const getInitialPosition = (id: string, kind: string, counts: Record<number, number>) => {
  const layout: Record<string, {x: number, y: number}> = {
    'ue': { x: 0, y: 350 },
    'ueransim': { x: 0, y: 350 },
    'ran': { x: 200, y: 350 },
    'gnb': { x: 200, y: 350 },
    'upf': { x: 450, y: 350 },
    'amf': { x: 200, y: 200 },
    'smf': { x: 450, y: 200 },
    'nssf': { x: 200, y: 50 },
    'pcf': { x: 450, y: 50 },
    'ausf': { x: 700, y: 200 },
    'udm': { x: 700, y: 50 },
    'udr': { x: 900, y: 50 },
    'nrf': { x: 900, y: 200 },
  }
  
  const key = id.toLowerCase()
  if (layout[key]) return layout[key]

  // Fallback
  const column = columns[kind] ?? 1
  counts[column] = (counts[column] ?? 0) + 1
  return { x: 30 + column * 180, y: counts[column] * 70 }
}

// Mapa de interfaces 3GPP basado en los pares conectados
const getInterfaceLabel = (sourceId: string, targetId: string) => {
  const pair = [sourceId.toLowerCase(), targetId.toLowerCase()].sort().join('-')
  const interfaceMap: Record<string, string> = {
    'amf-smf': 'N11',
    'smf-upf': 'N4',
    'amf-ausf': 'N12',
    'amf-udm': 'N8',
    'smf-udm': 'N10',
    'amf-nssf': 'N22',
    'ausf-udm': 'N13',
    'pcf-smf': 'N7',
    'amf-pcf': 'N15',
    'amf-ran': 'N2',
    'ran-upf': 'N3',
    'amf-gnb': 'N2',
    'gnb-upf': 'N3',
    'amf-ueransim': 'N2',
    'ueransim-upf': 'N3',
    'amf-ue': 'N1',
  }
  return interfaceMap[pair]
}

type MenuState = {
  id: string
  status: string
  top?: number
  left?: number
  right?: number
  bottom?: number
}

export function EmsTopology({ scenarioId, components }: { scenarioId: string; components: ComponentStatus[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  
  const queryClient = useQueryClient()
  const [menu, setMenu] = useState<MenuState | null>(null)

  const startMutation = useMutation({
    mutationFn: (componentId: string) => api.post(`/scenarios/${scenarioId}/components/${componentId}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', scenarioId] })
      setMenu(null)
    },
  })

  const stopMutation = useMutation({
    mutationFn: (componentId: string) => api.post(`/scenarios/${scenarioId}/components/${componentId}/stop`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status', scenarioId] })
      setMenu(null)
    },
  })

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault()
      
      const pane = (event.target as Element).closest('.react-flow')
      if (!pane) return
      
      const bounds = pane.getBoundingClientRect()
      
      const isBottom = event.clientY > bounds.bottom - 200
      const isRight = event.clientX > bounds.right - 200
      
      setMenu({
        id: node.id,
        status: node.data.status as string,
        top: !isBottom ? event.clientY - bounds.top : undefined,
        left: !isRight ? event.clientX - bounds.left : undefined,
        bottom: isBottom ? bounds.bottom - event.clientY : undefined,
        right: isRight ? bounds.right - event.clientX : undefined,
      })
    },
    [setMenu]
  )

  const onPaneClick = useCallback(() => setMenu(null), [setMenu])

  useEffect(() => {
    const counts: Record<number, number> = {}
    
    setNodes((currentNodes) => {
      const newNodes = components.map((component) => {
        const existingNode = currentNodes.find((n) => n.id === component.id)
        let position = existingNode?.position
        if (!position) {
          position = getInitialPosition(component.id, component.kind, counts)
        }

        const isRunning = component.status === 'running'
        const borderColor = isRunning ? '#10b981' : '#ef4444' // Verde si ok, Rojo si caído
        const bgColor = isRunning ? 'hsl(var(--card))' : '#fef2f2'
        const textColor = isRunning ? 'hsl(var(--card-foreground))' : '#991b1b'

        return {
          id: component.id,
          position,
          data: { label: `${component.label} · ${component.status}`, status: component.status },
          style: {
            fontSize: 12,
            fontWeight: isRunning ? 500 : 700,
            borderColor,
            borderWidth: isRunning ? 1 : 2,
            background: bgColor,
            color: textColor,
            borderRadius: 8,
            padding: 10,
          } as CSSProperties,
        }
      })

      // Nodo ficticio DN (Data Network) conectado al UPF
      const upfNode = newNodes.find(n => n.id.toLowerCase().includes('upf'))
      if (upfNode) {
        const existingDn = currentNodes.find(n => n.id === 'dn-mock')
        const position = existingDn?.position || { x: upfNode.position.x + 200, y: upfNode.position.y }
        newNodes.push({
          id: 'dn-mock',
          position,
          data: { label: 'Data Network (DN)', status: 'mock' },
          style: {
            fontSize: 12,
            fontWeight: 700,
            borderColor: '#3b82f6', 
            borderWidth: 2,
            borderStyle: 'dashed',
            background: 'hsl(var(--card))',
            color: '#1d4ed8',
            borderRadius: 8,
            padding: 10,
          } as CSSProperties,
        })
      }

      return newNodes
    })

    setEdges(() => {
      const newEdges = components.flatMap((component) =>
        component.depends_on.map((parent) => {
          const label = getInterfaceLabel(parent, component.id)
          const isRunning = component.status === 'running'
          const edgeColor = isRunning ? '#10b981' : '#9ca3af'
          
          return {
            id: `${parent}-${component.id}`,
            source: parent,
            target: component.id,
            animated: isRunning,
            type: 'smoothstep',
            label,
            labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 },
            labelBgStyle: { fill: '#374151', fillOpacity: 1, rx: 4, ry: 4 },
            labelBgPadding: [6, 4] as [number, number],
            style: { 
              stroke: edgeColor,
              strokeWidth: isRunning ? 2 : 1.5,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 15,
              height: 15,
              color: edgeColor,
            },
          }
        })
      )

      // Arista ficticia N6 (UPF -> DN)
      const upfNode = components.find(c => c.id.toLowerCase().includes('upf'))
      if (upfNode) {
        const isRunning = upfNode.status === 'running'
        const edgeColor = isRunning ? '#10b981' : '#9ca3af'
        newEdges.push({
          id: `${upfNode.id}-dn-mock`,
          source: upfNode.id,
          target: 'dn-mock',
          animated: isRunning,
          type: 'smoothstep',
          label: 'N6',
          labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 },
          labelBgStyle: { fill: '#374151', fillOpacity: 1, rx: 4, ry: 4 },
          labelBgPadding: [6, 4] as [number, number],
          style: { stroke: edgeColor, strokeWidth: isRunning ? 2 : 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: edgeColor },
        })
      }

      return newEdges
    })
  }, [components, setNodes, setEdges])

  const isLoading = startMutation.isPending || stopMutation.isPending

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlow 
        nodes={nodes} 
        edges={edges} 
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>

      {menu && menu.id !== 'dn-mock' && (
        <div
          className="absolute z-50 rounded-md border shadow-md p-1 min-w-[160px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
          style={{ top: menu.top, left: menu.left, right: menu.right, bottom: menu.bottom }}
        >
          <div className="px-2 py-1.5 text-xs font-semibold border-b mb-1 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
            {menu.id.toUpperCase()}
          </div>
          
          {menu.status === 'running' ? (
             <button 
               onClick={() => stopMutation.mutate(menu.id)} 
               disabled={isLoading}
               className="w-full text-left px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-sm text-red-600 dark:text-red-500 font-medium disabled:opacity-50 transition-colors"
             >
               🔴 Apagar componente
             </button>
          ) : (
             <button 
               onClick={() => startMutation.mutate(menu.id)} 
               disabled={isLoading}
               className="w-full text-left px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-sm text-emerald-600 dark:text-emerald-500 font-medium disabled:opacity-50 transition-colors"
             >
               🟢 Encender componente
             </button>
          )}
          
          <button disabled className="w-full text-left px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-sm opacity-40 cursor-not-allowed text-zinc-900 dark:text-zinc-100">📄 Ver Logs</button>
          <button disabled className="w-full text-left px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-sm opacity-40 cursor-not-allowed text-zinc-900 dark:text-zinc-100">ℹ️ Información</button>
        </div>
      )}
    </div>
  )
}
