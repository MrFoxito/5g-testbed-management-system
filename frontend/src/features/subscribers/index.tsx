import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { api, canOperate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmsPage } from '@/features/ems-page'

type Subscriber = {
  imsi: string
  security: { k: string; opc: string }
  slice: { sst: number }[]
}
const initial = {
  imsi: '',
  key: '',
  opc: '',
  amf: '8000',
  apn_dnn: 'internet',
  sst: 1,
  sd: '000001',
}
export function SubscribersPage() {
  const client = useQueryClient()
  const role = useAuthStore((s) => s.auth.user?.role)
  const [form, setForm] = useState(initial)
  const query = useQuery({
    queryKey: ['subscribers'],
    queryFn: async () => (await api.get<Subscriber[]>('/subscribers')).data,
  })
  const mutation = useMutation({
    mutationFn: () => api.post('/subscribers', form),
    onSuccess: () => {
      toast.success('Suscriptor creado')
      setForm(initial)
      client.invalidateQueries({ queryKey: ['subscribers'] })
    },
    onError: () => toast.error('No se pudo crear el suscriptor'),
  })
  return (
    <EmsPage
      title='Suscriptores'
      description='Provisionamiento controlado sobre la MongoDB del Open5GS existente.'
    >
      <div className='grid gap-4 lg:grid-cols-[2fr_1fr]'>
        <Card>
          <CardContent className='pt-6'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IMSI</TableHead>
                  <TableHead>S-NSSAI</TableHead>
                  <TableHead>Clave enmascarada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data?.map((x) => (
                  <TableRow key={x.imsi}>
                    <TableCell className='font-mono'>{x.imsi}</TableCell>
                    <TableCell>SST {x.slice?.[0]?.sst}</TableCell>
                    <TableCell className='font-mono text-xs'>
                      {x.security.k}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='space-y-4 pt-6'>
            <Field
              label='IMSI'
              value={form.imsi}
              onChange={(v) => setForm({ ...form, imsi: v })}
            />
            <Field
              label='K'
              type='password'
              value={form.key}
              onChange={(v) => setForm({ ...form, key: v })}
            />
            <Field
              label='OPc'
              type='password'
              value={form.opc}
              onChange={(v) => setForm({ ...form, opc: v })}
            />
            <Field
              label='APN / DNN'
              value={form.apn_dnn}
              onChange={(v) => setForm({ ...form, apn_dnn: v })}
            />
            {canOperate(role) ? (
              <Button
                className='w-full'
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                Crear perfil SIM
              </Button>
            ) : (
              <p className='text-sm text-muted-foreground'>
                Vista de solo lectura para alumnos.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </EmsPage>
  )
}
function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
