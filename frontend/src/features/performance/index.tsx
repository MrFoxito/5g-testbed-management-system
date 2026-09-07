import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  Folder,
  FolderPlus,
  Gauge,
  LineChart as LineChartIcon,
  Network,
  RefreshCw,
  Save,
  Search,
  Server,
  Share2,
  Trash2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { EmsPage } from '@/features/ems-page'
import { PerformanceChart } from './performance-chart'
import { QueryWizard } from './query-wizard'
import { ReportDialog } from './report-dialog'
import { supportsObject } from './types'
import type {
  Aggregation,
  KpiFolder,
  KpiQueryDraft,
  KpiQueryResult,
  PerformanceCatalog,
  RangeKey,
  SavedKpiQuery,
} from './types'

const DEFAULT_COUNTERS = ['host.cpu.percent', 'host.memory.percent']

export function PerformancePage() {
  const queryClient = useQueryClient()
  const [scenario, setScenario] = useState<'5g-sa' | '4g-epc'>('5g-sa')
  const [objectIds, setObjectIds] = useState<string[] | null>(null)
  const [activeTitle, setActiveTitle] = useState('Recursos del testbed')
  const [counterSearch, setCounterSearch] = useState('')
  const [objectSearch, setObjectSearch] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [counterIds, setCounterIds] = useState<string[]>(DEFAULT_COUNTERS)
  const [rangeKey, setRangeKey] = useState<RangeKey>('1h')
  const [granularity, setGranularity] = useState(30)
  const [aggregation, setAggregation] = useState<Aggregation>('avg')
  const [search, setSearch] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  const [queryName, setQueryName] = useState('')
  const [folderName, setFolderName] = useState('')
  const [folderId, setFolderId] = useState('none')
  const [scope, setScope] = useState<'personal' | 'testbed'>('personal')

  const catalog = useQuery({
    queryKey: ['performance-catalog', scenario],
    queryFn: async () =>
      (await api.get<PerformanceCatalog>(`/performance/catalog/${scenario}`))
        .data,
    refetchInterval: 15_000,
  })
  const folders = useQuery({
    queryKey: ['performance-folders'],
    queryFn: async () =>
      (await api.get<KpiFolder[]>('/performance/folders')).data,
  })
  const savedQueries = useQuery({
    queryKey: ['performance-saved-queries'],
    queryFn: async () =>
      (await api.get<SavedKpiQuery[]>('/performance/saved-queries')).data,
  })

  const defaultObject = catalog.data ? `testbed:${catalog.data.testbed_id}` : ''
  const effectiveObjects = objectIds ?? (defaultObject ? [defaultObject] : [])
  const draft: KpiQueryDraft = {
    scenario_id: scenario,
    object_ids: effectiveObjects,
    counter_ids: counterIds,
    range_key: rangeKey,
    granularity_seconds: granularity,
    aggregation,
  }

  const result = useQuery({
    queryKey: ['performance-result', draft],
    queryFn: async () =>
      (await api.post<KpiQueryResult>('/performance/query', draft)).data,
    enabled: effectiveObjects.length > 0 && counterIds.length > 0,
    refetchInterval: 10_000,
  })

  const createFolder = useMutation({
    mutationFn: async () =>
      (
        await api.post<KpiFolder>('/performance/folders', {
          name: folderName,
          scope,
        })
      ).data,
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['performance-folders'] })
      setFolderId(created.id)
      setFolderName('')
      setFolderOpen(false)
      toast.success('Carpeta creada')
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'No se pudo crear la carpeta')),
  })

  const saveQuery = useMutation({
    mutationFn: async () =>
      (
        await api.post<SavedKpiQuery>('/performance/saved-queries', {
          ...draft,
          name: queryName,
          folder_id: folderId === 'none' ? null : folderId,
          scope,
        })
      ).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['performance-saved-queries'],
      })
      setSaveOpen(false)
      setQueryName('')
      toast.success('Consulta guardada', {
        description:
          scope === 'testbed'
            ? 'Disponible para quienes comparten este testbed.'
            : 'Guardada en su biblioteca personal.',
      })
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'No se pudo guardar la consulta')),
  })

  const deleteQuery = useMutation({
    mutationFn: async (id: string) =>
      api.delete(`/performance/saved-queries/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['performance-saved-queries'],
      })
      toast.success('Consulta eliminada')
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'No se pudo eliminar la consulta')),
  })

  const applyDraft = (next: KpiQueryDraft) => {
    setScenario(next.scenario_id)
    setObjectIds(next.object_ids)
    setCounterIds(next.counter_ids)
    setRangeKey(next.range_key)
    setGranularity(next.granularity_seconds)
    setAggregation(next.aggregation)
  }

  const loadSaved = (item: SavedKpiQuery) => {
    setActiveTitle(item.name)
    applyDraft({
      scenario_id: item.scenario_id as '5g-sa' | '4g-epc',
      object_ids: item.object_ids,
      counter_ids: item.counter_ids,
      range_key: item.range_key,
      granularity_seconds: item.granularity_seconds,
      aggregation: item.aggregation,
    })
  }

  const loadTelcoPreset = (kind: 'mobility' | 'session' | 'throughput') => {
    setActiveTitle(
      kind === 'throughput'
        ? 'Throughput por interfaz'
        : kind === 'mobility'
          ? scenario === '5g-sa'
            ? 'Registration 5G'
            : 'Attach 4G'
          : 'Sesiones de datos'
    )
    if (kind === 'throughput') {
      const interfaces =
        catalog.data?.objects
          .filter((item) => item.type === 'interface')
          .map((item) => item.id) ?? []
      applyDraft({
        ...draft,
        object_ids: interfaces,
        counter_ids: ['interface.rx.kbps', 'interface.tx.kbps'],
      })
      return
    }
    const is5g = scenario === '5g-sa'
    const procedure =
      kind === 'mobility'
        ? is5g
          ? 'registration'
          : 'attach'
        : is5g
          ? 'pdu-session'
          : 'eps-bearer'
    const prefix =
      kind === 'mobility'
        ? is5g
          ? '5g.registration'
          : '4g.attach'
        : is5g
          ? '5g.pdu'
          : '4g.eps'
    const currentCounter =
      kind === 'mobility'
        ? is5g
          ? '5g.ue.registered'
          : '4g.ue.attached'
        : is5g
          ? '5g.pdu.active'
          : '4g.eps.active'
    applyDraft({
      ...draft,
      object_ids: [`procedure:${procedure}`],
      counter_ids: [
        currentCounter,
        `${prefix}.attempts`,
        `${prefix}.successes`,
        `${prefix}.rejects`,
        `${prefix}.unresolved`,
        `${prefix}.success_rate`,
        `${prefix}.latency_ms`,
      ],
      aggregation: 'last',
    })
  }

  const toggleObject = (id: string) => {
    const current = effectiveObjects
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]
    setObjectIds(next)
    setActiveTitle('Consulta personalizada')
    const counters = catalog.data?.counters ?? []
    const kept = counterIds.filter((counterId) =>
      counters.some(
        (c) => c.id === counterId && next.some((obj) => supportsObject(c, obj))
      )
    )
    setCounterIds(kept)
  }

  const toggleCounter = (id: string) =>
    setCounterIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length < 12
          ? [...current, id]
          : current
    )

  const compatibleCounters =
    catalog.data?.counters.filter(
      (counter) =>
        effectiveObjects.some((id) => supportsObject(counter, id)) &&
        `${counter.label} ${counter.category} ${counter.native_name ?? ''}`
          .toLowerCase()
          .includes(counterSearch.toLowerCase())
    ) ?? []
  const objectGroups = useMemo(
    () => [...new Set(catalog.data?.objects.map((item) => item.group) ?? [])],
    [catalog.data?.objects]
  )
  const counterGroups = [
    ...new Set(compatibleCounters.map((item) => item.category)),
  ]

  return (
    <EmsPage
      title='Performance Studio'
      description='Contadores históricos, consultas reutilizables y KPIs del testbed 4G/5G.'
      actions={
        <Select
          value={scenario}
          onValueChange={(value) => {
            setScenario(value as '5g-sa' | '4g-epc')
            setObjectIds(null)
            setCounterIds(DEFAULT_COUNTERS)
            setActiveTitle('Recursos del testbed')
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
      }
    >
      <div className='mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3'>
        <Button variant='outline' onClick={() => setLibraryOpen(!libraryOpen)}>
          <Folder /> Biblioteca
        </Button>
        <Button onClick={() => setWizardOpen(true)}>
          <BarChart3 /> Nueva consulta
        </Button>
        <Button
          variant='outline'
          onClick={() => setSaveOpen(true)}
          disabled={!counterIds.length || !effectiveObjects.length}
        >
          <Save /> Guardar consulta
        </Button>
        <ReportDialog
          draft={draft}
          title={activeTitle}
          savedQueries={savedQueries.data ?? []}
          disabled={!result.data?.series.length}
        />
        <Button
          variant='outline'
          onClick={() => void result.refetch()}
          disabled={result.isFetching}
        >
          <RefreshCw className={result.isFetching ? 'animate-spin' : ''} />{' '}
          Actualizar
        </Button>
        <div className='ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
          <Badge
            variant={
              catalog.data?.collector.last_run?.status === 'success'
                ? 'default'
                : 'secondary'
            }
          >
            <span className='mr-1.5 size-1.5 rounded-full bg-current' />
            Recolector {catalog.data?.collector.last_run?.status ?? 'iniciando'}
          </Badge>
          <span>{catalog.data?.collector.stored_samples ?? 0} muestras</span>
          <span>cada {catalog.data?.collector.interval_seconds ?? 10}s</span>
          <span>
            retención {catalog.data?.collector.retention_days ?? 30} días
          </span>
        </div>
      </div>

      <div
        className={`grid min-h-[670px] gap-3 ${libraryOpen ? 'xl:grid-cols-[220px_minmax(0,1fr)_300px]' : 'xl:grid-cols-[minmax(0,1fr)_320px]'}`}
      >
        {libraryOpen && (
          <Card className='overflow-hidden py-0'>
            <CardHeader className='border-b px-4 py-4'>
              <div className='flex items-center justify-between'>
                <CardTitle className='text-base'>Biblioteca KPI</CardTitle>
                <Button
                  size='icon'
                  variant='ghost'
                  onClick={() => setFolderOpen(true)}
                  title='Nueva carpeta'
                >
                  <FolderPlus />
                </Button>
              </div>
              <div className='relative'>
                <Search className='absolute top-2.5 left-3 size-4 text-muted-foreground' />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder='Buscar consulta…'
                  className='pl-9'
                />
              </div>
            </CardHeader>
            <ScrollArea className='h-[590px]'>
              <CardContent className='space-y-2 p-3'>
                <LibrarySection title='Plantillas EMS' icon={Gauge}>
                  <PresetItem
                    label={
                      scenario === '5g-sa' ? 'Registration 5G' : 'Attach 4G'
                    }
                    onClick={() => loadTelcoPreset('mobility')}
                  />
                  <PresetItem
                    label={
                      scenario === '5g-sa' ? 'PDU Sessions' : 'EPS bearers'
                    }
                    onClick={() => loadTelcoPreset('session')}
                  />
                  <PresetItem
                    label='Throughput por interfaz'
                    onClick={() => loadTelcoPreset('throughput')}
                  />
                </LibrarySection>
                <LibrarySection title='Funciones de red' icon={Server}>
                  {catalog.data?.objects
                    .filter((o) => o.type === 'nf')
                    .map((o) => (
                      <PresetItem
                        key={o.id}
                        label={`${o.label} · ${o.counter_count ?? 1}`}
                        onClick={() => {
                          setActiveTitle(`${o.label} · Contadores de la NF`)
                          setCounterSearch('')
                          applyDraft({
                            ...draft,
                            object_ids: [o.id],
                            counter_ids: [],
                          })
                        }}
                      />
                    ))}
                </LibrarySection>
                <LibrarySection title='Mis consultas' icon={UserRound}>
                  <QueryTree
                    folders={folders.data ?? []}
                    queries={
                      savedQueries.data?.filter(
                        (item) =>
                          item.scope === 'personal' &&
                          item.name.toLowerCase().includes(search.toLowerCase())
                      ) ?? []
                    }
                    onLoad={loadSaved}
                    onDelete={(id) => deleteQuery.mutate(id)}
                  />
                </LibrarySection>
                <LibrarySection title='Testbed compartido' icon={Share2}>
                  <QueryTree
                    folders={
                      folders.data?.filter(
                        (item) => item.scope === 'testbed'
                      ) ?? []
                    }
                    queries={
                      savedQueries.data?.filter(
                        (item) =>
                          item.scope === 'testbed' &&
                          item.name.toLowerCase().includes(search.toLowerCase())
                      ) ?? []
                    }
                    onLoad={loadSaved}
                    onDelete={(id) => deleteQuery.mutate(id)}
                  />
                </LibrarySection>
                {!savedQueries.data?.length && (
                  <div className='rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground'>
                    Cree una consulta y guárdela en una carpeta personal o
                    compartida.
                  </div>
                )}
              </CardContent>
            </ScrollArea>
          </Card>
        )}

        <Card className='min-w-0 py-0'>
          <CardHeader className='border-b px-5 py-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <LineChartIcon className='size-5 text-primary' />{' '}
                  {activeTitle}
                </CardTitle>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {effectiveObjects.length} objetos · {counterIds.length}{' '}
                  contadores · últimas {rangeKey}
                </p>
              </div>
              <div className='flex gap-2'>
                <Select
                  value={rangeKey}
                  onValueChange={(value) => setRangeKey(value as RangeKey)}
                >
                  <SelectTrigger className='w-28'>
                    <Clock3 />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['15m', '1h', '6h', '24h', '7d'] as RangeKey[]).map(
                      (item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <Select
                  value={aggregation}
                  onValueChange={(value) =>
                    setAggregation(value as Aggregation)
                  }
                >
                  <SelectTrigger className='w-32'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='avg'>Promedio</SelectItem>
                    <SelectItem value='min'>Mínimo</SelectItem>
                    <SelectItem value='max'>Máximo</SelectItem>
                    <SelectItem value='sum'>Suma</SelectItem>
                    <SelectItem value='last'>Último</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className='p-5'>
            {!effectiveObjects.length || !counterIds.length ? (
              <div className='flex h-[440px] items-center justify-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
                Seleccione al menos un objeto y un contador compatible en el
                panel derecho.
              </div>
            ) : result.isError ? (
              <div className='flex h-[440px] items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-8 text-center text-sm text-destructive'>
                {apiErrorMessage(
                  result.error,
                  'No se pudo ejecutar la consulta'
                )}
              </div>
            ) : (
              <PerformanceChart result={result.data} />
            )}
            {!!result.data?.missing_series?.length && (
              <p className='mt-3 rounded border border-amber-500/30 p-2 text-xs text-amber-600'>
                {result.data.missing_series.length} series sin muestras en este
                periodo. No se sustituyen datos ausentes por cero.
              </p>
            )}
            <p className='mt-3 text-xs text-muted-foreground'>
              Los acumulados muestran la última lectura de cada intervalo. Las
              tasas nativas usan deltas y omiten reinicios. Una NF compartida
              mide el proceso completo.
            </p>
            <div className='mt-4 grid gap-3 sm:grid-cols-3'>
              <MetricSummary
                label='Muestras consultadas'
                value={String(result.data?.sample_count ?? 0)}
                icon={Database}
              />
              <MetricSummary
                label='Series resultantes'
                value={String(result.data?.series.length ?? 0)}
                icon={LineChartIcon}
              />
              <MetricSummary
                label='Resolución'
                value={`${granularity}s`}
                icon={Gauge}
              />
            </div>
          </CardContent>
        </Card>

        <Card className='overflow-hidden py-0'>
          <CardHeader className='border-b px-4 py-4'>
            <CardTitle className='text-sm'>
              Objetos{' '}
              <span className='text-muted-foreground'>
                / {effectiveObjects.length} seleccionados
              </span>
            </CardTitle>
            <Input
              value={objectSearch}
              onChange={(e) => setObjectSearch(e.target.value)}
              placeholder='Buscar nodo o interfaz'
              aria-label='Buscar objetos'
            />
          </CardHeader>
          <ScrollArea className='h-[250px]'>
            <CardContent className='space-y-2 p-2'>
              {objectGroups.map((group) => (
                <SelectorGroup
                  key={group}
                  title={group}
                  icon={group === 'Testbed' ? Server : Network}
                >
                  {catalog.data?.objects
                    .filter(
                      (item) =>
                        item.group === group &&
                        item.label
                          .toLowerCase()
                          .includes(objectSearch.toLowerCase())
                    )
                    .map((item) => (
                      <label
                        key={item.id}
                        className='flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted'
                      >
                        <Checkbox
                          checked={effectiveObjects.includes(item.id)}
                          onCheckedChange={() => toggleObject(item.id)}
                        />
                        <span className='min-w-0 flex-1 truncate text-sm'>
                          {item.label}
                        </span>
                        {item.counter_count && (
                          <span className='text-[10px] text-muted-foreground'>
                            {item.counter_count}
                          </span>
                        )}
                        {item.status && (
                          <span
                            className={`size-2 rounded-full ${item.status === 'running' || item.status === 'UP' ? 'bg-emerald-500' : 'bg-muted-foreground'}`}
                          />
                        )}
                      </label>
                    ))}
                </SelectorGroup>
              ))}
            </CardContent>
          </ScrollArea>
          <CardHeader className='border-y bg-muted/20 px-4 py-3'>
            <CardTitle className='text-sm'>
              Contadores{' '}
              <span className='text-muted-foreground'>
                / {counterIds.length} de 12
              </span>
            </CardTitle>
            <Input
              value={counterSearch}
              onChange={(e) => setCounterSearch(e.target.value)}
              placeholder='Buscar contador, causa, DNN…'
              aria-label='Buscar contadores'
            />
            <p className='text-[11px] text-muted-foreground'>
              {compatibleCounters.length} compatibles. Solo se ofrecen métricas
              observadas; no se inventan contadores del fabricante.
            </p>
          </CardHeader>
          <ScrollArea className='h-[370px]'>
            <CardContent className='space-y-3 p-2'>
              {counterGroups.map((group) => (
                <SelectorGroup key={group} title={group} icon={Database}>
                  {compatibleCounters
                    .filter((item) => item.category === group)
                    .map((item) => (
                      <label
                        key={item.id}
                        title={`${item.description ?? item.label}${item.native_name ? '\n' + item.native_name : ''}${item.last_seen ? '\nÚltima muestra: ' + new Date(item.last_seen).toLocaleString() : ''}`}
                        className='flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 hover:bg-muted'
                      >
                        <Checkbox
                          className='mt-0.5'
                          checked={counterIds.includes(item.id)}
                          disabled={
                            !counterIds.includes(item.id) &&
                            counterIds.length >= 12
                          }
                          onCheckedChange={() => toggleCounter(item.id)}
                        />
                        <span className='min-w-0 flex-1'>
                          <span className='block text-sm'>{item.label}</span>
                          <span className='text-xs text-muted-foreground'>
                            {item.source} ·{' '}
                            {item.kind === 'counter'
                              ? 'acumulado'
                              : 'instantáneo'}
                          </span>
                        </span>
                        <Badge variant='secondary'>{item.unit}</Badge>
                      </label>
                    ))}
                </SelectorGroup>
              ))}
              {!compatibleCounters.length && (
                <p className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                  Seleccione primero un objeto compatible.
                </p>
              )}
            </CardContent>
          </ScrollArea>
        </Card>
      </div>

      {catalog.data && wizardOpen && (
        <QueryWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          objects={catalog.data.objects}
          counters={catalog.data.counters}
          initial={draft}
          onApply={applyDraft}
        />
      )}

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva carpeta KPI</DialogTitle>
            <DialogDescription>
              Organice consultas personales o compartidas con el testbed.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label>Nombre</Label>
              <Input
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder='Ej. KPIs globales 5GC'
              />
            </div>
            <ScopeSelect value={scope} onChange={setScope} />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setFolderOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={folderName.trim().length < 2 || createFolder.isPending}
              onClick={() => createFolder.mutate()}
            >
              <FolderPlus /> Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar consulta</DialogTitle>
            <DialogDescription>
              Conserve la selección de objetos, contadores y periodo para volver
              a ejecutarla.
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label>Nombre</Label>
              <Input
                value={queryName}
                onChange={(event) => setQueryName(event.target.value)}
                placeholder='Ej. Salud global del 5GC'
              />
            </div>
            <div className='space-y-2'>
              <Label>Carpeta</Label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>Sin carpeta</SelectItem>
                  {folders.data?.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ·{' '}
                      {item.scope === 'personal' ? 'personal' : 'testbed'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ScopeSelect value={scope} onChange={setScope} />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setSaveOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={queryName.trim().length < 3 || saveQuery.isPending}
              onClick={() => saveQuery.mutate()}
            >
              <Save /> Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EmsPage>
  )
}

function LibrarySection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof Folder
  children: React.ReactNode
}) {
  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className='flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted'>
        <ChevronDown className='size-4' />
        <Icon className='size-4 text-primary' />
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent className='ml-4 border-l pl-2'>
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}

function QueryTree({
  folders,
  queries,
  onLoad,
  onDelete,
}: {
  folders: KpiFolder[]
  queries: SavedKpiQuery[]
  onLoad: (item: SavedKpiQuery) => void
  onDelete: (id: string) => void
}) {
  const unfiled = queries.filter((item) => !item.folder_id)
  return (
    <div className='space-y-1 py-1'>
      {folders.map((folder) => (
        <Collapsible key={folder.id} defaultOpen>
          <CollapsibleTrigger className='flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted'>
            <ChevronRight className='size-3.5' />
            <Folder className='size-4 text-amber-500' />
            <span className='truncate'>{folder.name}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className='ml-4'>
            {queries
              .filter((item) => item.folder_id === folder.id)
              .map((item) => (
                <QueryItem
                  key={item.id}
                  item={item}
                  onLoad={onLoad}
                  onDelete={onDelete}
                />
              ))}
          </CollapsibleContent>
        </Collapsible>
      ))}
      {unfiled.map((item) => (
        <QueryItem
          key={item.id}
          item={item}
          onLoad={onLoad}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

function QueryItem({
  item,
  onLoad,
  onDelete,
}: {
  item: SavedKpiQuery
  onLoad: (item: SavedKpiQuery) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className='group flex items-center rounded-md hover:bg-muted'>
      <button
        type='button'
        onClick={() => onLoad(item)}
        className='flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm'
      >
        <LineChartIcon className='size-4 shrink-0 text-primary' />
        <span className='truncate'>{item.name}</span>
      </button>
      <Button
        size='icon'
        variant='ghost'
        className='size-7 opacity-0 group-hover:opacity-100'
        onClick={() => onDelete(item.id)}
      >
        <Trash2 className='size-3.5' />
      </Button>
    </div>
  )
}

function PresetItem({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted'
    >
      <BarChart3 className='size-4 text-primary' />
      <span className='truncate'>{label}</span>
    </button>
  )
}

function SelectorGroup({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof Database
  children: React.ReactNode
}) {
  return (
    <section>
      <div className='mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
        <Icon className='size-4' />
        {title}
      </div>
      <div>{children}</div>
    </section>
  )
}

function MetricSummary({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: typeof Database
}) {
  return (
    <div className='flex items-center gap-3 rounded-lg border bg-muted/15 p-3'>
      <div className='rounded-md bg-primary/10 p-2 text-primary'>
        <Icon className='size-4' />
      </div>
      <div>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <p className='font-semibold'>{value}</p>
      </div>
    </div>
  )
}

function ScopeSelect({
  value,
  onChange,
}: {
  value: 'personal' | 'testbed'
  onChange: (value: 'personal' | 'testbed') => void
}) {
  return (
    <div className='space-y-2'>
      <Label>Visibilidad</Label>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as 'personal' | 'testbed')}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='personal'>Personal · solo yo</SelectItem>
          <SelectItem value='testbed'>Testbed · grupo asignado</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
