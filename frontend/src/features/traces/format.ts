export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDuration(seconds?: number) {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`
}

export function formatTimestamp(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function maskTraceIdentifier(value?: string, kind?: string) {
  if (!value) return 'No identificado'
  if (value.includes('*') || value.includes('•')) return value
  const normalizedKind = (kind ?? '').toLowerCase()
  if (!['imsi', 'supi'].includes(normalizedKind) || value.length < 9) return value
  const prefix = value.toLowerCase().startsWith('imsi-') ? 'imsi-' : ''
  const digits = prefix ? value.slice(prefix.length) : value
  return `${prefix}${digits.slice(0, 5)}${'•'.repeat(Math.max(digits.length - 9, 3))}${digits.slice(-4)}`
}
