import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type ScenarioStatus } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmsPage } from '@/features/ems-page'
import { EmsTopology } from './ems-topology'

export function TopologyPage() {
  const [scenario, setScenario] = useState('5g-sa')
  const query = useQuery({
    queryKey: ['status', scenario],
    queryFn: async () =>
      (await api.get<ScenarioStatus>(`/scenarios/${scenario}/status`)).data,
    refetchInterval: 3000,
  })
  return (
    <EmsPage
      title='Topología'
      description='Funciones de red y dependencias del core previamente desplegado.'
      actions={
        <Select value={scenario} onValueChange={setScenario}>
          <SelectTrigger className='w-48'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='5g-sa'>5G Standalone</SelectItem>
            <SelectItem value='4g-epc'>4G EPC</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <Card className='h-[calc(100vh-12rem)]'>
        <CardHeader>
          <CardTitle>
            {query.data?.state ?? 'Conectando'} ·{' '}
            {query.data?.components.length ?? 0} componentes
          </CardTitle>
        </CardHeader>
        <CardContent className='h-[calc(100%-5rem)]'>
          <EmsTopology scenarioId={scenario} components={query.data?.components ?? []} />
        </CardContent>
      </Card>
    </EmsPage>
  )
}
