import { createFileRoute } from '@tanstack/react-router'
import { TopologyPage } from '@/features/topology'

export const Route = createFileRoute('/_authenticated/topology/')({
  component: TopologyPage,
})
