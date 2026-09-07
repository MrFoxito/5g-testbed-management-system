import { Activity } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { KpiQueryResult, KpiSeries } from './types'

const COLORS = [
  '#0ea5e9',
  '#22c55e',
  '#f97316',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#eab308',
  '#64748b',
]
const timeLabel = (value: unknown) =>
  new Date(String(value)).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
const tooltipStyle = {
  borderRadius: 8,
  background: 'var(--popover)',
  borderColor: 'var(--border)',
}

export function PerformanceChart({ result }: { result?: KpiQueryResult }) {
  if (!result?.series.length) {
    return (
      <div className='flex h-[440px] flex-col items-center justify-center rounded-md border border-dashed text-center'>
        <div className='rounded-full bg-muted p-3'>
          <Activity className='size-6 text-muted-foreground' />
        </div>
        <p className='mt-3 font-medium'>Sin muestras para la consulta</p>
        <p className='mt-1 max-w-md text-sm text-muted-foreground'>
          Seleccione objetos y contadores. El recolector continuará generando
          historial aunque cierre el navegador.
        </p>
      </div>
    )
  }
  if (
    result.series.every((series) =>
      series.object_id.startsWith('procedure:')
    ) &&
    new Set(result.series.map((s) => s.object_id)).size === 1 &&
    result.series.some((series) => series.counter_id.endsWith('.attempts'))
  ) {
    return <ProcedureChart result={result} />
  }
  const units = [...new Set(result.series.map((s) => s.unit))]
  if (units.length > 1) {
    return (
      <div className='space-y-4'>
        {units.map((unit) => (
          <section key={unit}>
            <h3 className='mb-1 text-xs font-medium text-muted-foreground'>
              Unidad: {unit}
            </h3>
            <PerformanceChart
              result={{
                ...result,
                series: result.series.filter((s) => s.unit === unit),
              }}
            />
          </section>
        ))}
      </div>
    )
  }
  const timestamps = uniqueTimestamps(result.series)
  const rows = timestamps.map((timestamp) => {
    const row: Record<string, string | number> = { timestamp }
    result.series.forEach((series) => {
      const point = series.points.find((item) => item.timestamp === timestamp)
      if (point) row[series.id] = point.value
    })
    return row
  })
  return (
    <div className='h-[440px] w-full'>
      <ResponsiveContainer width='100%' height='100%'>
        <LineChart
          data={rows}
          margin={{ top: 18, right: 24, left: 2, bottom: 16 }}
        >
          <CartesianGrid strokeDasharray='3 3' opacity={0.35} />
          <XAxis
            dataKey='timestamp'
            tickFormatter={timeLabel}
            minTickGap={40}
            fontSize={11}
          />
          <YAxis fontSize={11} width={58} />
          <Tooltip
            labelFormatter={(value) => new Date(String(value)).toLocaleString()}
            contentStyle={tooltipStyle}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
          {result.series.map((series, index) => (
            <Line
              key={series.id}
              type='monotone'
              dataKey={series.id}
              name={`${series.label} (${series.unit})`}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={2}
              dot={rows.length < 20}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function ProcedureChart({ result }: { result: KpiQueryResult }) {
  const attempts = findSeries(result.series, '.attempts')
  const successes = findSeries(result.series, '.successes')
  const rejects = findSeries(result.series, '.rejects')
  const unresolved = findSeries(result.series, '.unresolved')
  const successRate = findSeries(result.series, '.success_rate')
  const latency = findSeries(result.series, '.latency_ms')
  const current = result.series.find(
    (series) =>
      series.counter_id.endsWith('.registered') ||
      series.counter_id.endsWith('.attached') ||
      series.counter_id.endsWith('.active')
  )
  const timestamps = uniqueTimestamps(result.series)
  const rows = timestamps.map((timestamp, index) => {
    return {
      timestamp,
      attempts: deltaAt(attempts, timestamp, index, timestamps),
      successes: deltaAt(successes, timestamp, index, timestamps),
      rejects: deltaAt(rejects, timestamp, index, timestamps),
      successRate: valueAt(successRate, timestamp),
      latency: valueAt(latency, timestamp),
    }
  })
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-2 lg:grid-cols-5'>
        <ProcedureTotal label='Activos ahora' value={latest(current)} />
        <ProcedureTotal label='Intentos' value={latest(attempts)} />
        <ProcedureTotal
          label='Exitosos'
          value={latest(successes)}
          tone='success'
        />
        <ProcedureTotal
          label='Rechazados'
          value={latest(rejects)}
          tone='danger'
        />
        <ProcedureTotal
          label='Sin resultado'
          value={latest(unresolved)}
          tone='warning'
        />
      </div>
      <section>
        <div className='mb-1 flex items-center justify-between'>
          <p className='text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
            Eventos nuevos por intervalo
          </p>
          <p className='text-xs text-muted-foreground'>No acumulados</p>
        </div>
        <div className='h-[210px]'>
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart
              data={rows}
              margin={{ top: 8, right: 12, left: -18, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray='3 3' opacity={0.35} />
              <XAxis
                dataKey='timestamp'
                tickFormatter={timeLabel}
                minTickGap={36}
                fontSize={10}
              />
              <YAxis allowDecimals={false} fontSize={10} />
              <Tooltip
                labelFormatter={(value) =>
                  new Date(String(value)).toLocaleString()
                }
                contentStyle={tooltipStyle}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar
                dataKey='attempts'
                name='Intentos nuevos'
                fill='#0ea5e9'
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey='successes'
                name='Éxitos nuevos'
                fill='#22c55e'
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey='rejects'
                name='Rechazos nuevos'
                fill='#ef4444'
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      {(successRate || latency) && (
        <section>
          <p className='mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
            Calidad del procedimiento
          </p>
          <div className='h-[145px]'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart
                data={rows}
                margin={{ top: 8, right: 8, left: -18, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray='3 3' opacity={0.35} />
                <XAxis
                  dataKey='timestamp'
                  tickFormatter={timeLabel}
                  minTickGap={36}
                  fontSize={10}
                />
                <YAxis
                  yAxisId='rate'
                  domain={[0, 100]}
                  fontSize={10}
                  unit='%'
                />
                <YAxis
                  yAxisId='latency'
                  orientation='right'
                  fontSize={10}
                  unit='ms'
                />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(String(value)).toLocaleString()
                  }
                  contentStyle={tooltipStyle}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {successRate && (
                  <Line
                    yAxisId='rate'
                    type='monotone'
                    dataKey='successRate'
                    name='Tasa de éxito (%)'
                    stroke='#a855f7'
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )}
                {latency && (
                  <Line
                    yAxisId='latency'
                    type='monotone'
                    dataKey='latency'
                    name='Latencia (ms)'
                    stroke='#eab308'
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  )
}

function ProcedureTotal({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number
  tone?: 'default' | 'success' | 'warning' | 'danger'
}) {
  const colors = {
    default: 'text-foreground',
    success: 'text-emerald-500',
    warning: 'text-amber-500',
    danger: 'text-red-500',
  }
  return (
    <div className='rounded-md border bg-muted/15 px-3 py-2'>
      <p className='truncate text-[11px] text-muted-foreground'>{label}</p>
      <p className={`text-lg font-semibold ${colors[tone]}`}>{value}</p>
    </div>
  )
}

function uniqueTimestamps(series: KpiSeries[]) {
  return [
    ...new Set(
      series.flatMap((item) => item.points.map((point) => point.timestamp))
    ),
  ].sort()
}

function findSeries(series: KpiSeries[], suffix: string) {
  return series.find((item) => item.counter_id.endsWith(suffix))
}

function valueAt(series: KpiSeries | undefined, timestamp: string) {
  return series?.points.find((point) => point.timestamp === timestamp)?.value
}

function latest(series?: KpiSeries) {
  return series?.points[series.points.length - 1]?.value ?? 0
}

function deltaAt(
  series: KpiSeries | undefined,
  timestamp: string,
  index: number,
  timestamps: string[]
) {
  const current = valueAt(series, timestamp)
  if (current === undefined || index === 0) return 0
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previous = valueAt(series, timestamps[previousIndex])
    if (previous !== undefined) return Math.max(current - previous, 0)
  }
  return 0
}
