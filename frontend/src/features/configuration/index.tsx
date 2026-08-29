import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { api, canOperate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmsPage } from '@/features/ems-page'

const initial =
  'amf:\n  plmn_support:\n    - plmn_id:\n        mcc: "716"\n        mnc: "10"\n      tac: 1\n'
export function ConfigurationPage() {
  const role = useAuthStore((s) => s.auth.user?.role)
  const [path, setPath] = useState('amf.yaml')
  const [content, setContent] = useState(initial)
  const [diff, setDiff] = useState('')
  const compare = async () => {
    try {
      setDiff(
        (await api.post('/config/diff', { path, content })).data.diff ||
          'Sin cambios'
      )
    } catch {
      toast.error('YAML o ruta inválidos')
    }
  }
  const save = async () => {
    try {
      const result = (await api.put('/config', { path, content })).data
      toast.success(
        result.backup ? 'Guardado con respaldo' : 'Configuración guardada'
      )
    } catch {
      toast.error('No se pudo guardar')
    }
  }
  return (
    <EmsPage
      title='Configuración'
      description='Edición YAML validada con diff, respaldo y restauración.'
      actions={
        <Input
          className='w-56 font-mono'
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
      }
    >
      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardContent className='h-[560px] p-0'>
            <Editor
              theme='vs-dark'
              language='yaml'
              value={content}
              onChange={(value) => setContent(value ?? '')}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                automaticLayout: true,
                readOnly: !canOperate(role),
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className='h-[560px] overflow-auto bg-muted/30 pt-6'>
            <pre className='text-xs whitespace-pre-wrap'>
              {diff || 'Valide la propuesta para visualizar el diff.'}
            </pre>
          </CardContent>
        </Card>
      </div>
      <div className='mt-4 flex justify-end gap-2'>
        <Button variant='outline' onClick={compare}>
          Validar y comparar
        </Button>
        {canOperate(role) && (
          <Button onClick={save}>Guardar con respaldo</Button>
        )}
      </div>
    </EmsPage>
  )
}
