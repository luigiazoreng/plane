/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TEstimateTimeInputProps = {
  value?: number;
  handleEstimateInputValue: (value: string) => void;
};

export function EstimateTimeInput(props: TEstimateTimeInputProps) {
  const { value, handleEstimateInputValue } = props;

  return (
    <input
      type="number"
      min={0}
      step={5}
      value={value ?? ""}
      onChange={(e) => handleEstimateInputValue(e.target.value)}
      className="focus:border-accent-primary w-full rounded-md border border-subtle bg-transparent px-3 py-2 text-13 text-primary transition-colors outline-none"
      inputMode="numeric"
      placeholder="Minutes (e.g. 90)"
      aria-label="Estimate time in minutes"
    />
  );
}
