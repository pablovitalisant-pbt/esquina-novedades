import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-pill border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        brand: "bg-[var(--brand-soft)] text-[var(--fg-brand-strong)] border-[var(--border-brand-subtle)]",
        success: "bg-[var(--success-soft)] text-[var(--fg-success-strong)] border-[var(--border-success-subtle)]",
        destructive: "bg-[var(--danger-soft)] text-[var(--fg-danger-strong)] border-[var(--border-danger-subtle)]",
        secondary: "bg-secondary text-secondary-foreground border-border",
        warning: "bg-[var(--warning-soft)] text-[var(--fg-warning)] border-[var(--border-warning-subtle)]",
        outline: "border-border text-foreground",
        ghost: "bg-transparent text-foreground border-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
