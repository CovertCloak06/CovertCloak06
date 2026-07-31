import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-charcoal-900 text-paper hover:bg-charcoal-800 border border-charcoal-900",
        primary:
          "bg-steel-600 text-white hover:bg-steel-700 border border-steel-700",
        outline:
          "border border-charcoal-300 bg-transparent text-charcoal-900 hover:bg-charcoal-100",
        ghost: "text-charcoal-700 hover:bg-charcoal-100",
        urgent:
          "bg-urgent-600 text-white hover:bg-urgent-700 border border-urgent-700",
      },
      size: {
        default: "h-11 px-5 text-sm",
        sm: "h-9 px-3 text-sm",
        lg: "h-13 min-h-12 px-6 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

/** Anchor styled as a button — used for tel:, mailto:, and downloads. */
function ButtonLink({
  className,
  variant,
  size,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & VariantProps<typeof buttonVariants>) {
  return (
    <a className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { Button, ButtonLink, buttonVariants };
