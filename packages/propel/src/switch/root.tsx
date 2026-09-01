/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { Switch as BaseSwitch } from "@base-ui-components/react/switch";
import { cn } from "../utils/classname";

export interface IToggleSwitchProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  className?: string;
}

function Switch({ value, onChange, label, size = "sm", disabled, className }: IToggleSwitchProps) {
  return (
    <BaseSwitch.Root
      checked={value}
      disabled={disabled}
      onCheckedChange={onChange}
      aria-label={label}
      className={cn(
        "relative inline-flex flex-shrink-0 cursor-pointer rounded-full border border-subtle transition-colors duration-200 ease-in-out focus:outline-none",
        // size
        size === "sm" ? "h-4 w-6" : size === "md" ? "h-5 w-8" : "h-6 w-10",
        // state
        disabled
          ? "cursor-not-allowed bg-layer-1"
          : value
            ? "cursor-pointer bg-accent-primary"
            : // The off track was bg-surface-2 -- the same token as the container
              // it sits on -- so the control read as a faint outline. layer-3 is
              // dark enough in both themes for the white thumb to register.
              "cursor-pointer bg-layer-3",
        className
      )}
    >
      {label && <span className="sr-only">{label}</span>}
      <BaseSwitch.Thumb
        aria-hidden="true"
        className={cn(
          "shadow inline-block self-center rounded-full ring-0 transition-transform duration-200 ease-in-out",
          // size
          size === "sm" ? "h-3 w-3" : size === "md" ? "h-4 w-4" : "h-5 w-5",
          // position + color by state
          value
            ? size === "sm"
              ? "translate-x-3 bg-white"
              : size === "md"
                ? "translate-x-4 bg-white"
                : "translate-x-5 bg-white"
            : // White in both states, as on every conventional toggle: the track
              // carries the state, the thumb stays constant. It used to be
              // bg-surface-2 here -- identical to the track -- so the off state
              // had no visible thumb at all.
              "translate-x-0.5 bg-white",
          // disabled
          disabled && "cursor-not-allowed bg-layer-2"
        )}
      />
    </BaseSwitch.Root>
  );
}

Switch.displayName = "plane-ui-switch";

export { Switch };
