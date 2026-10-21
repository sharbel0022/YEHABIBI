"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import styles from "./QuantityStepper.module.css";

export function QuantityStepper({
  value,
  onChange,
  label,
  min = 0,
  max = 999,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  function update(next: number) {
    const normalized = Math.max(min, Math.min(max, Number.isFinite(next) ? Math.trunc(next) : min));
    setText(String(normalized));
    onChange(normalized);
  }

  return (
    <div className={styles.stepper} role="group" aria-label={`Antal ${label}`}>
      <button type="button" onClick={() => update(value - 1)} disabled={value <= min} aria-label={`Minska antal för ${label}`}>
        <Minus size={16} aria-hidden="true" />
      </button>
      <input
        aria-label={`Antal ${label}`}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={text}
        onChange={(event) => {
          setText(event.currentTarget.value);
          // Keep a temporarily empty field mounted while the customer types.
          if (event.currentTarget.value !== "") update(event.currentTarget.valueAsNumber);
        }}
        onBlur={() => update(text === "" ? min : Number(text))}
      />
      <button type="button" onClick={() => update(value + 1)} disabled={value >= max} aria-label={`Öka antal för ${label}`}>
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
