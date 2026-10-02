import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        law_enforcement: "border-steel-700 bg-steel-100 text-steel-700",
        official_record: "border-steel-600 bg-steel-100 text-steel-700",
        media: "border-charcoal-400 bg-charcoal-100 text-charcoal-700",
        campaign: "border-charcoal-300 bg-charcoal-50 text-charcoal-600",
        neutral: "border-charcoal-300 bg-white text-charcoal-700",
        warning: "border-urgent-700 bg-urgent-100 text-urgent-700",
        status: "border-charcoal-300 bg-charcoal-100 text-charcoal-800",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
