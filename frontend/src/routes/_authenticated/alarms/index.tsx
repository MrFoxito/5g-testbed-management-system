import { createFileRoute } from '@tanstack/react-router'
import { AlarmsPage } from '@/features/alarms'

export const Route = createFileRoute('/_authenticated/alarms/')({
  component: AlarmsPage,
})
