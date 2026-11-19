import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  secondary?: boolean
}

export default function Button({
  children,
  secondary = false,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`btn${secondary ? ' btn-secondary' : ''}${className ? ` ${className}` : ''}`}
    >
      {children}
    </button>
  )
}
