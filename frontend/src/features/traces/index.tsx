import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Radio } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { api, canOperate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmsPage } from '@/features/ems-page'

type Trace = {
  id: string
  interface: string
  protocol: string
  status: string
  created_at: string
  file: string
}
export function TracesPage() {
  const client = useQueryClient()
  const role = useAuthStore((s) => s.auth.user?.role)
  const [protocol, setProtocol] = useState('ngap')
  const [networkInterface, setNetworkInterface] = useState('lo')
  const query = useQuery({
    queryKey: ['traces'],
    queryFn: async () => (await api.get<Trace[]>('/traces')).data,
  })
  const start = useMutation({
    mutationFn: () =>
      api.post('/traces', {
        interface: networkInterface,
        protocol,
        duration_seconds: 60,
        max_megabytes: 25,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['traces'] }),
  })
  const download = async (id: string, file: string) => {
    const response = await api.get(`/traces/${id}/download`, {
      responseType: 'blob',
    })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = file
    link.click()
    URL.revokeObjectURL(url)
  }
  return (
    <EmsPage
      title='Trazas'
      description='Capturas de señalización sobre interfaces permitidas del testbed.'
      actions={
        <div className='flex gap-2'>
          <Select value={networkInterface} onValueChange={setNetworkInterface}>
            <SelectTrigger className='w-28'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='lo'>lo</SelectItem>
              <SelectItem value='ogstun'>ogstun</SelectItem>
            </SelectContent>
          </Select>
          <Select value={protocol} onValueChange={setProtocol}>
            <SelectTrigger className='w-32'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['s1ap', 'ngap', 'nas', 'gtpu', 'pfcp', 'diameter', 'sbi'].map(
                (x) => (
                  <SelectItem key={x} value={x}>
                    {x.toUpperCase()}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          {canOperate(role) && (
            <Button onClick={() => start.mutate()}>
              <Radio />
              Capturar
            </Button>
          )}
        </div>
      }
    >
      <Card>
        <CardContent className='pt-6'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Protocolo</TableHead>
                <TableHead>Interfaz</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.map((x) => (
                <TableRow key={x.id}>
                  <TableCell>{x.protocol.toUpperCase()}</TableCell>
                  <TableCell>{x.interface}</TableCell>
                  <TableCell>{x.status}</TableCell>
                  <TableCell>
                    {new Date(x.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => download(x.id, x.file)}
                    >
                      <Download />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </EmsPage>
  )
}
