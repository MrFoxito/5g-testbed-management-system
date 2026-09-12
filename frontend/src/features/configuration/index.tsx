import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Editor from '@monaco-editor/react'
import {
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Layers,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useScenarioStore } from '@/stores/scenario-store'
import {
  api,
  type ConfigFile,
  type ConfigValidationResult,
  type DeclaredConfig,
} from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmsPage } from '@/features/ems-page'

export function ConfigurationPage() {
  const scenario = useScenarioStore((state) => state.scenario)
  const [selectedFilePath, setSelectedFilePath] = useState<string>('')
  const [activeTab, setActiveTab] = useState('viewer')

  const filesQuery = useQuery({
    queryKey: ['config-catalog', scenario],
    queryFn: async () => {
      const resp = await api.get<ConfigFile[]>(`/config/catalog/${scenario}`)
      return resp.data
    },
  })

  const effectiveFilePath = selectedFilePath || filesQuery.data?.[0]?.path || ''
  const selectedFile = filesQuery.data?.find(
    (f) => f.path === effectiveFilePath
  )
  const selectedComponentId = selectedFile?.component_id
  const selectedPath = selectedFile?.path

  const contentQuery = useQuery({
    queryKey: ['config-declared', scenario, selectedComponentId, selectedPath],
    queryFn: async () => {
      if (!selectedComponentId || !selectedPath) return null
      const resp = await api.get<DeclaredConfig>(
        `/config/declared?scenario_id=${scenario}&component_id=${selectedComponentId}&path=${encodeURIComponent(selectedPath)}`
      )
      return resp.data
    },
    enabled: Boolean(selectedComponentId && selectedPath),
  })

  const validationQuery = useQuery({
    queryKey: ['config-validate', scenario],
    queryFn: async () => {
      const resp = await api.get<ConfigValidationResult>(
        `/config/validate/${scenario}`
      )
      return resp.data
    },
    enabled: activeTab === 'validation',
  })

  const handleRefresh = async () => {
    if (activeTab === 'viewer') {
      await contentQuery.refetch()
      toast.success('Configuración actualizada desde el testbed')
    } else {
      await validationQuery.refetch()
      toast.success('Validaciones telco reevaluadas')
    }
  }

  return (
    <EmsPage
      title='Configuration Center'
      description='Inspección segura de YAML remotos con ofuscación de secretos y validación cruzada 3GPP.'
    >
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className='space-y-4'
      >
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <TabsList className='grid w-full max-w-md grid-cols-2'>
            <TabsTrigger value='viewer' className='flex items-center gap-2'>
              <FileCode className='h-4 w-4' />
              Visor de Archivos (NF)
            </TabsTrigger>
            <TabsTrigger value='validation' className='flex items-center gap-2'>
              <SlidersHorizontal className='h-4 w-4' />
              Validación Telco & Baseline
            </TabsTrigger>
          </TabsList>
          <Button
            variant='outline'
            size='icon'
            onClick={handleRefresh}
            aria-label='Actualizar configuración'
          >
            <RefreshCw className='size-4' />
          </Button>
        </div>

        <TabsContent value='viewer' className='space-y-4'>
          <Card>
            <CardHeader className='pb-3'>
              <div className='flex flex-wrap items-center justify-between gap-4'>
                <div className='flex items-center gap-3'>
                  <span className='text-sm font-medium text-muted-foreground'>
                    Función / Archivo:
                  </span>
                  <Select
                    value={selectedFile?.path ?? ''}
                    onValueChange={(val) => setSelectedFilePath(val)}
                  >
                    <SelectTrigger className='w-80'>
                      <SelectValue placeholder='Seleccione configuración' />
                    </SelectTrigger>
                    <SelectContent>
                      {filesQuery.data?.map((item) => (
                        <SelectItem key={item.path} value={item.path}>
                          <span className='font-semibold'>
                            {item.component}
                          </span>{' '}
                          <span className='text-xs text-muted-foreground'>
                            ({item.path})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='flex flex-wrap items-center gap-2'>
                  {selectedFile && (
                    <Badge
                      variant='outline'
                      className='flex items-center gap-1 text-xs'
                    >
                      <Layers className='h-3 w-3' />
                      NF: {selectedFile.component}
                    </Badge>
                  )}
                  {contentQuery.data && (
                    <>
                      <Badge
                        variant={
                          contentQuery.data.redacted_fields > 0
                            ? 'secondary'
                            : 'outline'
                        }
                        className='flex items-center gap-1 border-emerald-500/30 text-xs text-emerald-500'
                      >
                        <ShieldCheck className='h-3 w-3' />
                        {contentQuery.data.redacted_fields > 0
                          ? `${contentQuery.data.redacted_fields} secreto(s) ocultado(s)`
                          : 'Sin secretos expuestos'}
                      </Badge>
                      <Badge
                        variant='outline'
                        className='font-mono text-[10px] text-muted-foreground'
                      >
                        SHA256: {contentQuery.data.sha256.slice(0, 10)}...
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className='p-0'>
              <div className='relative h-[600px] border-t'>
                {contentQuery.isLoading ? (
                  <div className='flex h-full items-center justify-center text-sm text-muted-foreground'>
                    Cargando configuración remota desde la VM...
                  </div>
                ) : contentQuery.isError ? (
                  <div className='flex h-full items-center justify-center text-sm text-destructive'>
                    No se pudo leer el archivo en la VM. Verifique que el
                    servicio esté instalado.
                  </div>
                ) : (
                  <Editor
                    theme='vs-dark'
                    language='yaml'
                    value={contentQuery.data?.content ?? ''}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='validation' className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-3'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Checks Aprobados
                </CardTitle>
                <CheckCircle2 className='h-4 w-4 text-emerald-500' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-emerald-500'>
                  {validationQuery.data?.summary.pass ?? 0}
                </div>
                <p className='text-xs text-muted-foreground'>
                  Parámetros y endpoints coincidentes
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Advertencias
                </CardTitle>
                <AlertTriangle className='h-4 w-4 text-amber-500' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-amber-500'>
                  {validationQuery.data?.summary.warning ?? 0}
                </div>
                <p className='text-xs text-muted-foreground'>
                  Parámetros faltantes o ausentes en archivo
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Errores de Coherencia
                </CardTitle>
                <XCircle className='h-4 w-4 text-destructive' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-bold text-destructive'>
                  {validationQuery.data?.summary.error ?? 0}
                </div>
                <p className='text-xs text-muted-foreground'>
                  Discrepancias entre NFs o puertos caídos
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                Comprobaciones de Coherencia 3GPP & Endpoints
              </CardTitle>
              <CardDescription>
                Validación cruzada de parámetros (MCC, MNC, TAC, DNN, S-NSSAI)
                entre NFs y verificación de sockets en escucha.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-28'>Estado</TableHead>
                    <TableHead className='w-40'>Categoría</TableHead>
                    <TableHead>Regla / Parámetro</TableHead>
                    <TableHead>Evidencia Observada</TableHead>
                    <TableHead className='w-32'>NFs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validationQuery.isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className='text-center text-muted-foreground'
                      >
                        Ejecutando validaciones en la VM...
                      </TableCell>
                    </TableRow>
                  ) : (
                    validationQuery.data?.checks.map((check) => (
                      <TableRow key={check.id}>
                        <TableCell>
                          {check.status === 'pass' && (
                            <Badge
                              variant='outline'
                              className='gap-1 border-emerald-500/30 text-emerald-500'
                            >
                              <CheckCircle2 className='h-3 w-3' /> Pass
                            </Badge>
                          )}
                          {check.status === 'warning' && (
                            <Badge
                              variant='outline'
                              className='gap-1 border-amber-500/30 text-amber-500'
                            >
                              <AlertTriangle className='h-3 w-3' /> Warning
                            </Badge>
                          )}
                          {check.status === 'error' && (
                            <Badge variant='destructive' className='gap-1'>
                              <XCircle className='h-3 w-3' /> Error
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className='font-mono text-xs text-muted-foreground uppercase'>
                            {check.category}
                          </span>
                        </TableCell>
                        <TableCell className='font-medium'>
                          {check.title}
                        </TableCell>
                        <TableCell className='font-mono text-xs text-muted-foreground'>
                          {check.evidence}
                        </TableCell>
                        <TableCell>
                          <div className='flex flex-wrap gap-1'>
                            {check.components.map((c) => (
                              <Badge
                                key={c}
                                variant='secondary'
                                className='text-[10px] uppercase'
                              >
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Diff contra Parámetros de Referencia (Baseline Esperado)
              </CardTitle>
              <CardDescription>
                Muestra diferencias unificadas entre los valores esperados por
                el curso y los valores observados en las configuraciones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className='h-48 overflow-auto rounded bg-muted/40 p-4 font-mono text-xs leading-relaxed'>
                {validationQuery.data?.baseline_diff ||
                  'No se han detectado discrepancias con el baseline.'}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </EmsPage>
  )
}
