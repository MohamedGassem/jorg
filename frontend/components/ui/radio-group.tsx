"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface RadioGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string;
  onValueChange?: (value: string) => void;
}

function RadioGroup({ className, value, onValueChange, children, ...props }: RadioGroupProps) {
  return (
    <div
      role="radiogroup"
      data-value={value}
      className={cn("grid gap-2", className)}
      {...props}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<RadioGroupItemProps>, {
            groupValue: value,
            onGroupValueChange: onValueChange,
          })
        }
        return child
      })}
    </div>
  )
}

interface RadioGroupItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  value: string;
  groupValue?: string;
  onGroupValueChange?: (value: string) => void;
}

function RadioGroupItem({ className, value, groupValue, onGroupValueChange, ...props }: RadioGroupItemProps) {
  return (
    <input
      type="radio"
      className={cn(
        "h-4 w-4 rounded-full border border-input accent-primary cursor-pointer",
        className
      )}
      value={value}
      checked={groupValue === value}
      onChange={(e) => {
        if (e.target.checked) {
          onGroupValueChange?.(value)
        }
      }}
      {...props}
    />
  )
}

export { RadioGroup, RadioGroupItem }
