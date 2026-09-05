import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  Check,
  ChevronsUpDown,
  Fingerprint,
  Info,
  Loader2,
  Network,
  Play,
  Route,
  ShieldCheck,
  UserRoundSearch,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  optionFrom,
  type SubscriberTraceDraft,
  type TraceCapabilities,
  type TraceOption,
} from '../types'

type SubscriberListItem = {
  imsi: string
}

type SubscriberTraceFormProps = {
  capabilities?: TraceCapabilities
  isLoading: boolean
  canCreate: boolean
  isSubmitting: boolean
  onSubmit: (draft: SubscriberTraceDraft) => void
}

const FALLBACK_PROCEDURES: TraceOption[] = [
  { id: 'registration', label: 'Registration' },
  { id: 'authentication', label: '5G-AKA Authentication' },
  { id: 'pdu-session', label: 'PDU Session Establishment' },
  { id: 'user-plane', label: 'Tráfico de usuario' },
]

export function SubscriberTraceForm({
  capabilities,
  isLoading,
  canCreate,
  isSubmitting,
  onSubmit,
}: SubscriberTraceFormProps) {
  const subscriberCapabilities = capabilities?.subscriber
  const [name, setName] = useState(() => makeTaskName())
  const [identifierType, setIdentifierType] = useState<
    'imsi' | 'supi' | 'ue-ip'
  >('imsi')
  const [identifier, setIdentifier] = useState('')
  const [subscriberOpen, setSubscriberOpen] = useState(false)
  const [selectedProcedures, setSelectedProcedures] = useState<string[]>([])
  const [proceduresTouched, setProceduresTouched] = useState(false)
  const [includeUserPlane, setIncludeUserPlane] = useState(true)
  const [includeSbi, setIncludeSbi] = useState(true)
  const [autoTrigger, setAutoTrigger] = useState(false)
  const [duration, setDuration] = useState('120')
  const [maxMegabytes, setMaxMegabytes] = useState('50')

  const subscribers = useQuery({
    queryKey: ['subscribers', 'trace-selector'],
    queryFn: async () =>
      (await api.get<SubscriberListItem[]>('/subscribers')).data,
    enabled: identifierType === 'imsi' || identifierType === 'supi',
  })

  const procedureOptions =
    subscriberCapabilities?.procedures?.map(optionFrom) ?? FALLBACK_PROCEDURES
  const defaults =
    subscriberCapabilities?.default_procedures ??
    procedureOptions
      .filter((item) => item.id !== 'user-plane')
      .map((item) => item.id)
  const procedures = proceduresTouched ? selectedProcedures : defaults
  const agent = capabilities?.capture_agents?.[0]
  const identifierTypes = subscriberCapabilities?.identifier_types?.map(
    optionFrom
  ) ?? [
    { id: 'imsi', label: 'IMSI' },
    { id: 'supi', label: 'SUPI' },
    { id: 'ue-ip', label: 'Dirección IP del UE' },
  ]
  const participatingComponents =
    subscriberCapabilities?.participating_components ??
      subscriberCapabilities?.component_ids ?? [
        'ue',
        'gnb',
        'amf',
        'ausf',
        'udm',
        'smf',
        'upf',
      ]
  const scope = [
    'N2 / NGAP + NAS',
    ...(includeSbi ? ['SBI / HTTP2'] : []),
    'N4 / PFCP',
    ...(includeUserPlane ? ['N3 / GTP-U', 'N6 / IP'] : []),
  ]
  const identifierValid = validateIdentifier(identifierType, identifier)
  const maxDuration =
    capabilities?.quota?.max_duration_seconds ??
    capabilities?.limits?.max_duration_seconds ??
    300
  const maxSize =
    capabilities?.quota?.max_megabytes ??
    capabilities?.limits?.max_megabytes ??
    100
  const durationOptions = [60, 120, 300].filter(
    (value) => value <= maxDuration
  )
  const sizeOptions = [25, 50, 100].filter((value) => value <= maxSize)
  const autoTriggerAllowed =
    subscriberCapabilities?.supports_auto_trigger !== false &&
    capabilities?.quota?.auto_trigger_allowed !== false
  const effectiveAutoTrigger = autoTriggerAllowed && autoTrigger

  const toggleProcedure = (id: string, checked: boolean) => {
    setProceduresTouched(true)
    setSelectedProcedures((current) => {
      const base = proceduresTouched ? current : defaults
      return checked
        ? [...new Set([...base, id])]
        : base.filter((item) => item !== id)
    })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || !identifierValid || !procedures.length) return
    onSubmit({
      name: name.trim(),
      scenario_id: '5g-sa',
      testbed_id: capabilities?.testbed_id ?? 'local',
      capture_agent_id: agent?.id ?? 'primary',
      identifier_type: identifierType,
      identifier: identifier.trim(),
      procedures,
      include_user_plane: includeUserPlane,
      include_sbi: includeSbi,
      auto_trigger: effectiveAutoTrigger,
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
              <UserRoundSearch className='size-5 text-primary' />
              Suscriptor objetivo
            </CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='subscriber-task-name'>Nombre de la tarea</Label>
              <Input
                id='subscriber-task-name'
                value={name}
                maxLength={80}
                required
                onChange={(event) => setName(event.target.value)}
                placeholder='Ej. UE01-Registration-PDU'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='subscriber-id-type'>Tipo de identificador</Label>
              <Select
                value={identifierType}
                onValueChange={(value) => {
                  setIdentifierType(value as 'imsi' | 'supi' | 'ue-ip')
                  setIdentifier('')
                }}
              >
                <SelectTrigger id='subscriber-id-type'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {identifierTypes
                    .filter((item) =>
                      ['imsi', 'supi', 'ue-ip'].includes(item.id)
                    )
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='subscriber-identifier'>
                {identifierType === 'ue-ip'
                  ? 'IP asignada al UE'
                  : 'Suscriptor'}
              </Label>
              {identifierType === 'ue-ip' ? (
                <Input
                  id='subscriber-identifier'
                  value={identifier}
                  required
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder='10.45.0.2'
                  aria-invalid={identifier.length > 0 && !identifierValid}
                />
              ) : (
                <Popover open={subscriberOpen} onOpenChange={setSubscriberOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id='subscriber-identifier'
                      type='button'
                      variant='outline'
                      role='combobox'
                      aria-expanded={subscriberOpen}
                      className='w-full justify-between font-mono font-normal'
                    >
                      {identifier ||
                        (subscribers.isLoading
                          ? 'Consultando suscriptores…'
                          : 'Seleccione o busque un IMSI')}
                      <ChevronsUpDown className='opacity-50' />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className='w-[var(--radix-popover-trigger-width)] p-0'
                    align='start'
                  >
                    <Command>
                      <CommandInput placeholder='Buscar IMSI…' />
                      <CommandList>
                        <CommandEmpty>
                          No se encontró el suscriptor.
                        </CommandEmpty>
                        <CommandGroup heading='Open5GS · perfiles disponibles'>
                          {subscribers.data?.map((subscriber) => (
                            <CommandItem
                              key={subscriber.imsi}
                              value={subscriber.imsi}
                              onSelect={(value) => {
                                setIdentifier(value)
                                setSubscriberOpen(false)
                              }}
                            >
                              <Check
                                className={cn(
                                  'size-4',
                                  identifier === subscriber.imsi
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                              <span className='font-mono'>
                                {subscriber.imsi}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
              {identifier.length > 0 && !identifierValid && (
                <p className='text-xs text-destructive'>
                  El identificador no tiene un formato válido.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Route className='size-5 text-primary' />
              Procedimientos y alcance
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='grid gap-3 sm:grid-cols-2'>
              {procedureOptions.map((procedure) => (
                <label
                  key={procedure.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    procedures.includes(procedure.id) &&
                      'border-primary/40 bg-primary/5'
                  )}
                >
                  <Checkbox
                    className='mt-0.5'
                    checked={procedures.includes(procedure.id)}
                    onCheckedChange={(checked) =>
                      toggleProcedure(procedure.id, checked === true)
                    }
                  />
                  <span>
                    <span className='block text-sm font-medium'>
                      {procedure.label}
                    </span>
                    {procedure.description && (
                      <span className='mt-1 block text-xs text-muted-foreground'>
                        {procedure.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {!procedures.length && (
              <p className='text-xs text-destructive'>
                Seleccione al menos un procedimiento.
              </p>
            )}

            <div className='grid gap-3 sm:grid-cols-3'>
              <ToggleOption
                label='Plano de usuario'
                description='Incluye N3 y N6 para correlacionar TEID e IP.'
                checked={includeUserPlane}
                disabled={subscriberCapabilities?.supports_user_plane === false}
                onCheckedChange={setIncludeUserPlane}
              />
              <ToggleOption
                label='Mensajes SBI'
                description='Incluye evidencia HTTP/2 entre las NFs.'
                checked={includeSbi}
                disabled={subscriberCapabilities?.supports_sbi === false}
                onCheckedChange={setIncludeSbi}
              />
              <ToggleOption
                label='Disparar procedimiento'
                description='Reinicia el UE de forma controlada al iniciar.'
                checked={effectiveAutoTrigger}
                disabled={!autoTriggerAllowed}
                onCheckedChange={setAutoTrigger}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className='grid gap-4 pt-6 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='subscriber-duration'>Duración</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id='subscriber-duration'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value < 60 ? `${value} s` : `${value / 60} min`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='subscriber-max-size'>Tamaño máximo</Label>
              <Select value={maxMegabytes} onValueChange={setMaxMegabytes}>
                <SelectTrigger id='subscriber-max-size'>
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
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className='h-fit xl:sticky xl:top-20'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Fingerprint className='size-5 text-primary' />
            Recorrido correlacionado
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-5'>
          <div>
            <p className='text-xs font-medium text-muted-foreground'>
              Funciones participantes
            </p>
            <div className='mt-2 flex flex-wrap gap-1.5'>
              {participatingComponents.map((component) => (
                <Badge key={component} variant='secondary'>
                  {component.toUpperCase()}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <p className='text-xs font-medium text-muted-foreground'>
              Interfaces capturadas
            </p>
            <div className='mt-2 flex flex-wrap gap-1.5'>
              {scope.map((item) => (
                <Badge key={item} variant='outline'>
                  {item}
                </Badge>
              ))}
            </div>
          </div>
          <div className='rounded-lg border bg-muted/30 p-3'>
            <div className='flex items-center gap-2 text-sm font-medium'>
              <Network className='size-4 text-primary' />
              Cadena objetivo
            </div>
            <p className='mt-2 font-mono text-xs leading-6 text-muted-foreground'>
              SUPI → NGAP IDs → PDU Session ID → PFCP SEID → GTP-U TEID → IP UE
            </p>
          </div>
          {effectiveAutoTrigger ? (
            <Alert>
              <Info />
              <AlertTitle>Captura con estímulo controlado</AlertTitle>
              <AlertDescription>
                El backend iniciará todas las capturas y luego provocará un
                nuevo registro del UE para no perder los primeros mensajes.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <Activity />
              <AlertTitle>Procedimiento manual requerido</AlertTitle>
              <AlertDescription>
                Inicie el registro o la sesión mientras la tarea esté
                capturando. De lo contrario, el resultado puede ser “sin
                tráfico”.
              </AlertDescription>
            </Alert>
          )}
          <div className='flex items-start gap-3 rounded-lg bg-muted/40 p-3'>
            <ShieldCheck className='mt-0.5 size-4 shrink-0 text-emerald-500' />
            <p className='text-xs text-muted-foreground'>
              El IMSI/SUPI se enmascara en listados y auditoría. Los filtros y
              comandos se resuelven exclusivamente en el backend.
            </p>
          </div>
          <Button
            className='w-full'
            type='submit'
            disabled={
              !canCreate ||
              !name.trim() ||
              !identifierValid ||
              !procedures.length ||
              isSubmitting
            }
          >
            {isSubmitting ? <Loader2 className='animate-spin' /> : <Play />}
            Crear e iniciar Subscriber Trace
          </Button>
        </CardContent>
      </Card>
    </form>
  )
}

function ToggleOption({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <div className='flex items-start justify-between gap-3 rounded-lg border p-3'>
      <div>
        <Label className='text-sm'>{label}</Label>
        <p className='mt-1 text-xs leading-relaxed text-muted-foreground'>
          {description}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}

function validateIdentifier(type: 'imsi' | 'supi' | 'ue-ip', value: string) {
  const clean = value.trim()
  if (type === 'imsi') return /^\d{14,15}$/.test(clean)
  if (type === 'supi') return /^(?:imsi-)?\d{14,15}$/i.test(clean)
  const octets = clean.split('.')
  return (
    octets.length === 4 &&
    octets.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  )
}

function makeTaskName() {
  const now = new Date()
  const part = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((value) => String(value).padStart(2, '0'))
    .join('')
  return `UE-TRACE-${part}`
}

function FormSkeleton() {
  return (
    <div className='grid animate-pulse gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]'>
      <div className='space-y-4'>
        <div className='h-64 rounded-xl bg-muted' />
        <div className='h-80 rounded-xl bg-muted' />
        <div className='h-28 rounded-xl bg-muted' />
      </div>
      <div className='h-[34rem] rounded-xl bg-muted' />
    </div>
  )
}
