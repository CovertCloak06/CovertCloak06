"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Accessible form primitives: label, input, textarea, select, checkbox,
 * radio, and an error line wired for screen readers via aria-describedby. */

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-sm font-medium text-charcoal-800", className)}
      {...props}
    />
  );
}

const inputClasses =
  "block w-full rounded-md border border-charcoal-300 bg-white px-3 py-2.5 text-base text-charcoal-900 placeholder:text-charcoal-400 focus:border-steel-600 aria-[invalid=true]:border-urgent-600";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClasses, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(inputClasses, "min-h-32", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(inputClasses, "h-11", className)} {...props} />
));
Select.displayName = "Select";

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={cn(
      "mt-0.5 size-5 shrink-0 rounded border-charcoal-400 accent-steel-600",
      className,
    )}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";

export const Radio = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="radio"
    className={cn("size-5 shrink-0 accent-steel-600", className)}
    {...props}
  />
));
Radio.displayName = "Radio";

export function FieldError({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm font-medium text-urgent-700">
      {message}
    </p>
  );
}
