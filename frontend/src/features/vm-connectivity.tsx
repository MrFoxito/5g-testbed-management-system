import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type Connectivity = {
  connected: number
  total: number
  checked_at: string
  nodes: {
    id: string
    name: string
    role: string
    address: string
    ssh_port: number
    status: string
    detail: string
    latency_ms: number | null
  }[]
}

export function VmConnectivity({ scenario }: { scenario: string }) {
  const query = useQuery({
    queryKey: ['vm-connectivity', scenario],
    queryFn: async () =>
      (await api.get<Connectivity>(`/deployment/${scenario}/connectivity`))
        .data,
    refetchInterval: 10000,
    retry: false,
  })
  return (
    <main id='content' className='mx-auto max-w-6xl space-y-6 p-6'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-semibold'>
            Laboratorio 4G · Conectividad
          </h1>
          <p className='text-muted-foreground'>
            Ubuntu y acceso SSH. EPC y srsRAN pendientes de instalación.
          </p>
        </div>
        <Button
          variant='outline'
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? 'Comprobando…' : 'Comprobar conexión'}
        </Button>
      </div>
      <div role='status' aria-live='polite'>
        {query.isError ? (
          <p className='text-destructive'>
            No se pudo consultar la conectividad. Comprueba que el backend esté
            disponible; los datos anteriores pueden estar desactualizados.
          </p>
        ) : query.data ? (
          <p>
            {query.data.connected} de {query.data.total} VMs conectadas · Última
            comprobación: {new Date(query.data.checked_at).toLocaleTimeString()}
          </p>
        ) : (
          <p>Verificando acceso a las VMs…</p>
        )}
      </div>
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {query.data?.nodes.map((node) => (
          <Card key={node.id}>
            <CardHeader>
              <CardTitle>{node.name}</CardTitle>
              <p className='text-sm text-muted-foreground'>{node.role}</p>
            </CardHeader>
            <CardContent className='space-y-3 text-sm'>
              <p
                className={
                  node.status === 'connected' && !query.isError
                    ? 'font-medium text-emerald-700 dark:text-emerald-400'
                    : 'font-medium text-muted-foreground'
                }
              >
                {query.isError
                  ? 'Sin actualización'
                  : node.status === 'connected'
                    ? 'Conectada'
                    : node.status === 'unreachable'
                      ? 'Sin conexión'
                      : 'Revisar conexión'}
              </p>
              <p>{node.detail}</p>
              <dl className='grid grid-cols-2 gap-2'>
                <dt>IP interna</dt>
                <dd className='font-mono'>{node.address}</dd>
                <dt>Puerto SSH</dt>
                <dd>{node.ssh_port}</dd>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className='text-sm text-muted-foreground'>
        La conexión verifica autenticación SSH, nombre de la VM e IP interna. No
        certifica todavía el funcionamiento LTE ni la comunicación entre todas
        las VMs.
      </p>
    </main>
  )
}
