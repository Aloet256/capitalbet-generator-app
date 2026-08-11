import type { InputHTMLAttributes } from 'react'
import { formatCurrencyInput } from '../../lib/utils'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label?: string
  error?: string
  value: string | number
  onValueChange: (value: string) => void
}

export function CurrencyInput({ label, error, id, value, onValueChange, ...rest }: Props) {
  return (
    <div>
      {label && <label htmlFor={id} className="label">{label}</label>}
      <input
        id={id}
        className="input"
        type="text"
        inputMode="numeric"
        value={formatCurrencyInput(value)}
        onChange={(e) => onValueChange(formatCurrencyInput(e.target.value))}
        {...rest}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
