import capitalbetLogo from '../assets/capitalbet-wordmark.png'
import { cn } from '../lib/utils'

type BrandLogoProps = {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  fullWidth?: boolean
  className?: string
}

const sizes = {
  sm: {
    badge: 'h-8 px-2.5 rounded-lg',
    image: 'h-5 max-w-[110px]',
    label: 'text-sm',
  },
  md: {
    badge: 'h-9 px-3 rounded-lg',
    image: 'h-6 max-w-[132px]',
    label: 'text-sm',
  },
  lg: {
    badge: 'h-12 px-4 rounded-xl',
    image: 'h-8 max-w-[190px]',
    label: 'text-base',
  },
}

export function BrandLogo({ size = 'md', label, fullWidth = false, className }: BrandLogoProps) {
  const style = sizes[size]

  return (
    <div className={cn('inline-flex min-w-0 items-center gap-2.5', fullWidth && 'w-full', className)}>
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden bg-[#c51a2b] shadow-sm ring-1 ring-black/10 dark:ring-white/10',
          fullWidth && 'w-full',
          style.badge,
        )}
      >
        <img
          src={capitalbetLogo}
          alt="CapitalBet"
          draggable={false}
          className={cn('block object-contain', fullWidth ? 'h-full w-full max-w-none py-1.5' : `w-auto ${style.image}`)}
        />
      </span>
      {label && <span className={cn('truncate font-bold text-slate-900 dark:text-white', style.label)}>{label}</span>}
    </div>
  )
}
