import { cn } from '@/lib/utils'

type LogoProps = React.ImgHTMLAttributes<HTMLImageElement>

export function Logo({ className, ...props }: LogoProps) {
  return (
    <div className={cn('flex aspect-square size-9 items-center justify-center rounded-lg bg-[#272336] border border-[#443b59] p-0 shadow-sm overflow-hidden shrink-0', className)}>
      <img
        src='/images/ems-logo.png'
        alt='EMS Logo'
        className='size-full object-contain'
        {...props}
      />
    </div>
  )
}
