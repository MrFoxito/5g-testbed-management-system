import { useState } from 'react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmsPage } from '@/features/ems-page'

type AlarmHistory = Alarm & { state: 'active' | 'cleared' }

export function AlarmsPage() {
  const [tab, setTab] = useState('live')

  const liveQuery = useQuery({
    queryKey: ['alarms', '5g-sa'],
    queryFn: async () => (await api.get<Alarm[]>('/alarms/5g-sa')).data,
    refetchInterval: 3000,
  })

  const historyQuery = useQuery({
    queryKey: ['alarms-history', '5g-sa'],
    queryFn: async () => (await api.get<AlarmHistory[]>('/alarms/5g-sa/history')).data,
    refetchInterval: tab === 'history' ? 3000 : false,
  })

  return (
    <EmsPage
      title='Alarmas'
      description='Fault Management determinístico inspirado en ITU-T X.733.'
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="live">Alarmas Activas</TabsTrigger>
          <TabsTrigger value="history">Historial de Eventos</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
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
                  {liveQuery.data?.map((a) => (
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
                  {!liveQuery.data?.length && (
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
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardContent className='pt-6'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estado</TableHead>
                    <TableHead>Severidad</TableHead>
                    <TableHead>Componente</TableHead>
                    <TableHead>Mensaje</TableHead>
                    <TableHead>Fecha y Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyQuery.data?.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Badge
                          variant={a.state === 'active' ? 'destructive' : 'default'}
                          className={a.state === 'cleared' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
                        >
                          {a.state === 'active' ? 'CAÍDA' : 'RECUPERADO'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{a.severity}</Badge>
                      </TableCell>
                      <TableCell className='font-medium'>{a.component}</TableCell>
                      <TableCell>{a.message}</TableCell>
                      <TableCell>
                        {new Date(a.observed_at).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!historyQuery.data?.length && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className='h-32 text-center text-muted-foreground'
                      >
                        El historial está limpio
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </EmsPage>
  )
}
