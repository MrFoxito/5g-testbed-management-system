import { BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function TraceFormHelp({ mode }: { mode: 'interface' | 'subscriber' }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type='button' variant='ghost' size='sm'>
          <BookOpen />
          Referencia
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'interface' ? 'Interface Trace' : 'Subscriber Trace'}
          </DialogTitle>
          <DialogDescription>
            Parámetros y alcance de la captura.
          </DialogDescription>
        </DialogHeader>
        <dl className='space-y-4 text-sm [&_dd]:leading-relaxed [&_dd]:text-muted-foreground [&_dt]:mb-1 [&_dt]:font-medium'>
          {mode === 'interface' ? (
            <>
              <div>
                <dt>Agente y función de red</dt>
                <dd>
                  El agente es el host que ejecuta la captura. La NF determina
                  los puntos de captura disponibles en el catálogo del servidor.
                </dd>
              </div>
              <div>
                <dt>Interfaz 3GPP</dt>
                <dd>
                  Selecciona el perfil autorizado de captura. En N2, NAS viaja
                  encapsulado en NGAP; N1 no se presenta como una interfaz
                  física independiente.
                </dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Suscriptor y procedimientos</dt>
                <dd>
                  Selecciona el perfil IMSI/SUPI o introduce la IP del UE. Los
                  procedimientos delimitan el análisis; la correlación depende
                  de los identificadores presentes en la evidencia.
                </dd>
              </div>
              <div>
                <dt>Plano de usuario y SBI</dt>
                <dd>
                  Plano de usuario incluye N3 y N6 para correlacionar TEID e IP.
                  SBI incluye comunicaciones HTTP/2 entre funciones del core. La
                  captura no garantiza que todas las NFs o procedimientos tengan
                  eventos.
                </dd>
              </div>
              <div>
                <dt>Reiniciar UE al iniciar</dt>
                <dd>
                  Provoca un nuevo registro después de iniciar la captura y
                  puede interrumpir la sesión actual del UE. Si está
                  desactivado, inicia el procedimiento manualmente mientras se
                  captura.
                </dd>
              </div>
              <div>
                <dt>Evidencia</dt>
                <dd>
                  La correlación puede vincular SUPI, identificadores NGAP,
                  sesión PDU, SEID, TEID e IP. Una captura de paquetes no
                  equivale a observar todos los eventos internos de una NF.
                </dd>
              </div>
            </>
          )}
          <div>
            <dt>Duración y tamaño máximo</dt>
            <dd>
              La tarea se limita por tiempo y volumen según las cuotas del
              servidor. Iniciar captura crea y ejecuta la tarea; cerrar la
              página no la detiene.
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  )
}
