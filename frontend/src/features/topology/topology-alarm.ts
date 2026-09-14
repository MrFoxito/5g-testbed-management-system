import type { ComponentStatus } from '@/lib/api'

export type TopologyAlarmIdentity = {
  component?: string
  node_id?: string
}

export function alarmBelongsToComponent(
  alarm: TopologyAlarmIdentity,
  component: Pick<ComponentStatus, 'id' | 'node_id'>
) {
  const alarmComponent = alarm.component?.trim().toLowerCase()
  if (alarmComponent) return alarmComponent === component.id.toLowerCase()
  return Boolean(alarm.node_id && alarm.node_id === component.node_id)
}
