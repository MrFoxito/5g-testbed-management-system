import { useQuery } from '@tanstack/react-query'
import { api, type Alarm } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
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

export function AlarmsPage() {
  const query = useQuery({
    queryKey: ['alarms', '5g-sa'],
    queryFn: async () => (await api.get<Alarm[]>('/alarms/5g-sa')).data,
    refetchInterval: 3000,
  })
  return (
    <EmsPage
      title='Alarmas'
      description='Fault Management determinístico inspirado en ITU-T X.733.'
    >
      <Card>
        <CardContent className='pt-6'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severidad</TableHead>
                <TableHead>Componente</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Observada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Badge
                      variant={
                        a.severity === 'critical' ? 'destructive' : 'secondary'
                      }
                    >
                      {a.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className='font-medium'>{a.component}</TableCell>
                  <TableCell>{a.message}</TableCell>
                  <TableCell>
                    {new Date(a.observed_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {!query.data?.length && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className='h-32 text-center text-muted-foreground'
                  >
                    Sin alarmas activas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </EmsPage>
  )
}
