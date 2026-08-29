import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { ComponentStatus } from '@/lib/api'

const columns: Record<string, number> = {
  database: 0,
  core: 1,
  'user-plane': 2,
  ran: 3,
  ue: 4,
}
export function EmsTopology({ components }: { components: ComponentStatus[] }) {
  const counts: Record<number, number> = {}
  const nodes: Node[] = components.map((component) => {
    const column = columns[component.kind] ?? 1
    counts[column] = (counts[column] ?? 0) + 1
    return {
      id: component.id,
      position: { x: 30 + column * 180, y: counts[column] * 70 },
      data: { label: `${component.label} · ${component.status}` },
      style: {
        fontSize: 11,
        borderColor:
          component.status === 'running'
            ? 'hsl(var(--primary))'
            : 'hsl(var(--border))',
        background: 'hsl(var(--card))',
        color: 'hsl(var(--card-foreground))',
      },
    }
  })
  const edges: Edge[] = components.flatMap((component) =>
    component.depends_on.map((parent) => ({
      id: `${parent}-${component.id}`,
      source: parent,
      target: component.id,
      animated: component.status === 'running',
    }))
  )
  return (
    <ReactFlow nodes={nodes} edges={edges} fitView>
      <Background />
      <Controls />
    </ReactFlow>
  )
}
