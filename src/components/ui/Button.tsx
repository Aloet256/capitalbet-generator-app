import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
}

export function Button({ variant = 'primary', className, ...rest }: Props) {
  const cls = variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-secondary'
  return <button className={cn(cls, className)} {...rest} />
}
