import type { OperationDefinition, OperationResult, OperationsCatalog } from './types'

export const MML_TO_OP: Record<string, { opId: string; defaultTarget?: string }> = {
  'DSP GNB-STATUS': { opId: 'gnb.status', defaultTarget: 'gnb' },
  'DSP GNB-INFO': { opId: 'gnb.info', defaultTarget: 'gnb' },
  'LST GNB-AMF': { opId: 'gnb.amf-list', defaultTarget: 'gnb' },
  'DSP GNB-AMF-INFO': { opId: 'gnb.amf-info', defaultTarget: 'gnb' },
  'DSP GNB-UECOUNT': { opId: 'gnb.ue-count', defaultTarget: 'gnb' },
  'LST GNB-UE': { opId: 'gnb.ue-list', defaultTarget: 'gnb' },
  'DSP UE-STATUS': { opId: 'ue.status', defaultTarget: 'ue' },
  'DSP UE-INFO': { opId: 'ue.info', defaultTarget: 'ue' },
  'DSP UE-COVERAGE': { opId: 'ue.coverage', defaultTarget: 'ue' },
  'DSP UE-RLS': { opId: 'ue.rls-state', defaultTarget: 'ue' },
  'DSP UE-TIMERS': { opId: 'ue.timers', defaultTarget: 'ue' },
  'LST PDU-SESSION': { opId: 'ue.pdu-list', defaultTarget: 'ue' },
  'RLS PDU-SESSION': { opId: 'ue.pdu-release', defaultTarget: 'ue' },
  'SET UE-DEREGISTER': { opId: 'ue.deregister', defaultTarget: 'ue' },
  'LST AMF-UE-CONTEXT': { opId: 'amf.ue-info', defaultTarget: 'amf' },
  'LST AMF-GNB-ASSOC': { opId: 'amf.gnb-info', defaultTarget: 'amf' },
  'LST SMF-PDU-SESSION': { opId: 'smf.pdu-info', defaultTarget: 'smf' },
  'LST MME-UE-CONTEXT': { opId: 'mme.ue-info', defaultTarget: 'mme' },
  'LST MME-ENB-ASSOC': { opId: 'mme.enb-info', defaultTarget: 'mme' },
  'DSP NF-STATUS': { opId: 'system.status' },
  'LST NF-LOG': { opId: 'system.logs' },
  'CHK NF-ENDPOINT': { opId: 'network.endpoints' },
  'RST NF': { opId: 'system.restart' },
  'DSP SW-VERSION': { opId: 'software.version' },
}

export const MML_SUGGESTIONS = [
  'DSP GNB-STATUS;',
  'DSP GNB-INFO;',
  'LST GNB-AMF;',
  'DSP GNB-AMF-INFO;',
  'DSP GNB-UECOUNT;',
  'LST GNB-UE;',
  'DSP UE-STATUS;',
  'DSP UE-INFO;',
  'DSP UE-COVERAGE;',
  'DSP UE-RLS;',
  'DSP UE-TIMERS;',
  'LST PDU-SESSION;',
  'RLS PDU-SESSION: PSI=1;',
  'SET UE-DEREGISTER;',
  'LST AMF-UE-CONTEXT;',
  'LST AMF-GNB-ASSOC;',
  'LST SMF-PDU-SESSION;',
  'DSP NF-STATUS: NF="AMF";',
  'LST NF-LOG: NF="AMF", LINES=100;',
  'CHK NF-ENDPOINT: NF="AMF";',
  'RST NF: NF="AMF";',
  'DSP SW-VERSION: NF="AMF";',
]

export function toMmlSyntax(
  operation: OperationDefinition,
  componentId: string,
  componentLabel: string,
  parameters: Record<string, unknown>
): string {
  const paramPairs: string[] = []
  for (const [k, v] of Object.entries(parameters)) {
    if (v !== undefined && v !== '' && v !== null) {
      if (typeof v === 'number') {
        paramPairs.push(`${k.toUpperCase()}=${v}`)
      } else {
        paramPairs.push(`${k.toUpperCase()}="${v}"`)
      }
    }
  }

  const codeMap: Record<string, string> = {
    'gnb.status': 'DSP GNB-STATUS',
    'gnb.info': 'DSP GNB-INFO',
    'gnb.amf-list': 'LST GNB-AMF',
    'gnb.amf-info': 'DSP GNB-AMF-INFO',
    'gnb.ue-count': 'DSP GNB-UECOUNT',
    'gnb.ue-list': 'LST GNB-UE',
    'ue.status': 'DSP UE-STATUS',
    'ue.info': 'DSP UE-INFO',
    'ue.coverage': 'DSP UE-COVERAGE',
    'ue.rls-state': 'DSP UE-RLS',
    'ue.timers': 'DSP UE-TIMERS',
    'ue.pdu-list': 'LST PDU-SESSION',
    'ue.pdu-release': 'RLS PDU-SESSION',
    'ue.deregister': 'SET UE-DEREGISTER',
    'amf.ue-info': 'LST AMF-UE-CONTEXT',
    'amf.gnb-info': 'LST AMF-GNB-ASSOC',
    'smf.pdu-info': 'LST SMF-PDU-SESSION',
    'mme.ue-info': 'LST MME-UE-CONTEXT',
    'mme.enb-info': 'LST MME-ENB-ASSOC',
    'system.status': `DSP NF-STATUS`,
    'system.logs': `LST NF-LOG`,
    'network.endpoints': `CHK NF-ENDPOINT`,
    'system.restart': `RST NF`,
    'software.version': `DSP SW-VERSION`,
  }

  const baseCode =
    codeMap[operation.id] ??
    `${operation.mutating ? 'SET' : 'DSP'} ${componentId.toUpperCase()}-${operation.id.replace('.', '-').toUpperCase()}`

  if (operation.id.startsWith('system.') || operation.id.startsWith('network.') || operation.id.startsWith('software.')) {
    paramPairs.unshift(`NF="${componentLabel}"`)
  }

  const paramsString = paramPairs.length ? `: ${paramPairs.join(', ')}` : ':'
  return `%%${baseCode}${paramsString};%%`
}

