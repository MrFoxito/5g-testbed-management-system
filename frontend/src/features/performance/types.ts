export type KpiObject = {
  id: string
  label: string
  type: 'testbed' | 'nf' | 'interface' | 'procedure'
  group: string
  status?: string
}

export type KpiCounter = {
  id: string
  label: string
  category: string
  unit: string
  kind: 'gauge' | 'counter'
  source: string
  objects: KpiObject['type'][]
}

export type PerformanceCatalog = {
  scenario_id: string
  testbed_id: string
  objects: KpiObject[]
  counters: KpiCounter[]
  collector: {
    interval_seconds: number
    retention_days: number
    stored_samples: number
    last_run?: { status: string; completed_at?: string; sample_count: number }
  }
}

export type KpiFolder = {
  id: string
  name: string
  owner: string
  testbed_id: string
  scope: 'personal' | 'testbed'
  created_at: string
}

export type SavedKpiQuery = {
  id: string
  name: string
  folder_id?: string
  owner: string
  scope: 'personal' | 'testbed'
  scenario_id: string
  object_ids: string[]
  counter_ids: string[]
  range_key: RangeKey
  granularity_seconds: number
  aggregation: Aggregation
}

export type RangeKey = '15m' | '1h' | '6h' | '24h' | '7d'
export type Aggregation = 'avg' | 'min' | 'max' | 'sum' | 'last'

export type KpiQueryDraft = {
  scenario_id: '5g-sa' | '4g-epc'
  object_ids: string[]
  counter_ids: string[]
  range_key: RangeKey
  granularity_seconds: number
  aggregation: Aggregation
}

export type KpiSeries = {
  id: string
  object_id: string
  counter_id: string
  label: string
  unit: string
  source: string
  quality: string
  points: { timestamp: string; epoch: number; value: number }[]
}

export type KpiQueryResult = {
  testbed_id: string
  scenario_id: string
  start: string
  end: string
  sample_count: number
  granularity_seconds: number
  aggregation: Aggregation
  series: KpiSeries[]
}
