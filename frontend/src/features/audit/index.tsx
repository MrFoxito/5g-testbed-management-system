import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, FileText, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  const [exporting, setExporting] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['audit'],
    queryFn: async () => (await api.get<Event[]>('/audit')).data,
  })

  const exportEvidence = async (format: 'json' | 'csv') => {
    setExporting(format)
    try {
      const response = await api.get(`/audit/evidence/5g-sa/${format}`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `evidencia_5g-sa_${new Date().toISOString().slice(0, 10)}.${format}`
      link.click()
      URL.revokeObjectURL(url)
      toast.success(`Paquete de evidencia descargado en ${format.toUpperCase()}`)
    } catch {
      toast.error('No se pudo generar el reporte de evidencia')
    } finally {
      setExporting(null)
    }
  }

  return (
    <EmsPage
      title='Auditoría y Centro de Evidencia'
      description='Trazabilidad de operaciones privilegiadas y generación de reportes consolidados para el informe de laboratorio.'
    >
      <div className='grid gap-4 md:grid-cols-3 mb-4'>
        <Card className='md:col-span-2'>
          <CardHeader className='pb-3'>
            <div className='flex items-center gap-2'>
              <ShieldCheck className='h-5 w-5 text-emerald-500' />
              <CardTitle className='text-base'>Paquete Consolidado de Evidencia (Informe de Tesis/Laboratorio)</CardTitle>
            </div>
            <CardDescription>
              Exporta en un solo archivo el inventario de funciones de red, estado de servicios, interfaces y sockets del host, resultados de validación telco 3GPP, alarmas activas, metadatos de capturas PCAP y trazabilidad de comandos.
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-wrap items-center gap-3 pt-0'>
            <Button
              variant='default'
              size='sm'
              disabled={exporting !== null}
              onClick={() => exportEvidence('json')}
              className='gap-2'
            >
              <FileText className='h-4 w-4' />
              {exporting === 'json' ? 'Generando JSON...' : 'Descargar Evidencia (.json)'}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={exporting !== null}
              onClick={() => exportEvidence('csv')}
              className='gap-2'
            >
              <FileSpreadsheet className='h-4 w-4' />
              {exporting === 'csv' ? 'Generando CSV...' : 'Descargar Resumen (.csv)'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Protección de Privacidad</CardTitle>
          </CardHeader>
          <CardContent className='text-xs text-muted-foreground space-y-2'>
            <p>
              Ningún secreto ni clave criptográfica (Ki, OPc, contraseñas de MongoDB o tokens) se almacena en el registro de auditoría ni se incluye en los paquetes exportados.
            </p>
            <Badge variant='outline' className='text-[10px] text-emerald-600 dark:text-emerald-400'>
              ✓ Conforme a criterios de seguridad
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className='pb-3'>
          <div className='flex items-center justify-between'>
            <CardTitle className='text-base'>Registro de Operaciones</CardTitle>
            <Badge variant='secondary'>{query.data?.length ?? 0} eventos</Badge>
          </div>
        </CardHeader>
        <CardContent className='pt-0'>
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
                  <TableCell className='text-xs'>
                    {new Date(x.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className='font-medium text-xs'>{x.username}</TableCell>
                  <TableCell>
                    <Badge variant='outline' className='text-[10px] capitalize'>
                      {x.role}
                    </Badge>
                  </TableCell>
                  <TableCell className='font-mono text-xs text-primary'>
                    {x.action}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={x.result === 'success' ? 'default' : 'destructive'}
                      className='text-[10px]'
                    >
                      {x.result}
                    </Badge>
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
