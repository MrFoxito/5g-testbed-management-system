import {
  Activity,
  ChartNoAxesCombined,
  FileCode2,
  LayoutDashboard,
  Network,
  Radio,
  ScrollText,
  ShieldAlert,
  Terminal,
  Users,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Usuario EMS',
    email: 'PUCP · TEL142',
    avatar: '/images/ems-logo.png',
  },
  teams: [{ name: 'EMS Educativo', logo: '/images/ems-logo.png', plan: 'Open5GS · srsRAN' }],
  navGroups: [
    {
      title: 'Operación',
      items: [
        { title: 'Resumen', url: '/', icon: LayoutDashboard },
        { title: 'Topología', url: '/topology', icon: Network },
        { title: 'Comandos MML', url: '/commands', icon: Terminal },
        { title: 'Alarmas', url: '/alarms', icon: ShieldAlert },
        { title: 'Trazas', url: '/traces', icon: Radio },
        {
          title: 'Performance',
          url: '/performance',
          icon: ChartNoAxesCombined,
        },
      ],
    },
    {
      title: 'Gestión',
      items: [
        { title: 'Suscriptores', url: '/subscribers', icon: Users },
        { title: 'Configuración', url: '/configuration', icon: FileCode2 },
        { title: 'Auditoría', url: '/audit', icon: ScrollText },
      ],
    },
  ],
}
