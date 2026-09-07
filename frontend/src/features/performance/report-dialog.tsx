import { useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { KpiQueryDraft, SavedKpiQuery } from './types'

export function ReportDialog({
  draft,
  title,
  savedQueries,
  disabled,
}: {
  draft: KpiQueryDraft
  title: string
  savedQueries: SavedKpiQuery[]
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('Informe de rendimiento del testbed')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const generate = async () => {
    setBusy(true)
    try {
      const queries = [
        { ...draft, name: title },
        ...savedQueries
          .filter((q) => selected.includes(q.id))
          .map((q) => ({
            scenario_id: q.scenario_id,
            object_ids: q.object_ids,
            counter_ids: q.counter_ids,
            range_key: q.range_key,
            granularity_seconds: q.granularity_seconds,
            aggregation: q.aggregation,
            name: q.name,
          })),
      ]
      const response = await api.post(
        '/performance/report',
        { title: name.trim(), queries },
        { responseType: 'blob', timeout: 120_000 }
      )
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `EMS-Performance-${new Date().toISOString().slice(0, 10)}.docx`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('Informe Word generado desde el historial del EMS')
      setOpen(false)
    } catch (error) {
      const response = (error as { response?: { data?: Blob } }).response
      let message = apiErrorMessage(error, 'No se pudo generar el informe')
      if (response?.data instanceof Blob) {
        try {
          const body = JSON.parse(await response.data.text())
          if (typeof body.detail === 'string') message = body.detail
        } catch {
          /* keep fallback */
        }
      }
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button
        variant='outline'
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <FileText /> Informe Word
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value)
        }}
      >
        <DialogContent className='sm:max-w-xl'>
          <DialogHeader>
            <DialogTitle>Informe de KPI</DialogTitle>
            <DialogDescription>
              Flujo de MAEstro adaptado al EMS: consultas, gráficas y
              estadísticas en un documento. No requiere capturas ni conexión al
              MAE.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label='Título del informe'
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
          <div className='rounded border bg-muted/20 p-3 text-sm'>
            <strong>Consulta actual incluida</strong>
            <p className='mt-1 text-muted-foreground'>
              {title} · {draft.range_key} · {draft.counter_ids.length}{' '}
              contadores
            </p>
          </div>
          <p className='text-sm font-medium'>
            Agregar consultas guardadas ({selected.length}/5)
          </p>
          <ScrollArea className='max-h-64'>
            <div className='space-y-2'>
              {savedQueries.map((query) => (
                <label
                  key={query.id}
                  className='flex items-center gap-3 rounded border p-3 text-sm'
                >
                  <Checkbox
                    checked={selected.includes(query.id)}
                    disabled={
                      !selected.includes(query.id) && selected.length >= 5
                    }
                    onCheckedChange={() =>
                      setSelected((ids) =>
                        ids.includes(query.id)
                          ? ids.filter((id) => id !== query.id)
                          : [...ids, query.id]
                      )
                    }
                  />
                  <span>
                    {query.name}
                    <span className='block text-xs text-muted-foreground'>
                      {query.scenario_id} · {query.range_key}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {!savedQueries.length && (
              <p className='text-sm text-muted-foreground'>
                Guarde consultas en su biblioteca para agruparlas en futuros
                informes.
              </p>
            )}
          </ScrollArea>
          <p className='text-xs text-muted-foreground'>
            Fechas del informe en UTC. Cada consulta conserva su periodo. Los
            datos ausentes se indican; no se rellenan con cero. Hasta 60 series
            por documento.
          </p>
          <DialogFooter>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              disabled={busy || !name.trim()}
              onClick={() => void generate()}
            >
              <Download /> {busy ? 'Generando…' : 'Generar Word'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
