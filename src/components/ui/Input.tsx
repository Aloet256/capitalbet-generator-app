import type { InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, id, ...rest }: Props) {
  return (
    <div>
      {label && <label htmlFor={id} className="label">{label}</label>}
      <input id={id} className="input" {...rest} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
