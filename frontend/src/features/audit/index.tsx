import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmsPage } from '@/features/ems-page'

type Event = {
  id: number
  username: string
  role: string
  action: string
  result: string
  created_at: string
}
export function AuditPage() {
  const query = useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await api.get<Event[]>('/audit')).data,
  })
  return (
    <EmsPage
      title='Auditoría'
      description='Trazabilidad de operaciones privilegiadas sin almacenar secretos.'
    >
      <Card>
        <CardContent className='pt-6'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.map((x) => (
                <TableRow key={x.id}>
                  <TableCell>
                    {new Date(x.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>{x.username}</TableCell>
                  <TableCell>{x.role}</TableCell>
                  <TableCell className='font-mono text-xs'>
                    {x.action}
                  </TableCell>
                  <TableCell>{x.result}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </EmsPage>
  )
}