export type ParseMmlResult =
  | {
      success: true
      componentId: string
      componentLabel: string
      operationId: string
      parameters: Record<string, unknown>
      normalizedMml: string
    }
  | {
      success: false
      error: string
    }

export function parseMmlCommand(
  rawInput: string,
  catalog?: OperationsCatalog
): ParseMmlResult {
  if (!catalog || !catalog.components.length) {
    return { success: false, error: 'Catálogo de operaciones no disponible.' }
  }

  let clean = rawInput.trim()
  if (!clean) {
    return { success: false, error: 'El comando no puede estar vacío.' }
  }

  // Quitar %% inicial y final si existen
  if (clean.startsWith('%%')) clean = clean.slice(2).trim()
  if (clean.endsWith('%%')) clean = clean.slice(0, -2).trim()
  // Quitar punto y coma final
  if (clean.endsWith(';')) clean = clean.slice(0, -1).trim()

  // Separar comando y parámetros por ':'
  const colonIndex = clean.indexOf(':')
  let commandStr: string
  let paramsStr = ''

  if (colonIndex >= 0) {
    commandStr = clean.slice(0, colonIndex).trim().toUpperCase()
    paramsStr = clean.slice(colonIndex + 1).trim()
  } else {
    commandStr = clean.trim().toUpperCase()
  }

  // Parsear parámetros KEY=VAL
  const rawParams: Record<string, string | number> = {}
  if (paramsStr) {
    const regex = /([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^,;\s]+))/g
    let match
    while ((match = regex.exec(paramsStr)) !== null) {
      const key = match[1].toLowerCase()
      const valStr = match[2] ?? match[3] ?? match[4]
      const numVal = Number(valStr)
      rawParams[key] = !isNaN(numVal) && valStr.trim() !== '' ? numVal : valStr
    }
  }

  // Buscar en MML_TO_OP
  const mapping = MML_TO_OP[commandStr]
  if (!mapping) {
    return {
      success: false,
      error: `Comando MML "${commandStr}" no reconocido. Ejemplos válidos: DSP GNB-STATUS;, LST NF-LOG: NF="AMF", LINES=50;`,
    }
  }

  const { opId, defaultTarget } = mapping

  // Determinar componente destino
  let targetCompId = defaultTarget
  if (rawParams['nf']) {
    const nfQuery = String(rawParams['nf']).toLowerCase()
    const found = catalog.components.find(
      (c) => c.id.toLowerCase() === nfQuery || c.label.toLowerCase() === nfQuery
    )
    if (found) {
      targetCompId = found.id
    }
  }

  if (!targetCompId) {
    return {
      success: false,
      error: `El comando "${commandStr}" requiere especificar la función de red mediante el parámetro NF="nombre" (ej. NF="AMF").`,
    }
  }

  const component = catalog.components.find((c) => c.id === targetCompId)
  if (!component) {
    return {
      success: false,
      error: `Función de red "${targetCompId}" no encontrada en el escenario actual.`,
    }
  }

  const operation = component.operations.find((op) => op.id === opId)
  if (!operation) {
    return {
      success: false,
      error: `La operación "${opId}" no está soportada para el nodo "${component.label}".`,
    }
  }

  // Mapear parámetros a los esperados por el backend
  const cleanParams: Record<string, unknown> = {}
  for (const p of operation.parameters) {
    if (rawParams[p.id.toLowerCase()] !== undefined) {
      cleanParams[p.id] = rawParams[p.id.toLowerCase()]
    } else if (rawParams['node'] !== undefined && p.id === 'node_name') {
      cleanParams['node_name'] = rawParams['node']
    } else if (p.default !== undefined) {
      cleanParams[p.id] = p.default
    }
  }

  const normalized = toMmlSyntax(
    operation,
    component.id,
    component.label,
    cleanParams
  )

  return {
    success: true,
    componentId: component.id,
    componentLabel: component.label,
    operationId: operation.id,
    parameters: cleanParams,
    normalizedMml: normalized,
  }
}

export function formatTelcoReport(
  result: OperationResult,
  mmlCommand: string
): string {
  const timestamp = new Date(result.started_at).toLocaleString()
  const retCode = result.status === 'success' ? '0' : '1'
  const retMsg = result.status === 'success' ? 'Operation Succeeded' : 'Operation Failed'

  const border = '-'.repeat(70)

  return [
    `+++    EMS-5G-LAB         ${timestamp}`,
    `O&M    #${result.id.slice(0, 8)}       OPERATOR: ${result.username} (${result.role})`,
    mmlCommand,
    `RETCODE = ${retCode}  ${retMsg}.`,
    border,
    result.output.trim() || '(Sin salida de texto)',
    border,
    `Duration: ${result.duration_ms} ms | Source: ${result.source} | Target: ${result.component_label}`,
    `--- END OF MML REPORT ---`,
  ].join('\n')
}
