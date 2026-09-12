import { useState } from 'react'
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  ListChecks,
  Radio,
  RefreshCw,
  UserRoundSearch,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useScenarioStore } from '@/stores/scenario-store'
import { api, apiErrorMessage, canTrace } from '@/lib/api'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmsPage } from '@/features/ems-page'
import { InterfaceTraceForm } from './components/interface-trace-form'
import { SubscriberTraceForm } from './components/subscriber-trace-form'
import { TraceTaskDetailView } from './components/trace-task-detail'
import { TraceTaskTable } from './components/trace-task-table'
import {
  isActiveTrace,
  type InterfaceTraceDraft,
  type SubscriberTraceDraft,
  type TraceAnalysis,
  type TraceCapabilities,
  type TraceTask,
} from './types'

type TraceTab = 'interface' | 'subscriber' | 'tasks'

export function TracesPage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  const [tab, setTab] = useState<TraceTab>('interface')
  const scenario = useScenarioStore((state) => state.scenario)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  const capabilities = useQuery({
    queryKey: ['trace-capabilities', scenario],
    queryFn: async () =>
      (await api.get<TraceCapabilities>(`/traces/capabilities/${scenario}`))
        .data,
    staleTime: 30_000,
    retry: 1,
  })

  const tasks = useQuery({
    queryKey: ['trace-tasks'],
    queryFn: async () => (await api.get<TraceTask[]>('/traces')).data,
    refetchInterval: (query) =>
      query.state.data?.some(isActiveTrace) ? 2_000 : 8_000,
  })

  const selectedTask = tasks.data?.find((task) => task.id === selectedTaskId)
  const taskDetail = useQuery({
    queryKey: ['trace-task', selectedTaskId],
    queryFn: async () =>
      (await api.get<TraceTask>(`/traces/${selectedTaskId}`)).data,
    enabled: Boolean(selectedTaskId),
    refetchInterval: (query) =>
      query.state.data && isActiveTrace(query.state.data) ? 2_000 : false,
  })
  const resolvedTask = taskDetail.data ?? selectedTask

  const analysis = useQuery({
    queryKey: ['trace-analysis', selectedTaskId],
    queryFn: async () =>
      (await api.get<TraceAnalysis>(`/traces/${selectedTaskId}/analysis`)).data,
    enabled: Boolean(selectedTaskId),
    retry: false,
    refetchInterval: () =>
      resolvedTask && isActiveTrace(resolvedTask) ? 2_000 : false,
  })

  const createInterface = useMutation({
    mutationFn: async (draft: InterfaceTraceDraft) =>
      (await api.post<TraceTask>('/traces/interface', draft)).data,
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['trace-tasks'] })
      setTab('tasks')
      setSelectedTaskId(created.id)
      toast.success('Interface Trace iniciado', {
        description: 'La captura se está ejecutando con un perfil autorizado.',
      })
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'No se pudo iniciar Interface Trace')),
  })

  const createSubscriber = useMutation({
    mutationFn: async (draft: SubscriberTraceDraft) =>
      (await api.post<TraceTask>('/traces/subscriber', draft)).data,
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['trace-tasks'] })
      setTab('tasks')
      setSelectedTaskId(created.id)
      toast.success('Subscriber Trace iniciado', {
        description:
          'El motor capturará y correlacionará el recorrido del suscriptor.',
      })
    },
    onError: (error) =>
      toast.error(
        apiErrorMessage(error, 'No se pudo iniciar Subscriber Trace')
      ),
  })

  const stop = useMutation({
    mutationFn: async (task: TraceTask) =>
      (await api.post<TraceTask>(`/traces/${task.id}/stop`)).data,
    onSuccess: (updated) => {
      queryClient.setQueryData<TraceTask[]>(['trace-tasks'], (current) =>
        current?.map((task) =>
          task.id === updated.id ? { ...task, ...updated } : task
        )
      )
      queryClient.setQueryData(['trace-task', updated.id], updated)
      void queryClient.invalidateQueries({
        queryKey: ['trace-analysis', updated.id],
      })
      toast.success('Tarea detenida', {
        description: 'El backend procesará la evidencia capturada.',
      })
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'No se pudo detener la tarea')),
  })

  const remove = useMutation({
    mutationFn: async (task: TraceTask) => {
      await api.delete(`/traces/${task.id}`)
      return task
    },
    onSuccess: (deleted) => {
      queryClient.setQueryData<TraceTask[]>(['trace-tasks'], (current) =>
        current?.filter((task) => task.id !== deleted.id)
      )
      queryClient.removeQueries({ queryKey: ['trace-task', deleted.id] })
      queryClient.removeQueries({ queryKey: ['trace-analysis', deleted.id] })
      if (selectedTaskId === deleted.id) setSelectedTaskId(null)
      toast.success('Tarea eliminada')
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, 'No se pudo eliminar la tarea')),
  })

  const download = async (
    task: TraceTask,
    artifact: 'original' | 'filtered' | 'evidence'
  ) => {
    try {
      const response = await api.get<Blob>(`/traces/${task.id}/download`, {
        params: { artifact },
        responseType: 'blob',
        timeout: 120_000,
      })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download =
        responseFilename(response.headers['content-disposition']) ??
        fallbackFilename(task, artifact)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
      toast.success('Descarga preparada')
    } catch (error) {
      toast.error(apiErrorMessage(error, 'El artefacto aún no está disponible'))
    }
  }

  const activeCount = tasks.data?.filter(isActiveTrace).length ?? 0
  const subscriberSupported =
    scenario === '5g-sa' && capabilities.data?.subscriber?.enabled !== false
  const canCreate = canTrace(user?.role) && Boolean(user)
  const selectedIsLoading =
    Boolean(selectedTaskId) && !resolvedTask && taskDetail.isLoading

  const changeTab = (value: string) => {
    const next = value as TraceTab
    setTab(next)
  }

  if (selectedTaskId && resolvedTask) {
    return (
      <EmsPage
        title={resolvedTask.name ?? 'Detalle de Traza'}
        description='Estudio de trazabilidad extremo a extremo para el suscriptor y funciones de red.'
      >
        <TraceTaskDetailView
          task={resolvedTask}
          analysis={analysis.data}
          isLoading={selectedIsLoading}
          analysisError={
            analysis.error && !isExpectedAnalysisPending(analysis.error)
              ? analysis.error
              : null
          }
          role={user?.role}
          currentUsername={user?.username}
          isStopping={stop.isPending && stop.variables?.id === selectedTaskId}
          isDeleting={
            remove.isPending && remove.variables?.id === selectedTaskId
          }
          onBack={() => setSelectedTaskId(null)}
          onStop={(task) => stop.mutate(task)}
          onDelete={(task) => {
            remove.mutate(task)
            setSelectedTaskId(null)
          }}
          onDownload={(task, artifact) => void download(task, artifact)}
        />
      </EmsPage>
    )
  }

  return (
    <EmsPage title='Centro de trazas' description=''>
      <Tabs value={tab} onValueChange={changeTab} className='gap-5'>
        <div className='flex flex-wrap items-center justify-between gap-2 pb-1'>
          <TabsList className='h-10'>
            <TabsTrigger value='interface' className='px-3'>
              <Radio /> Interface Trace
            </TabsTrigger>
            <TabsTrigger
              value='subscriber'
              className='px-3'
              disabled={!subscriberSupported}
              title={
                scenario !== '5g-sa'
                  ? 'Subscriber Trace solo disponible en 5G Standalone'
                  : undefined
              }
            >
              <UserRoundSearch /> Subscriber Trace
            </TabsTrigger>
            <TabsTrigger value='tasks' className='px-3'>
              <ListChecks /> Tareas
              {!!activeCount && (
                <Badge className='h-5 min-w-5 justify-center px-1.5'>
                  {activeCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <div className='flex items-center gap-2'>
            {activeCount > 0 && (
              <Badge className='hidden gap-1 sm:flex'>
                <Activity className='size-3 animate-pulse' /> {activeCount}{' '}
                activas
              </Badge>
            )}

            <Button
              variant='outline'
              size='icon'
              aria-label='Actualizar tareas y capacidades'
              disabled={tasks.isFetching || capabilities.isFetching}
              onClick={() => {
                void tasks.refetch()
                void capabilities.refetch()
              }}
            >
              <RefreshCw
                className={
                  tasks.isFetching || capabilities.isFetching
                    ? 'animate-spin'
                    : ''
                }
              />
            </Button>
          </div>
        </div>

        {capabilities.error && tab !== 'tasks' && (
          <Alert variant='destructive'>
            <AlertTitle>No se pudo cargar el catálogo de trazas</AlertTitle>
            <AlertDescription>
              {apiErrorMessage(
                capabilities.error,
                'Verifique la conexión con el backend y el agente del testbed.'
              )}
            </AlertDescription>
          </Alert>
        )}

        <TabsContent value='interface'>
          <InterfaceTraceForm
            key={`interface:${scenario}`}
            capabilities={capabilities.data}
            isLoading={capabilities.isLoading}
            canCreate={canCreate}
            isSubmitting={createInterface.isPending}
            onSubmit={(draft) => createInterface.mutate(draft)}
          />
        </TabsContent>
        <TabsContent value='subscriber'>
          <SubscriberTraceForm
            capabilities={capabilities.data}
            isLoading={capabilities.isLoading}
            canCreate={canCreate && subscriberSupported}
            isSubmitting={createSubscriber.isPending}
            onSubmit={(draft) => createSubscriber.mutate(draft)}
          />
        </TabsContent>
        <TabsContent value='tasks'>
          <TraceTaskTable
            tasks={tasks.data}
            isLoading={tasks.isLoading}
            error={tasks.error}
            currentUsername={user?.username}
            role={user?.role}
            pendingStopId={stop.variables?.id}
            pendingDeleteId={remove.variables?.id}
            onView={(task) => setSelectedTaskId(task.id)}
            onStop={(task) => stop.mutate(task)}
            onDelete={(task) => remove.mutate(task)}
            onDownload={(task, artifact) => void download(task, artifact)}
          />
        </TabsContent>
      </Tabs>
    </EmsPage>
  )
}

function responseFilename(contentDisposition?: string) {
  if (!contentDisposition) return undefined
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) return decodeURIComponent(encoded.replace(/"/g, ''))
  return contentDisposition.match(/filename="?([^";]+)"?/i)?.[1]
}

function fallbackFilename(
  task: TraceTask,
  artifact: 'original' | 'filtered' | 'evidence'
) {
  if (artifact === 'original' && task.file) return task.file
  const safeName = (task.name ?? task.id).replace(/[^a-zA-Z0-9_-]/g, '_')
  return `${safeName}-${artifact}.${artifact === 'evidence' ? 'json' : 'pcap'}`
}

function isExpectedAnalysisPending(error: Error) {
  return (
    axios.isAxiosError(error) &&
    [404, 409, 425].includes(error.response?.status ?? 0)
  )
}
