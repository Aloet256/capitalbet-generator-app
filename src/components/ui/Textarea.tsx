import type { TextareaHTMLAttributes } from 'react'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, id, ...rest }: Props) {
  return (
    <div>
      {label && <label htmlFor={id} className="label">{label}</label>}
      <textarea id={id} className="input min-h-[90px] resize-y" {...rest} />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
