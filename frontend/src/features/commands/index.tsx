import { useEffect, useMemo, useRef, useState } from 'react'
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
  List,
  SlidersHorizontal,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
type ResultTab = 'result' | 'history'

export function CommandsPage() {
  const queryClient = useQueryClient()
  const searchParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  )
  const initialNode =
    searchParams.get('component') || searchParams.get('node') || ''

  const [scenario, setScenario] = useState<ScenarioId>('5g-sa')
  const [selectedComponentId, setSelectedComponentId] = useState(initialNode)
  const [selectedOperationId, setSelectedOperationId] = useState('')
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({})
  const [nodeSearch, setNodeSearch] = useState('')
  const [operationSearch, setOperationSearch] = useState('')
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [parametersOpen, setParametersOpen] = useState(false)
  const [confirmation, setConfirmation] =
    useState<OperationExecutePayload | null>(null)
  const executionLock = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [commandInput, setCommandInput] = useState('')
  const [lastResult, setLastResult] = useState<OperationResult | null>(null)
  const [lastMmlCommand, setLastMmlCommand] = useState('')
  const [resultTab, setResultTab] = useState<ResultTab>('result')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const suggestionsContainerRef = useRef<HTMLDivElement>(null)

  const catalogQuery = useQuery({
    queryKey: ['operations-catalog', scenario],
    queryFn: async () =>
      (await api.get<OperationsCatalog>(`/operations/catalog/${scenario}`))
        .data,
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
      components.find((component) => component.id === selectedComponentId) ??
      components.find((component) => component.id === 'gnb') ??
      components.find((component) => component.id === 'amf') ??
      components[0],
    [components, selectedComponentId]
  )
  const currentOperation = useMemo(
    () =>
      currentComponent?.operations.find(
        (operation) => operation.id === selectedOperationId
      ),
    [currentComponent, selectedOperationId]
  )
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
      toast[result.status === 'success' ? 'success' : 'error'](
        result.status === 'success'
          ? 'Operación completada'
          : 'Operación fallida',
        {
          description: `${result.component_label} · ${result.operation_label} · ${result.duration_ms} ms`,
        }
      )
    },
    onSettled: () => {
      executionLock.current = false
    },
    onError: (error) =>
      toast.error('No se pudo ejecutar la operación', {
        description: apiErrorMessage(error, 'El nodo rechazó el comando.'),
      }),
  })

  const submit = (payload: OperationExecutePayload) => {
    if (executionLock.current) return
    executionLock.current = true
    setConfirmation(null)
    executeMutation.mutate(payload)
  }

  const handleExecute = () => {
    if (
      executionLock.current ||
      confirmation ||
      manualOpen ||
      catalogOpen ||
      !currentComponent ||
      catalogQuery.isError
    )
      return
    let input = stripEnvelope(commandInput.trim()).replace(/;$/, '').trim()
    if (!input) return
    // An omitted NF means the selected destination; an explicit different NF is rejected.
    if (!/(?:^|[:,])\s*NF\s*=/i.test(input)) {
      input += input.includes(':') ? (input.endsWith(':') ? ' ' : ', ') : ': '
      input += 'NF="' + currentComponent.id + '"'
    }
    const parsed = parseMmlCommand(input + ';', catalogQuery.data)
    if (!parsed.success) {
      toast.error('Comando no válido', { description: parsed.error })
      return
    }
    if (parsed.componentId !== currentComponent.id) {
      toast.error('El destino del comando no coincide con el nodo seleccionado')
      return
    }
    const operation = currentComponent.operations.find(
      (item) => item.id === parsed.operationId
    )
    if (!operation?.allowed) {
      toast.error('Operación no autorizada para su rol')
      return
    }
    setSelectedOperationId(operation.id)
    setParamValues(parsed.parameters)
    const payload: OperationExecutePayload = {
      scenario_id: scenario,
      component_id: currentComponent.id,
      operation_id: operation.id,
      parameters: parsed.parameters,
    }
    if (operation.mutating) setConfirmation(payload)
    else submit(payload)
  }

  const chooseOperation = (
    operation: OperationDefinition,
    targetComponent?: ComponentOperations
  ) => {
    const comp = targetComponent ?? currentComponent
    if (!comp) return
    if (comp.id !== currentComponent?.id) {
      setSelectedComponentId(comp.id)
    }
    const defaults = parameterDefaults(operation)
    setSelectedOperationId(operation.id)
    setParamValues(defaults)
    setCommandInput(
      stripEnvelope(
        toMmlSyntax(
          operation,
          comp.id,
          comp.label,
          defaults
        )
      )
    )
    setParametersOpen(operation.parameters.length > 0)
    setCatalogOpen(false)
    setShowSuggestions(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const allMmlSuggestions = useMemo(() => {
    const list: {
      code: string
      syntax: string
      operation: OperationDefinition
      component: ComponentOperations
      isCurrentNode: boolean
    }[] = []

    for (const comp of components) {
      for (const op of comp.operations) {
        const code = operationCode(op, comp)
        const defaults = parameterDefaults(op)
        const syntax = stripEnvelope(
          toMmlSyntax(op, comp.id, comp.label, defaults)
        )
        list.push({
          code,
          syntax,
          operation: op,
          component: comp,
          isCurrentNode: comp.id === currentComponent?.id,
        })
      }
    }
    return list
  }, [components, currentComponent])

  const suggestions = useMemo(() => {
    const raw = commandInput.trim()
    if (!raw) return []
    const cleanQuery = raw
      .replace(/^%%/, '')
      .replace(/;$/, '')
      .trim()
      .toUpperCase()
    if (!cleanQuery) return []

    const tokens = cleanQuery.split(/\s+/).filter(Boolean)

    const matches = allMmlSuggestions.filter((item) => {
      const targetText = `${item.code} ${item.syntax} ${item.operation.label} ${item.component.id} ${item.component.label} ${item.operation.id}`.toUpperCase()
      return tokens.every((token) => targetText.includes(token))
    })

    return matches
      .sort((a, b) => {
        if (a.isCurrentNode && !b.isCurrentNode) return -1
        if (!a.isCurrentNode && b.isCurrentNode) return 1

        const aStarts = a.code.toUpperCase().startsWith(cleanQuery)
        const bStarts = b.code.toUpperCase().startsWith(cleanQuery)
        if (aStarts && !bStarts) return -1
        if (!aStarts && bStarts) return 1

        return a.code.localeCompare(b.code)
      })
      .slice(0, 8)
  }, [commandInput, allMmlSuggestions])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        suggestionsContainerRef.current &&
        !suggestionsContainerRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

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
  const copyResult = () => {
    if (!lastResult) return
    void navigator.clipboard
      .writeText(formatTelcoReport(lastResult, lastMmlCommand))
      .then(() => toast.success('Resultado copiado'))
      .catch(() => toast.error('No se pudo copiar el resultado'))
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
      title='Comandos'
      description=''
      actions={
        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline' className='font-mono text-xs'>
            {catalogQuery.data?.execution_mode?.toUpperCase() ?? '—'}
          </Badge>
          <Select
            value={scenario}
            disabled={executeMutation.isPending}
            onValueChange={(value) => {
              setScenario(value as ScenarioId)
              setSelectedComponentId('')
              setSelectedOperationId('')
              setParamValues({})
              setCommandInput('')
              setLastResult(null)
              setParametersOpen(false)
              setResultTab('result')
            }}
          >
            <SelectTrigger className='w-40' aria-label='Escenario'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='5g-sa'>5G Standalone</SelectItem>
              <SelectItem value='4g-epc'>4G EPC</SelectItem>
            </SelectContent>
          </Select>
          <Button variant='outline' onClick={() => setManualOpen(true)}>
            <BookOpen className='size-4' />
            Manual
          </Button>
        </div>
      }
    >
      {catalogQuery.error && (
        <Alert variant='destructive' className='mb-3'>
          <AlertTitle>Catálogo no disponible</AlertTitle>
          <AlertDescription>
            {apiErrorMessage(
              catalogQuery.error,
              'Verifique la conexión con el backend.'
            )}
          </AlertDescription>
        </Alert>
      )}
      <Card className='overflow-hidden p-0 mb-6'>
        <div className='grid h-[calc(100dvh-215px)] min-h-[520px] grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)]'>
          <aside className='flex min-h-0 flex-col border-b md:border-r md:border-b-0'>
            <div className='flex items-center justify-between border-b px-3 py-2 text-xs font-semibold'>
              Elementos de red{' '}
              <span className='font-mono text-muted-foreground'>
                {components.length}
              </span>
            </div>
            <div className='p-2'>
              <SearchInput
                value={nodeSearch}
                onChange={setNodeSearch}
                placeholder='Buscar NF…'
                label='Buscar elementos de red'
              />
            </div>
            <div className='max-h-40 flex-1 overflow-y-auto px-2 pb-2 md:max-h-none'>
              {catalogQuery.isLoading ? (
                <LoadingRows count={6} />
              ) : (
                visibleComponents.map((component) => (
                  <NodeButton
                    key={component.id}
                    component={component}
                    selected={component.id === currentComponent?.id}
                    onSelect={() => {
                      if (executeMutation.isPending) return
                      setSelectedComponentId(component.id)
                      setSelectedOperationId('')
                      setParamValues({})
                      setCommandInput('')
                      setParametersOpen(false)
                      setOperationSearch('')
                      inputRef.current?.focus()
                    }}
                  />
                ))
              )}
              {!catalogQuery.isLoading && !visibleComponents.length && (
                <EmptyList text='Sin coincidencias' />
              )}
            </div>
          </aside>
          <section className='flex min-h-0 min-w-0 flex-col'>
            <div className='shrink-0 space-y-2 border-b bg-muted/10 p-3'>
              <div className='flex items-center justify-between gap-2'>
                <div className='flex min-w-0 items-center gap-2 text-xs'>
                  <span className='font-semibold'>
                    {currentComponent?.label ?? 'Sin destino'}
                  </span>
                  <span className='truncate font-mono text-muted-foreground'>
                    {currentComponent?.unit}
                  </span>
                </div>
                <div className='flex items-center gap-1'>
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={!currentComponent || executeMutation.isPending}
                    onClick={() => {
                      setOperationSearch('')
                      setCatalogOpen(true)
                    }}
                  >
                    <List className='size-3.5' />
                    Catálogo
                  </Button>
                  <Button
                    variant={parametersOpen ? 'secondary' : 'ghost'}
                    size='sm'
                    disabled={
                      !currentOperation?.parameters.length ||
                      !commandInput ||
                      executeMutation.isPending
                    }
                    onClick={() => setParametersOpen((value) => !value)}
                  >
                    <SlidersHorizontal className='size-3.5' />
                    Parámetros
                  </Button>
                </div>
              </div>
              <div className='relative'>
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    ref={suggestionsContainerRef}
                    className='absolute top-full left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-lg border border-border/80 bg-popover/95 backdrop-blur-sm text-popover-foreground shadow-2xl animate-in fade-in-0 zoom-in-95 duration-100'
                  >
                    <div className='flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-1.5 text-[10px] text-muted-foreground'>
                      <div className='flex items-center gap-1.5 font-medium'>
                        <Terminal className='size-3 text-primary' />
                        <span>Sugerencias MML ({suggestions.length})</span>
                      </div>
                      <span className='font-mono text-[9px] text-muted-foreground/80'>
                        ↑ ↓ navegar · Tab o ↵ autocompletar · Esc cerrar
                      </span>
                    </div>
                    <div className='max-h-56 overflow-y-auto p-1 divide-y divide-border/20'>
                      {suggestions.map((item, idx) => (
                        <button
                          key={`${item.component.id}-${item.operation.id}-${idx}`}
                          type='button'
                          className={cn(
                            'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors font-mono',
                            idx === activeSuggestionIndex
                              ? 'bg-primary text-primary-foreground font-semibold'
                              : 'hover:bg-muted/70 text-foreground'
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            chooseOperation(item.operation, item.component)
                          }}
                          onMouseEnter={() => setActiveSuggestionIndex(idx)}
                        >
                          <div className='flex items-center gap-2 min-w-0 flex-1 text-xs'>
                            <Badge
                              variant={
                                idx === activeSuggestionIndex
                                  ? 'outline'
                                  : 'secondary'
                              }
                              className={cn(
                                'h-4 px-1 text-[9px] font-sans uppercase shrink-0 font-semibold',
                                idx === activeSuggestionIndex &&
                                  'border-primary-foreground/40 text-primary-foreground'
                              )}
                            >
                              {item.component.id}
                            </Badge>
                            <span className='truncate font-mono'>
                              {item.syntax}
                            </span>
                          </div>
                          <div className='flex items-center gap-1.5 shrink-0'>
                            {item.operation.mutating ? (
                              <Wrench
                                className={cn(
                                  'size-3',
                                  idx === activeSuggestionIndex
                                    ? 'text-primary-foreground'
                                    : 'text-amber-500'
                                )}
                              />
                            ) : (
                              <Activity
                                className={cn(
                                  'size-3',
                                  idx === activeSuggestionIndex
                                    ? 'text-primary-foreground'
                                    : 'text-sky-500'
                                )}
                              />
                            )}
                            <span
                              className={cn(
                                'truncate max-w-[150px] text-[11px] font-sans',
                                idx === activeSuggestionIndex
                                  ? 'text-primary-foreground/90'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {item.operation.label}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <form
                  className='flex items-center gap-2'
                  onSubmit={(event) => {
                    event.preventDefault()
                    handleExecute()
                  }}
                >
                  <div className='flex min-w-0 flex-1 items-center rounded-md border bg-background px-3 focus-within:ring-1 focus-within:ring-ring'>
                    <span className='mr-2 shrink-0 font-mono text-xs text-primary'>
                      {currentComponent?.id.toUpperCase() ?? 'EMS'}&gt;
                    </span>
                    <Input
                      ref={inputRef}
                      id='command-line'
                      aria-label='Comando MML'
                      placeholder='Escribir comando…'
                      value={commandInput}
                      disabled={!currentComponent || executeMutation.isPending}
                      onFocus={() => {
                        if (commandInput.trim()) setShowSuggestions(true)
                      }}
                      onChange={(event) => {
                        setCommandInput(event.target.value)
                        setShowSuggestions(true)
                        setActiveSuggestionIndex(0)
                        setParametersOpen(false)
                        setSelectedOperationId('')
                        setParamValues({})
                      }}
                      onKeyDown={(event) => {
                        if (showSuggestions && suggestions.length > 0) {
                          if (event.key === 'ArrowDown') {
                            event.preventDefault()
                            setActiveSuggestionIndex(
                              (prev) => (prev + 1) % suggestions.length
                            )
                            return
                          }
                          if (event.key === 'ArrowUp') {
                            event.preventDefault()
                            setActiveSuggestionIndex(
                              (prev) =>
                                (prev - 1 + suggestions.length) %
                                suggestions.length
                            )
                            return
                          }
                          if (event.key === 'Tab') {
                            event.preventDefault()
                            if (suggestions[activeSuggestionIndex]) {
                              chooseOperation(
                                suggestions[activeSuggestionIndex].operation,
                                suggestions[activeSuggestionIndex].component
                              )
                            }
                            return
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            setShowSuggestions(false)
                            return
                          }
                          if (
                            event.key === 'Enter' &&
                            !event.ctrlKey &&
                            !event.metaKey
                          ) {
                            const currentTrim = commandInput
                              .trim()
                              .toUpperCase()
                            const selected = suggestions[activeSuggestionIndex]
                            if (
                              selected &&
                              currentTrim !==
                                selected.syntax
                                  .replace(/;$/, '')
                                  .toUpperCase() &&
                              currentTrim !== selected.code.toUpperCase()
                            ) {
                              event.preventDefault()
                              chooseOperation(
                                selected.operation,
                                selected.component
                              )
                              return
                            }
                          }
                        }

                        if (
                          (event.ctrlKey || event.metaKey) &&
                          event.key === 'Enter'
                        ) {
                          event.preventDefault()
                          handleExecute()
                        }
                      }}
                      className='h-10 min-w-0 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0'
                      autoComplete='off'
                      spellCheck={false}
                    />
                  </div>
                  <Button
                    type='submit'
                    disabled={
                      !commandInput.trim() ||
                      !currentComponent ||
                      catalogQuery.isError ||
                      executeMutation.isPending
                    }
                  >
                    <Play className='size-4' />
                    Ejecutar
                  </Button>
                </form>
              </div>
              {parametersOpen && currentOperation && currentComponent && (
                <div className='grid max-h-40 gap-3 overflow-y-auto pt-2 sm:grid-cols-2 lg:grid-cols-3'>
                  {currentOperation.parameters.map((parameter) => (
                    <ParameterField
                      key={parameter.id}
                      parameter={parameter}
                      value={paramValues[parameter.id]}
                      onChange={(value) => {
                        const next = { ...paramValues, [parameter.id]: value }
                        setParamValues(next)
                        setCommandInput(
                          stripEnvelope(
                            toMmlSyntax(
                              currentOperation,
                              currentComponent.id,
                              currentComponent.label,
                              next
                            )
                          )
                        )
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <Tabs
              value={resultTab}
              onValueChange={(value) => setResultTab(value as ResultTab)}
              className='flex min-h-0 flex-1 flex-col gap-0'
            >
              <div className='flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2'>
                <TabsList className='h-8'>
                  <TabsTrigger value='result' className='text-xs'>
                    <Terminal className='size-3.5' />
                    Resultado
                  </TabsTrigger>
                  <TabsTrigger value='history' className='text-xs'>
                    <History className='size-3.5' />
                    Historial
                  </TabsTrigger>
                </TabsList>
                <div className='flex items-center gap-1'>
                  {executeMutation.isPending && (
                    <span
                      role='status'
                      className='mr-2 text-xs text-muted-foreground'
                    >
                      Ejecutando…
                    </span>
                  )}
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={copyResult}
                    disabled={!lastResult}
                  >
                    <Copy className='size-3.5' />
                    Copiar
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={downloadResult}
                    disabled={!lastResult}
                  >
                    <Download className='size-3.5' />
                    Exportar
                  </Button>
                </div>
              </div>
              <TabsContent
                value='result'
                className='m-0 min-h-0 flex-1 overflow-auto'
              >
                <CommandResult result={lastResult} command={lastMmlCommand} />
              </TabsContent>
              <TabsContent
                value='history'
                className='m-0 min-h-0 flex-1 overflow-auto'
              >
                {historyQuery.isError ? (
                  <EmptyList text='No se pudo cargar el historial.' />
                ) : (
                  <CommandHistory
                    runs={historyQuery.data ?? []}
                    loading={historyQuery.isLoading}
                    onLoad={loadHistory}
                  />
                )}
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </Card>

      <Dialog open={catalogOpen} onOpenChange={setCatalogOpen}>
        <DialogContent className='sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>Catálogo · {currentComponent?.label}</DialogTitle>
            <DialogDescription>Seleccionar comando</DialogDescription>
          </DialogHeader>
          <SearchInput
            value={operationSearch}
            onChange={setOperationSearch}
            placeholder='Buscar comando…'
            label='Buscar comandos'
          />
          <div className='max-h-[55vh] space-y-4 overflow-y-auto'>
            {groupedOperations.map(([category, operations]) => (
              <div key={category}>
                <p className='px-2 py-1 text-xs text-muted-foreground'>
                  {category}
                </p>
                {operations.map((operation) => (
                  <OperationButton
                    key={operation.id}
                    operation={operation}
                    code={operationCode(operation, currentComponent)}
                    selected={operation.id === currentOperation?.id}
                    onSelect={() => chooseOperation(operation)}
                  />
                ))}
              </div>
            ))}
            {!visibleOperations.length && (
              <EmptyList text='Sin coincidencias' />
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className='sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>Manual de comandos</DialogTitle>
            <DialogDescription>
              Referencia del catálogo disponible · {currentComponent?.label}
            </DialogDescription>
          </DialogHeader>
          <CommandReference component={currentComponent} />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar operación</DialogTitle>
            <DialogDescription>
              Esta acción puede interrumpir el servicio o las sesiones del nodo
              seleccionado.
            </DialogDescription>
          </DialogHeader>
          <p className='font-mono text-sm'>
            {confirmation?.component_id.toUpperCase()} ·{' '}
            {confirmation?.operation_id}
          </p>
          <pre className='overflow-auto rounded border p-3 text-xs'>
            {JSON.stringify(confirmation?.parameters, null, 2)}
          </pre>
          <div className='flex justify-end gap-2'>
            <Button variant='outline' onClick={() => setConfirmation(null)}>
              Cancelar
            </Button>
            <Button
              variant='destructive'
              disabled={executeMutation.isPending}
              onClick={() => {
                if (confirmation) submit(confirmation)
              }}
            >
              Confirmar ejecución
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </EmsPage>
  )
}

function CommandReference({ component }: { component?: ComponentOperations }) {
  if (!component) return <EmptyList text='Seleccione un elemento de red.' />

  return (
    <ScrollArea className='h-[65vh]'>
      <div className='space-y-5 p-5'>
        <div>
          <h3 className='text-sm font-semibold'>Referencia operativa</h3>
          <p className='mt-1 text-xs text-muted-foreground'>
            Sintaxis controlada del EMS para {component.label}. Cada código se
            traduce a una operación validada del backend; no abre una terminal
            Linux libre. Seleccione un nodo y escriba un comando, o insértelo
            desde Catálogo. Enter o Ctrl + Enter ejecutan una sola operación. Si
            omite NF, se utiliza el nodo seleccionado; otro destino explícito se
            rechaza. El historial permite recuperar resultados y comandos, sin
            volver a ejecutarlos.
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
                  <code className='mt-2 block text-[11px] break-all'>
                    {stripEnvelope(
                      toMmlSyntax(
                        operation,
                        component.id,
                        component.label,
                        parameterDefaults(operation)
                      )
                    )}
                  </code>
                  {operation.parameters.map((parameter) => (
                    <p
                      key={parameter.id}
                      className='mt-1 text-xs text-muted-foreground'
                    >
                      <strong>{parameter.id}</strong> · {parameter.type}
                      {parameter.required ? ' · obligatorio' : ''}
                      {parameter.minimum !== undefined
                        ? ' · mínimo ' + parameter.minimum
                        : ''}
                      {parameter.maximum !== undefined
                        ? ' · máximo ' + parameter.maximum
                        : ''}{' '}
                      — {parameter.description ?? parameter.label}
                    </p>
                  ))}
                  {operation.mutating && (
                    <p className='mt-1 text-xs text-amber-600'>
                      Cambia el estado del nodo. Requiere confirmación.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className='rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200'>
          <span className='text-emerald-400'>Formato:</span> VERBO OBJETO:
          PARAMETRO=&quot;valor&quot;;
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
      aria-pressed={selected}
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
          <span className='truncate text-sm font-medium'>
            {component.label}
          </span>
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
          {component.node_id ?? component.unit}
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
              <SelectItem
                key={String(option.value)}
                value={String(option.value)}
              >
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
  if (!result)
    return (
      <div className='flex h-full min-h-40 items-center justify-center font-mono text-xs text-muted-foreground'>
        Consola lista
      </div>
    )
  return (
    <pre
      aria-label='Salida del comando'
      className='min-h-full overflow-auto p-5 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap'
    >
      {formatTelcoReport(result, command)}
    </pre>
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
    <ScrollArea className='h-full'>
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
