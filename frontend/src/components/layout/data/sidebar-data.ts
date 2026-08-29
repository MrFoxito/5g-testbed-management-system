import {
  Activity,
  FileCode2,
  LayoutDashboard,
  Network,
  Radio,
  ScrollText,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Usuario EMS',
    email: 'PUCP · TEL142',
    avatar: '/avatars/shadcn.jpg',
  },
  teams: [{ name: 'EMS Educativo', logo: Activity, plan: 'Open5GS · srsRAN' }],
  navGroups: [
    {
      title: 'Operación',
      items: [
        { title: 'Resumen', url: '/', icon: LayoutDashboard },
        { title: 'Topología', url: '/topology', icon: Network },
        { title: 'Alarmas', url: '/alarms', icon: ShieldAlert },
        { title: 'Trazas', url: '/traces', icon: Radio },
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
