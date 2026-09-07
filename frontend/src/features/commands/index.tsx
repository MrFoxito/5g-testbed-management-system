import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Copy,
  Database,
  Download,
  History,
  Network,
  Play,
  Radio,
  Search,
  Server,
  ShieldAlert,
  Smartphone,
  Terminal,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmsPage } from '@/features/ems-page'
import {
  formatTelcoReport,
  parseMmlCommand,
  toMmlSyntax,
} from './mml-formatter'
import type {
  ComponentOperations,
  OperationDefinition,
  OperationExecutePayload,
  OperationResult,
  OperationRun,
  OperationsCatalog,
} from './types'

type ScenarioId = '5g-sa' | '4g-epc'
type ResultTab = 'result' | 'history' | 'reference'

export function CommandsPage() {
  const queryClient = useQueryClient()
  const [scenario, setScenario] = useState<ScenarioId>('5g-sa')
  const [selectedComponentId, setSelectedComponentId] = useState('')
  const [selectedOperationId, setSelectedOperationId] = useState('')
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({})
  const [nodeSearch, setNodeSearch] = useState('')
  const [operationSearch, setOperationSearch] = useState('')
  const [expertMode, setExpertMode] = useState(false)
  const [commandInput, setCommandInput] = useState('')
  const [lastResult, setLastResult] = useState<OperationResult | null>(null)
  const [lastMmlCommand, setLastMmlCommand] = useState('')
  const [resultTab, setResultTab] = useState<ResultTab>('result')

  const catalogQuery = useQuery({
    queryKey: ['operations-catalog', scenario],
    queryFn: async () =>
      (await api.get<OperationsCatalog>(`/operations/catalog/${scenario}`)).data,
    refetchInterval: 15_000,
  })

  const historyQuery = useQuery({
    queryKey: ['operations-history', scenario],
    queryFn: async () =>
      (
        await api.get<OperationRun[]>(
          `/operations/history?scenario_id=${scenario}&limit=50`
        )
      ).data,
    refetchInterval: 10_000,
  })

  const components = useMemo(
    () => catalogQuery.data?.components ?? [],
    [catalogQuery.data?.components]
  )
  const currentComponent = useMemo(
    () =>
      components.find(
        (component) => component.id === selectedComponentId
      ) ??
      components.find((component) => component.id === 'gnb') ??
      components.find((component) => component.id === 'amf') ??
      components[0],
    [components, selectedComponentId]
  )
  const currentOperation = useMemo(
    () =>
      currentComponent?.operations.find(
        (operation) => operation.id === selectedOperationId
      ) ?? currentComponent?.operations[0],
    [currentComponent, selectedOperationId]
  )
  const effectiveParamValues = useMemo(
    () =>
      currentOperation
        ? { ...parameterDefaults(currentOperation), ...paramValues }
        : {},
    [currentOperation, paramValues]
  )

  const generatedCommand = useMemo(() => {
    if (!currentOperation || !currentComponent) return ''
    return stripEnvelope(
      toMmlSyntax(
        currentOperation,
        currentComponent.id,
        currentComponent.label,
        effectiveParamValues
      )
    )
  }, [currentComponent, currentOperation, effectiveParamValues])

  const executeMutation = useMutation({
    mutationFn: async (payload: OperationExecutePayload) =>
      (await api.post<OperationResult>('/operations/execute', payload)).data,
    onSuccess: (result, variables) => {
      const component = components.find(
        (item) => item.id === variables.component_id
      )
      const operation = component?.operations.find(
        (item) => item.id === variables.operation_id
      )
      const syntax = operation
        ? toMmlSyntax(
            operation,
            variables.component_id,
            component?.label ?? result.component_label,
            variables.parameters
          )
        : `%%${commandInput}%%`
      setLastResult(result)
      setLastMmlCommand(syntax)
      setResultTab('result')
      void queryClient.invalidateQueries({
        queryKey: ['operations-history', scenario],
      })
      toast.success('Operación completada', {
        description: `${result.component_label} · ${result.operation_label} · ${result.duration_ms} ms`,
      })
    },
    onError: (error) =>
      toast.error('No se pudo ejecutar la operación', {
        description: apiErrorMessage(error, 'El nodo rechazó el comando.'),
      }),
  })

  const handleExecute = () => {
    if (expertMode) {
      const parsed = parseMmlCommand(commandInput, catalogQuery.data)
      if (!parsed.success) {
        toast.error('Comando no válido', { description: parsed.error })
        return
      }
      setSelectedComponentId(parsed.componentId)
      setSelectedOperationId(parsed.operationId)
      setParamValues(parsed.parameters)
      executeMutation.mutate({
        scenario_id: scenario,
        component_id: parsed.componentId,
        operation_id: parsed.operationId,
        parameters: parsed.parameters,
      })
      return
    }

    if (!currentComponent || !currentOperation) return
    if (!currentOperation.allowed) {
      toast.error('Operación no autorizada para su rol')
      return
    }
    executeMutation.mutate({
      scenario_id: scenario,
      component_id: currentComponent.id,
      operation_id: currentOperation.id,
      parameters: effectiveParamValues,
    })
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === 'Enter' &&
        !executeMutation.isPending
      ) {
        event.preventDefault()
        handleExecute()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  })

  const visibleComponents = useMemo(() => {
    const query = nodeSearch.trim().toLowerCase()
    if (!query) return components
    return components.filter((component) =>
      [component.id, component.label, component.unit, component.node_id]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query))
    )
  }, [components, nodeSearch])

  const visibleOperations = useMemo(() => {
    const query = operationSearch.trim().toLowerCase()
    const operations = currentComponent?.operations ?? []
    if (!query) return operations
    return operations.filter((operation) =>
      [
        operation.id,
        operation.label,
        operation.description,
        operation.category,
        operationCode(operation, currentComponent),
      ].some((value) => value.toLowerCase().includes(query))
    )
  }, [currentComponent, operationSearch])

  const groupedOperations = useMemo(
    () => groupOperations(visibleOperations),
    [visibleOperations]
  )
  const totalOperations = components.reduce(
    (total, component) => total + component.operations.length,
    0
  )

  const copyResult = () => {
    if (!lastResult) return
    void navigator.clipboard.writeText(
      formatTelcoReport(lastResult, lastMmlCommand)
    )
    toast.success('Resultado copiado')
  }

  const downloadResult = () => {
    if (!lastResult) return
    const content = formatTelcoReport(lastResult, lastMmlCommand)
    const url = URL.createObjectURL(
      new Blob([content], { type: 'text/plain;charset=utf-8' })
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `command_${lastResult.component_id}_${lastResult.id.slice(0, 8)}.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const loadHistory = (run: OperationRun) => {
    const component = components.find((item) => item.id === run.component_id)
    const operation = component?.operations.find(
      (item) => item.id === run.operation_id
    )
    setSelectedComponentId(run.component_id)
    setSelectedOperationId(run.operation_id)
    setParamValues(run.parameters)
    setLastResult(run)
    if (component && operation) {
      const syntax = toMmlSyntax(
        operation,
        component.id,
        component.label,
        run.parameters
      )
      setLastMmlCommand(syntax)
      setCommandInput(stripEnvelope(syntax))
    }
    setResultTab('result')
  }

  return (
    <EmsPage
      title='Centro de Comandos'
      description='Operaciones controladas sobre funciones de red, RAN y equipos de usuario.'
      actions={
        <div className='flex items-center gap-2'>
          <Badge variant='outline' className='h-9 gap-2 px-3 font-mono text-xs'>
            <span className='size-1.5 rounded-full bg-emerald-500' />
            {catalogQuery.data?.execution_mode?.toUpperCase() ?? 'CARGANDO'}
          </Badge>
          <Select
            value={scenario}
            onValueChange={(value) => {
              setScenario(value as ScenarioId)
              setSelectedComponentId('')
              setSelectedOperationId('')
              setParamValues({})
              setLastResult(null)
              setExpertMode(false)
            }}
          >
            <SelectTrigger className='w-44'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='5g-sa'>5G Standalone</SelectItem>
              <SelectItem value='4g-epc'>4G EPC</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      {catalogQuery.error && (
        <Alert variant='destructive'>
          <AlertTitle>No se pudo cargar el catálogo operativo</AlertTitle>
          <AlertDescription>
            {apiErrorMessage(
              catalogQuery.error,
              'Verifique el backend y el testbed.'
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card className='min-h-[720px] overflow-hidden p-0'>
        <div className='grid min-h-[720px] grid-cols-1 xl:grid-cols-[260px_310px_minmax(0,1fr)]'>
          <section className='flex min-h-0 flex-col border-b bg-muted/10 xl:border-r xl:border-b-0'>
            <PanelHeader
              step='01'
              title='Elemento de red'
              detail={`${components.length} nodos disponibles`}
            />
            <div className='border-b p-3'>
              <SearchInput
                value={nodeSearch}
                onChange={setNodeSearch}
                placeholder='Buscar nodo o servicio'
                label='Buscar elementos de red'
              />
            </div>
            <ScrollArea className='h-[260px] flex-1 xl:h-auto'>
              <div className='space-y-1 p-2'>
                {catalogQuery.isLoading && !components.length ? (
                  <LoadingRows count={8} />
                ) : (
                  visibleComponents.map((component) => (
                    <NodeButton
                      key={component.id}
                      component={component}
                      selected={component.id === currentComponent?.id}
                      onSelect={() => {
                        setSelectedComponentId(component.id)
                        setSelectedOperationId('')
                        setParamValues({})
                        setOperationSearch('')
                        setExpertMode(false)
                      }}
                    />
                  ))
                )}
                {!catalogQuery.isLoading && !visibleComponents.length && (
                  <EmptyList text='No hay nodos que coincidan con la búsqueda.' />
                )}
              </div>
            </ScrollArea>
          </section>

          <section className='flex min-h-0 flex-col border-b xl:border-r xl:border-b-0'>
            <PanelHeader
              step='02'
              title='Operación'
              detail={
                currentComponent
                  ? `${currentComponent.operations.length} comandos para ${currentComponent.label}`
                  : `${totalOperations} comandos disponibles`
              }
            />
            <div className='border-b p-3'>
              <SearchInput
                value={operationSearch}
                onChange={setOperationSearch}
                placeholder='Buscar operación o código'
                label='Buscar operaciones'
              />
            </div>
            <ScrollArea className='h-[300px] flex-1 xl:h-auto'>
              <div className='space-y-4 p-2'>
                {groupedOperations.map(([category, operations]) => (
                  <div key={category}>
                    <p className='px-2 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase'>
                      {category}
                    </p>
                    <div className='space-y-1'>
                      {operations.map((operation) => (
                        <OperationButton
                          key={operation.id}
                          operation={operation}
                          code={operationCode(operation, currentComponent)}
                          selected={operation.id === currentOperation?.id}
                          onSelect={() => {
                            setSelectedOperationId(operation.id)
                            setParamValues(parameterDefaults(operation))
                            setExpertMode(false)
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {currentComponent && !visibleOperations.length && (
                  <EmptyList text='No hay operaciones que coincidan con la búsqueda.' />
                )}
                {!currentComponent && (
                  <EmptyList text='Seleccione primero un elemento de red.' />
                )}
              </div>
            </ScrollArea>
          </section>

          <section className='flex min-w-0 flex-col bg-background'>
            <PanelHeader
              step='03'
              title='Ejecución y resultado'
              detail='Parámetros validados y registro de auditoría'
              right={
                <div className='flex items-center gap-1'>
                  <Button
                    variant={resultTab === 'reference' ? 'secondary' : 'ghost'}
                    size='sm'
                    className='h-8 text-xs'
                    onClick={() => setResultTab('reference')}
                    disabled={!currentComponent}
                  >
                    <BookOpen className='size-3.5' />
                    Referencia
                  </Button>
                  <Button
                    variant={expertMode ? 'secondary' : 'ghost'}
                    size='sm'
                    className='h-8 text-xs'
                    onClick={() => {
                      if (!expertMode) setCommandInput(generatedCommand)
                      setExpertMode((current) => !current)
                    }}
                    disabled={!currentOperation}
                  >
                    <Terminal className='size-3.5' />
                    {expertMode ? 'Cerrar modo experto' : 'Modo experto'}
                  </Button>
                </div>
              }
            />

            <div className='space-y-4 border-b p-5'>
              {currentComponent && currentOperation ? (
                <>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Badge variant='outline' className='font-mono'>
                          {currentComponent.id.toUpperCase()}
                        </Badge>
                        <h2 className='text-lg font-semibold'>
                          {currentOperation.label}
                        </h2>
                        <Badge
                          variant={
                            currentOperation.mutating
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {currentOperation.mutating ? 'Cambio' : 'Consulta'}
                        </Badge>
                      </div>
                      <p className='mt-1 max-w-3xl text-sm text-muted-foreground'>
                        {currentOperation.description}
                      </p>
                    </div>
                    <Button
                      onClick={handleExecute}
                      disabled={
                        executeMutation.isPending || !currentOperation.allowed
                      }
                      className='min-w-32'
                    >
                      <Play
                        className={cn(
                          'size-4',
                          executeMutation.isPending && 'animate-pulse'
                        )}
                      />
                      {executeMutation.isPending ? 'Ejecutando' : 'Ejecutar'}
                    </Button>
                  </div>

                  <div className='grid gap-3 rounded-lg border bg-muted/10 p-3 sm:grid-cols-3'>
                    <ContextItem label='Destino' value={currentComponent.label} />
                    <ContextItem
                      label='Servicio'
                      value={currentComponent.unit}
                      mono
                    />
                    <ContextItem
                      label='Estado'
                      value={statusLabel(currentComponent.status)}
                      status={currentComponent.status}
                    />
                  </div>

                  {!!currentOperation.parameters.length && (
                    <div>
                      <p className='mb-2 text-xs font-semibold tracking-wide uppercase'>
                        Parámetros
                      </p>
                      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                        {currentOperation.parameters.map((parameter) => (
                          <ParameterField
                            key={parameter.id}
                            parameter={parameter}
                            value={effectiveParamValues[parameter.id]}
                            onChange={(value) =>
                              setParamValues((current) => ({
                                ...current,
                                [parameter.id]: value,
                              }))
                            }
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {currentOperation.mutating && (
                    <Alert>
                      <ShieldAlert className='size-4' />
                      <AlertTitle>Operación con cambio de estado</AlertTitle>
                      <AlertDescription>
                        El backend limitará el alcance al nodo seleccionado y
                        registrará operador, parámetros y resultado.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div>
                    <div className='mb-2 flex items-center justify-between'>
                      <Label
                        htmlFor='command-line'
                        className='text-xs font-semibold'
                      >
                        {expertMode
                          ? 'Línea de comando editable'
                          : 'Comando generado'}
                      </Label>
                      <span className='text-[10px] text-muted-foreground'>
                        Ctrl + Enter para ejecutar
                      </span>
                    </div>
                    <div className='flex items-center rounded-md border border-zinc-800 bg-zinc-950 px-3'>
                      <span className='mr-2 font-mono text-xs text-emerald-400'>
                        EMS&gt;
                      </span>
                      <Input
                        id='command-line'
                        value={expertMode ? commandInput : generatedCommand}
                        readOnly={!expertMode}
                        onChange={(event) => setCommandInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') handleExecute()
                        }}
                        className='h-10 border-0 bg-transparent px-0 font-mono text-xs text-zinc-200 shadow-none focus-visible:ring-0'
                        spellCheck={false}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <EmptyWorkspace />
              )}
            </div>

            <Tabs
              value={resultTab}
              onValueChange={(value) => setResultTab(value as ResultTab)}
              className='flex min-h-[300px] flex-1 flex-col gap-0'
            >
              <div className='flex flex-wrap items-center justify-between gap-2 border-b bg-muted/10 px-4 py-2'>
                <TabsList className='h-8'>
                  <TabsTrigger value='result' className='text-xs'>
                    <Terminal className='size-3.5' /> Resultado
                  </TabsTrigger>
                  <TabsTrigger value='history' className='text-xs'>
                    <History className='size-3.5' /> Historial
                    <span className='text-muted-foreground'>
                      {historyQuery.data?.length ?? 0}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value='reference' className='text-xs'>
                    <BookOpen className='size-3.5' /> Referencia
                  </TabsTrigger>
                </TabsList>
                <div className='flex items-center gap-1'>
                  {lastResult && (
                    <Badge
                      variant='outline'
                      className={cn(
                        'mr-2 font-mono text-[10px]',
                        lastResult.status === 'success'
                          ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                          : 'border-destructive/40 text-destructive'
                      )}
                    >
                      RETCODE {lastResult.status === 'success' ? '0' : '1'}
                    </Badge>
                  )}
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 text-xs'
                    onClick={copyResult}
                    disabled={!lastResult}
                  >
                    <Copy className='size-3.5' /> Copiar
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 text-xs'
                    onClick={downloadResult}
                    disabled={!lastResult}
                  >
                    <Download className='size-3.5' /> Exportar
                  </Button>
                </div>
              </div>

              <TabsContent value='result' className='m-0 min-h-0 flex-1'>
                <CommandResult result={lastResult} command={lastMmlCommand} />
              </TabsContent>
              <TabsContent value='history' className='m-0 min-h-0 flex-1'>
                <CommandHistory
                  runs={historyQuery.data ?? []}
                  loading={historyQuery.isLoading}
                  onLoad={loadHistory}
                />
              </TabsContent>
              <TabsContent value='reference' className='m-0 min-h-0 flex-1'>
                <CommandReference component={currentComponent} />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </Card>
    </EmsPage>
  )
}

function PanelHeader({
  step,
  title,
  detail,
  right,
}: {
  step: string
  title: string
  detail: string
  right?: React.ReactNode
}) {
  return (
    <header className='flex min-h-16 items-center justify-between gap-2 border-b px-4 py-3'>
      <div className='min-w-0'>
        <div className='flex items-center gap-2'>
          <span className='font-mono text-[10px] font-semibold text-primary'>
            {step}
          </span>
          <h2 className='truncate text-sm font-semibold'>{title}</h2>
        </div>
        <p className='mt-0.5 truncate text-[11px] text-muted-foreground'>
          {detail}
        </p>
      </div>
      {right}
    </header>
  )
}

function CommandReference({
  component,
}: {
  component?: ComponentOperations
}) {
  if (!component) return <EmptyList text='Seleccione un elemento de red.' />

  return (
    <ScrollArea className='h-[300px]'>
      <div className='space-y-5 p-5'>
        <div>
          <h3 className='text-sm font-semibold'>Referencia operativa</h3>
          <p className='mt-1 text-xs text-muted-foreground'>
            Sintaxis controlada del EMS para {component.label}. Cada código se
            traduce a una operación validada del backend; no abre una terminal
            Linux libre.
          </p>
        </div>

        <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
          {[
            ['DSP', 'Mostrar estado o información'],
            ['LST', 'Listar registros o contexto'],
            ['CHK', 'Verificar conectividad'],
            ['RST', 'Reiniciar de forma controlada'],
          ].map(([prefix, description]) => (
            <div key={prefix} className='rounded-md border bg-muted/10 p-3'>
              <p className='font-mono text-xs font-semibold text-primary'>
                {prefix}
              </p>
              <p className='mt-1 text-[11px] text-muted-foreground'>
                {description}
              </p>
            </div>
          ))}
        </div>

        <div className='rounded-md border'>
          <div className='border-b bg-muted/20 px-3 py-2'>
            <p className='text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase'>
              Operaciones de {component.label}
            </p>
          </div>
          <div className='divide-y'>
            {component.operations.map((operation) => (
              <div
                key={operation.id}
                className='grid gap-1 px-3 py-2.5 sm:grid-cols-[180px_1fr] sm:gap-4'
              >
                <code className='text-[11px] font-semibold text-primary'>
                  {operationCode(operation, component)}
                </code>
                <div>
                  <p className='text-xs font-medium'>{operation.label}</p>
                  <p className='text-[11px] text-muted-foreground'>
                    {operation.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200'>
          <span className='text-emerald-400'>Formato:</span>{' '}
          VERBO OBJETO: PARAMETRO=&quot;valor&quot;;
        </div>
      </div>
    </ScrollArea>
  )
}

function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  return (
    <div className='relative'>
      <Search className='absolute top-2.5 left-2.5 size-4 text-muted-foreground' />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className='h-9 pl-8 text-xs'
      />
    </div>
  )
}

function NodeButton({
  component,
  selected,
  onSelect,
}: {
  component: ComponentOperations
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-primary/20 bg-primary/10 text-foreground'
          : 'hover:border-border hover:bg-muted/50'
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md border bg-background',
          selected && 'border-primary/30 text-primary'
        )}
      >
        {componentIcon(component)}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='flex items-center gap-2'>
          <span className='truncate text-sm font-medium'>{component.label}</span>
          <span
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              component.status === 'running'
                ? 'bg-emerald-500'
                : component.status === 'stopped'
                  ? 'bg-destructive'
                  : 'bg-amber-500'
            )}
            aria-label={statusLabel(component.status)}
          />
        </span>
        <span className='block truncate font-mono text-[10px] text-muted-foreground'>
          {component.id.toUpperCase()} · {component.operations.length} operaciones
        </span>
      </span>
      <ChevronRight
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-transform',
          selected && 'translate-x-0.5 text-primary'
        )}
      />
    </button>
  )
}

function OperationButton({
  operation,
  code,
  selected,
  onSelect,
}: {
  operation: OperationDefinition
  code: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      disabled={!operation.allowed}
      className={cn(
        'flex w-full items-start gap-2 rounded-md border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-primary/30 bg-primary/10'
          : 'border-transparent hover:border-border hover:bg-muted/40',
        !operation.allowed && 'cursor-not-allowed opacity-50'
      )}
    >
      {operation.mutating ? (
        <Wrench className='mt-0.5 size-3.5 shrink-0 text-amber-500' />
      ) : (
        <Activity className='mt-0.5 size-3.5 shrink-0 text-sky-500' />
      )}
      <span className='min-w-0 flex-1'>
        <span className='block truncate font-mono text-[10px] font-semibold text-primary'>
          {code}
        </span>
        <span className='mt-0.5 block truncate text-xs'>{operation.label}</span>
      </span>
    </button>
  )
}

function ParameterField({
  parameter,
  value,
  onChange,
}: {
  parameter: OperationDefinition['parameters'][number]
  value: unknown
  onChange: (value: unknown) => void
}) {
  return (
    <div className='space-y-1.5'>
      <Label className='text-xs'>
        {parameter.label}
        {parameter.required && <span className='ml-1 text-destructive'>*</span>}
      </Label>
      {parameter.type === 'select' ? (
        <Select
          value={String(value ?? parameter.default ?? '')}
          onValueChange={(next) => {
            const option = parameter.options?.find(
              (item) => String(item.value) === next
            )
            onChange(option?.value ?? next)
          }}
        >
          <SelectTrigger className='h-9 text-xs'>
            <SelectValue placeholder='Seleccione un valor' />
          </SelectTrigger>
          <SelectContent>
            {parameter.options?.map((option) => (
              <SelectItem key={String(option.value)} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type={parameter.type === 'number' ? 'number' : 'text'}
          min={parameter.minimum}
          max={parameter.maximum}
          value={String(value ?? parameter.default ?? '')}
          onChange={(event) =>
            onChange(
              parameter.type === 'number'
                ? Number(event.target.value)
                : event.target.value
            )
          }
          className='h-9 text-xs'
        />
      )}
      {parameter.description && (
        <p className='text-[10px] text-muted-foreground'>
          {parameter.description}
        </p>
      )}
    </div>
  )
}

function ContextItem({
  label,
  value,
  mono,
  status,
}: {
  label: string
  value: string
  mono?: boolean
  status?: string
}) {
  return (
    <div className='min-w-0'>
      <p className='text-[10px] font-semibold tracking-wide text-muted-foreground uppercase'>
        {label}
      </p>
      <div className='mt-1 flex items-center gap-2'>
        {status && (
          <span
            className={cn(
              'size-1.5 rounded-full',
              status === 'running' ? 'bg-emerald-500' : 'bg-amber-500'
            )}
          />
        )}
        <p className={cn('truncate text-xs font-medium', mono && 'font-mono')}>
          {value}
        </p>
      </div>
    </div>
  )
}

function CommandResult({
  result,
  command,
}: {
  result: OperationResult | null
  command: string
}) {
  if (!result) {
    return (
      <div className='flex h-full min-h-72 items-center justify-center p-8 text-center'>
        <div className='max-w-sm'>
          <Terminal className='mx-auto size-8 text-muted-foreground/50' />
          <p className='mt-3 text-sm font-medium'>Sin resultados todavía</p>
          <p className='mt-1 text-xs text-muted-foreground'>
            Seleccione un nodo y una operación. El resultado aparecerá aquí sin
            abandonar la vista.
          </p>
        </div>
      </div>
    )
  }
  return (
    <ScrollArea className='h-[300px] xl:h-full'>
      <div className='space-y-3 p-4'>
        <div className='grid gap-3 rounded-md border bg-muted/10 p-3 sm:grid-cols-4'>
          <ContextItem
            label='Resultado'
            value={result.status === 'success' ? 'Exitoso' : 'Fallido'}
          />
          <ContextItem label='Fuente' value={result.source} mono />
          <ContextItem label='Duración' value={`${result.duration_ms} ms`} mono />
          <ContextItem
            label='Operador'
            value={`${result.username} · ${result.role}`}
          />
        </div>
        <pre className='min-h-48 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-300'>
          {formatTelcoReport(result, command)}
        </pre>
      </div>
    </ScrollArea>
  )
}

function CommandHistory({
  runs,
  loading,
  onLoad,
}: {
  runs: OperationRun[]
  loading: boolean
  onLoad: (run: OperationRun) => void
}) {
  return (
    <ScrollArea className='h-[300px] xl:h-full'>
      <div className='divide-y'>
        {loading && !runs.length ? (
          <LoadingRows count={4} />
        ) : (
          runs.map((run) => (
            <button
              type='button'
              key={run.id}
              onClick={() => onLoad(run)}
              className='flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40'
            >
              {run.status === 'success' ? (
                <CheckCircle2 className='size-4 shrink-0 text-emerald-500' />
              ) : (
                <ShieldAlert className='size-4 shrink-0 text-destructive' />
              )}
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-xs font-medium'>
                  {run.component_label} · {run.operation_label}
                </span>
                <span className='block truncate text-[10px] text-muted-foreground'>
                  {new Date(run.started_at).toLocaleString()} · {run.username} ·{' '}
                  {run.duration_ms} ms
                </span>
              </span>
              <Badge variant='outline' className='font-mono text-[9px]'>
                {run.id.slice(0, 8)}
              </Badge>
            </button>
          ))
        )}
        {!loading && !runs.length && (
          <EmptyList text='Todavía no se han ejecutado operaciones en este escenario.' />
        )}
      </div>
    </ScrollArea>
  )
}

function EmptyWorkspace() {
  return (
    <div className='flex min-h-64 items-center justify-center text-center'>
      <div className='max-w-xs'>
        <Network className='mx-auto size-8 text-muted-foreground/50' />
        <p className='mt-3 text-sm font-medium'>Seleccione un elemento de red</p>
        <p className='mt-1 text-xs text-muted-foreground'>
          Luego elija una operación para configurar sus parámetros y ejecutarla.
        </p>
      </div>
    </div>
  )
}

function EmptyList({ text }: { text: string }) {
  return <p className='p-6 text-center text-xs text-muted-foreground'>{text}</p>
}

function LoadingRows({ count }: { count: number }) {
  return (
    <div className='space-y-2 p-2'>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className='h-12 animate-pulse rounded-md bg-muted' />
      ))}
    </div>
  )
}

function parameterDefaults(operation: OperationDefinition) {
  const defaults: Record<string, unknown> = {}
  for (const parameter of operation.parameters) {
    if (parameter.default !== undefined)
      defaults[parameter.id] = parameter.default
    else if (parameter.options?.length)
      defaults[parameter.id] = parameter.options[0].value
  }
  return defaults
}

function groupOperations(operations: OperationDefinition[]) {
  const groups = new Map<string, OperationDefinition[]>()
  for (const operation of operations) {
    const current = groups.get(operation.category) ?? []
    current.push(operation)
    groups.set(operation.category, current)
  }
  return [...groups.entries()]
}

function operationCode(
  operation: OperationDefinition,
  component?: ComponentOperations
) {
  if (!component) return operation.id.toUpperCase()
  return stripEnvelope(
    toMmlSyntax(operation, component.id, component.label, {})
  ).split(':')[0]
}

function stripEnvelope(value: string) {
  return value.replace(/^%%/, '').replace(/%%$/, '')
}

function statusLabel(status?: string) {
  if (status === 'running') return 'Operativo'
  if (status === 'stopped') return 'Detenido'
  if (status === 'degraded') return 'Degradado'
  return status || 'Desconocido'
}

function componentIcon(component: ComponentOperations) {
  if (component.id === 'ue') return <Smartphone className='size-4' />
  if (component.id === 'gnb' || component.id === 'enb')
    return <Radio className='size-4' />
  if (component.kind === 'database') return <Database className='size-4' />
  if (component.kind === 'host') return <Network className='size-4' />
  return <Server className='size-4' />
}
