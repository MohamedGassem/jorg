"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface RadioGroupContextValue {
  value?: string;
  onValueChange?: (value: string) => void;
}

const RadioGroupContext = React.createContext<RadioGroupContextValue>({});

interface RadioGroupProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
  value?: string;
  onValueChange?: (value: string) => void;
}

function RadioGroup({
  className,
  value,
  onValueChange,
  children,
  ...props
}: RadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onValueChange }}>
      <div role="radiogroup" className={cn("grid gap-2", className)} {...props}>
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
}

interface RadioGroupItemProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> {
  value: string;
}

function RadioGroupItem({ className, value, ...props }: RadioGroupItemProps) {
  const { value: groupValue, onValueChange } =
    React.useContext(RadioGroupContext);
  return (
    <input
      type="radio"
      className={cn(
        "h-4 w-4 rounded-full border border-input accent-primary cursor-pointer",
        className,
      )}
      value={value}
      checked={groupValue === value}
      onChange={(e) => {
        if (e.target.checked) {
          onValueChange?.(value);
        }
      }}
      {...props}
    />
  );
}

export { RadioGroup, RadioGroupItem };
