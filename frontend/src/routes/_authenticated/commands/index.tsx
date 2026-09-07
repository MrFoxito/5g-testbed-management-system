import { createFileRoute } from '@tanstack/react-router'
import { CommandsPage } from '@/features/commands'

export const Route = createFileRoute('/_authenticated/commands/')({
  component: CommandsPage,
})
