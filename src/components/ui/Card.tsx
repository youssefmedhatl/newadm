import { cn } from '@/lib/utils'

type CardProps = React.HTMLAttributes<HTMLDivElement>

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-2xl border border-sand bg-white', className)}
      {...props}
    >
      {children}
    </div>
  )
}

type CardHeaderProps = React.HTMLAttributes<HTMLDivElement>

export function CardHeader({ className, children, ...props }: CardHeaderProps) {
  return (
    <div className={cn('px-6 py-4 border-b border-sand', className)} {...props}>
      {children}
    </div>
  )
}

type CardTitleProps = React.HTMLAttributes<HTMLHeadingElement>

export function CardTitle({ className, children, ...props }: CardTitleProps) {
  return (
    <h2 className={cn('text-lg font-semibold text-ink', className)} {...props}>
      {children}
    </h2>
  )
}

type CardBodyProps = React.HTMLAttributes<HTMLDivElement>

export function CardBody({ className, children, ...props }: CardBodyProps) {
  return (
    <div className={cn('px-6 py-4', className)} {...props}>
      {children}
    </div>
  )
}

type CardFooterProps = React.HTMLAttributes<HTMLDivElement>

export function CardFooter({ className, children, ...props }: CardFooterProps) {
  return (
    <div
      className={cn('px-6 py-4 border-t border-sand bg-bone/30', className)}
      {...props}
    >
      {children}
    </div>
  )
}
