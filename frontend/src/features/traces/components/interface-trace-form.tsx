import { useMemo, useState, type FormEvent } from 'react'
import {
  Activity,
  ArrowLeftRight,
  Clock3,
  HardDrive,
  Loader2,
  Network,
  Play,
  Server,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  InterfaceTraceDraft,
  TraceCapabilities,
  TraceCaptureTarget,
} from '../types'

type InterfaceTraceFormProps = {
  capabilities?: TraceCapabilities
  isLoading: boolean
  canCreate: boolean
  isSubmitting: boolean
  onSubmit: (draft: InterfaceTraceDraft) => void
}

export function InterfaceTraceForm({
  capabilities,
  isLoading,
  canCreate,
  isSubmitting,
  onSubmit,
}: InterfaceTraceFormProps) {
  const [name, setName] = useState(() => makeTaskName('IF-N2'))
  const [selectedAgent, setSelectedAgent] = useState('')
  const [selectedComponent, setSelectedComponent] = useState('')
  const [selectedTarget, setSelectedTarget] = useState('')
  const [duration, setDuration] = useState('60')
  const [maxMegabytes, setMaxMegabytes] = useState('25')

  const agents = capabilities?.capture_agents ?? []
  const networkFunctions = capabilities?.network_functions ?? []
  const agentId = selectedAgent || agents[0]?.id || 'primary'
  const defaultNf =
    networkFunctions.find(
      (item) => item.id === 'amf' || item.component_id === 'amf'
    ) ?? networkFunctions[0]
  const componentId =
    selectedComponent || defaultNf?.component_id || defaultNf?.id || ''
  const component = networkFunctions.find(
    (item) => item.id === componentId || item.component_id === componentId
  )
  const targets = useMemo(
    () =>
      (capabilities?.capture_targets ?? []).filter((target) =>
        targetSupportsComponent(target, componentId)
      ),
    [capabilities?.capture_targets, componentId]
  )
  const preferredTarget =
    targets.find((item) => item.id.toLowerCase() === 'n2') ?? targets[0]
  const targetId = targets.some((item) => item.id === selectedTarget)
    ? selectedTarget
    : (preferredTarget?.id ?? '')
  const target = targets.find((item) => item.id === targetId)
  const limit = capabilities?.limits
  const durationOptions = [30, 60, 120, 300].filter(
    (value) => value <= (limit?.max_duration_seconds ?? 300)
  )
  const sizeOptions = [10, 25, 50, 100].filter(
    (value) => value <= (limit?.max_megabytes ?? 100)
  )

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!component || !target || !name.trim()) return
    onSubmit({
      name: name.trim(),
      scenario_id: capabilities?.scenario_id ?? '5g-sa',
      testbed_id: capabilities?.testbed_id ?? 'local',
      capture_agent_id: agentId,
      node_id: component.node_id,
      component_id: component.component_id ?? component.id,
      capture_point: target.id,
      duration_seconds: Number(duration),
      max_megabytes: Number(maxMegabytes),
    })
  }

  if (isLoading) return <FormSkeleton />

  return (
    <form
      onSubmit={submit}
      className='grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]'
    >
      <div className='space-y-4'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ArrowLeftRight className='size-5 text-primary' />
              Objetivo de la captura
            </CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 sm:grid-cols-2'>
            <Field
              className='sm:col-span-2'
              label='Nombre de la tarea'
              htmlFor='interface-task-name'
            >
              <Input
                id='interface-task-name'
                value={name}
                maxLength={80}
                required
                onChange={(event) => setName(event.target.value)}
                placeholder='Ej. Registro-UE01-N2'
              />
            </Field>

            <Field label='Agente de captura' htmlFor='interface-agent'>
              <Select value={agentId} onValueChange={setSelectedAgent}>
                <SelectTrigger id='interface-agent'>
                  <SelectValue placeholder='Seleccione un agente' />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.label ?? agent.hostname ?? agent.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='text-xs text-muted-foreground'>
                Host físico que ejecuta tshark.
              </p>
            </Field>

            <Field label='Función de red' htmlFor='interface-nf'>
              <Select
                value={componentId}
                onValueChange={(value) => {
                  setSelectedComponent(value)
                  setSelectedTarget('')
                }}
              >
                <SelectTrigger id='interface-nf'>
                  <SelectValue placeholder='Seleccione una NF' />
                </SelectTrigger>
                <SelectContent>
                  {networkFunctions.map((item) => {
                    const id = item.component_id ?? item.id
                    return (
                      <SelectItem key={`${item.node_id}:${id}`} value={id}>
                        {item.label ?? id.toUpperCase()} · {item.node_id}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <p className='text-xs text-muted-foreground'>
                NF lógica desde la que se interpreta la traza.
              </p>
            </Field>

            <Field
              className='sm:col-span-2'
              label='Interfaz 3GPP'
              htmlFor='interface-target'
            >
              <Select value={targetId} onValueChange={setSelectedTarget}>
                <SelectTrigger id='interface-target'>
                  <SelectValue placeholder='Seleccione una interfaz' />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!targets.length && componentId && (
                <p className='text-xs text-amber-600'>
                  La NF seleccionada no tiene puntos de captura declarados.
                </p>
              )}
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Clock3 className='size-5 text-primary' />
              Límites de la tarea
            </CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 sm:grid-cols-2'>
            <Field label='Duración' htmlFor='interface-duration'>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id='interface-duration'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {formatDuration(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label='Tamaño máximo' htmlFor='interface-size'>
              <Select value={maxMegabytes} onValueChange={setMaxMegabytes}>
                <SelectTrigger id='interface-size'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sizeOptions.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value} MB
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card className='h-fit xl:sticky xl:top-20'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Activity className='size-5 text-primary' />
            Resumen de ejecución
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>
          <SummaryRow
            icon={Server}
            label='Host físico'
            value={agents.find((item) => item.id === agentId)?.label ?? agentId}
          />
          <SummaryRow
            icon={Network}
            label='Nodo / NF'
            value={
              component
                ? `${component.node_id} / ${component.label ?? componentId.toUpperCase()}`
                : 'Sin seleccionar'
            }
          />
          <SummaryRow
            icon={ArrowLeftRight}
            label='Interfaz'
            value={target?.label ?? 'Sin seleccionar'}
          />
          <SummaryRow
            icon={HardDrive}
            label='Límite'
            value={`${formatDuration(Number(duration))} · ${maxMegabytes} MB`}
          />

          {target && (
            <div className='rounded-lg border bg-muted/30 p-3'>
              <p className='text-xs font-medium text-muted-foreground'>
                Protocolos observables
              </p>
              <div className='mt-2 flex flex-wrap gap-1.5'>
                {targetProtocols(target).map((protocol) => (
                  <Badge key={protocol} variant='outline'>
                    {protocol.toUpperCase()}
                  </Badge>
                ))}
              </div>
              {!!target.procedures?.length && (
                <p className='mt-3 text-xs leading-relaxed text-muted-foreground'>
                  {target.procedures.join(' · ')}
                </p>
              )}
            </div>
          )}

          {targetId.toLowerCase() === 'n2' && (
            <Alert>
              <Network />
              <AlertTitle>N1 se decodifica sobre N2</AlertTitle>
              <AlertDescription>
                Los mensajes NAS del UE viajan encapsulados en NGAP; no se
                presenta N1 como una interfaz física independiente.
              </AlertDescription>
            </Alert>
          )}

          {!canCreate && (
            <p className='text-sm text-muted-foreground'>
              Tu rol no tiene un testbed habilitado para iniciar capturas.
            </p>
          )}
          <Button
            className='w-full'
            type='submit'
            disabled={
              !canCreate ||
              !component ||
              !target ||
              !name.trim() ||
              isSubmitting
            }
          >
            {isSubmitting ? <Loader2 className='animate-spin' /> : <Play />}
            Crear e iniciar Interface Trace
          </Button>
          <p className='text-center text-xs text-muted-foreground'>
            Solo se utilizan perfiles de captura autorizados por el servidor.
          </p>
        </CardContent>
      </Card>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string
  htmlFor: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Server
  label: string
  value: string
}) {
  return (
    <div className='flex items-start gap-3'>
      <div className='rounded-md bg-muted p-2'>
        <Icon className='size-4 text-muted-foreground' />
      </div>
      <div className='min-w-0'>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <p className='truncate text-sm font-medium'>{value}</p>
      </div>
    </div>
  )
}

function FormSkeleton() {
  return (
    <div className='grid animate-pulse gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]'>
      <div className='space-y-4'>
        <div className='h-80 rounded-xl bg-muted' />
        <div className='h-44 rounded-xl bg-muted' />
      </div>
      <div className='h-96 rounded-xl bg-muted' />
    </div>
  )
}

function targetSupportsComponent(
  target: TraceCaptureTarget,
  componentId: string
) {
  if (!componentId) return true
  const supported = [
    target.component_id,
    ...(target.component_ids ?? []),
    ...(target.nf_ids ?? []),
  ].filter(Boolean)
  return !supported.length || supported.includes(componentId)
}

function targetProtocols(target: TraceCaptureTarget) {
  if (target.protocols?.length) return target.protocols
  return target.protocol ? [target.protocol] : [target.id]
}

function makeTaskName(prefix: string) {
  const now = new Date()
  const part = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((value) => String(value).padStart(2, '0'))
    .join('')
  return `${prefix}-${part}`
}

function formatDuration(seconds: number) {
  return seconds < 60 ? `${seconds} segundos` : `${seconds / 60} min`
}
