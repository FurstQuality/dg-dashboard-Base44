import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * FormField — persistent label + hint + inline error wrapper.
 * Never a floating placeholder. Enforces 44px control height by default.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const describedBy: string[] = [];
  if (hint) describedBy.push(`${id}-hint`);
  if (error) describedBy.push(`${id}-error`);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-sm">
        {label}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id,
            "aria-invalid": !!error || undefined,
            "aria-describedby": describedBy.join(" ") || undefined,
            "aria-required": required || undefined,
          })
        : children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
