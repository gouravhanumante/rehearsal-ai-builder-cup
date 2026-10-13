import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'quiet'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  icon?: ReactNode
}

export function Button({
  children,
  className = '',
  icon,
  variant = 'secondary',
  ...props
}: ButtonProps) {
  return (
    <button className={`ds-button ds-button--${variant} ${className}`.trim()} {...props}>
      {icon && <span className="ds-button__icon" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  )
}
