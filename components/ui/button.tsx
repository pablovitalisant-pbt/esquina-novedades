"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-pill border bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none shadow-xs focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        brand: "bg-gradient-brand text-[#FFF8EA] hover:scale-[1.02] shadow-xs",
        default:
          "bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground border border-border hover:bg-accent hover:text-foreground",
        outline:
          "bg-card text-foreground border-border hover:bg-muted",
        ghost:
          "bg-transparent text-foreground shadow-none hover:bg-muted",
        destructive:
          "bg-destructive text-destructive-foreground hover:brightness-110",
        warning:
          "bg-[var(--warning)] text-white hover:brightness-110",
        success:
          "bg-[var(--success)] text-white hover:brightness-110",
        link: "text-primary underline-offset-4 hover:underline shadow-none",
      },
      size: {
        xl: "h-10 gap-2 px-7 text-base",
        lg: "h-9 gap-2 px-6 text-base",
        default: "h-8 gap-1.5 px-5 text-sm",
        sm: "h-7 gap-1 px-4 text-sm",
        xs: "h-6 gap-1 px-4 text-xs",
        icon: "size-10",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
