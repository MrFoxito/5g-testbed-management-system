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
    refetchInterval: 5000,
  })
  return (
    <EmsPage
      title='Alarmas'
      description='Fallas contextualizadas por función, interfaz y procedimiento 3GPP.'
    >
      <Card>
        <CardContent className='pt-6'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severidad</TableHead>
                <TableHead>NF / nodo</TableHead>
                <TableHead>Impacto telco</TableHead>
                <TableHead>Evidencia y recomendación</TableHead>
                <TableHead>Observada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.map((alarm) => (
                <TableRow key={alarm.id}>
                  <TableCell>
                    <Badge variant={alarm.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {alarm.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <p className='font-medium'>{alarm.network_function}</p>
                    <p className='text-xs text-muted-foreground'>{alarm.node_id} · {alarm.component}</p>
                  </TableCell>
                  <TableCell className='max-w-72'>
                    <p>{alarm.message}</p>
                    <div className='mt-2 flex flex-wrap gap-1'>
                      {alarm.interfaces.map((item) => <Badge key={item} variant='outline'>{item}</Badge>)}
                      {alarm.procedures.slice(0, 2).map((item) => <Badge key={item} variant='secondary'>{item}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className='max-w-96'>
                    <p className='font-mono text-xs'>{alarm.evidence}</p>
                    <p className='mt-1 text-xs text-muted-foreground'>{alarm.recommendation}</p>
                  </TableCell>
                  <TableCell className='text-xs'>{new Date(alarm.observed_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!query.data?.length && (
                <TableRow>
                  <TableCell colSpan={5} className='h-32 text-center text-muted-foreground'>
                    Sin alarmas activas: servicios, endpoints y procedimientos 5G saludables.
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
