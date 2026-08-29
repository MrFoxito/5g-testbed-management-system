import { createFileRoute } from '@tanstack/react-router'
import { SubscribersPage } from '@/features/subscribers'

export const Route = createFileRoute('/_authenticated/subscribers/')({
  component: SubscribersPage,
})
