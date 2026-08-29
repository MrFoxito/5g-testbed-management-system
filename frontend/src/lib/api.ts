import axios from 'axios'
import { useAuthStore } from '@/stores/auth-store'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 15_000,
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().auth.accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export type Role = 'admin' | 'teacher' | 'student'
export type User = { username: string; role: Role; testbed: string | null }
export type ScenarioState =
  | 'stopped'
  | 'deploying'
  | 'running'
  | 'degraded'
  | 'stopping'
  | 'failed'
export type ComponentStatus = {
  id: string
  label: string
  kind: string
  status: string
  depends_on: string[]
}
export type ScenarioStatus = {
  scenario_id: string
  state: ScenarioState
  components: ComponentStatus[]
  updated_at: string
  message?: string
}
export type Metrics = {
  timestamp: string
  cpu_percent: number
  memory_percent: number
  interfaces: Record<string, { rx_mbps: number; tx_mbps: number }>
  rrc: { available: boolean; reason?: string }
}
export type Alarm = {
  id: string
  component: string
  severity:
    | 'critical'
    | 'major'
    | 'minor'
    | 'warning'
    | 'indeterminate'
    | 'cleared'
  message: string
  observed_at: string
}

export const canOperate = (role?: Role) =>
  role === 'admin' || role === 'teacher'
