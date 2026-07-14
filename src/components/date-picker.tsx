"use client";

import { useId, useRef } from "react";
import { CalendarDays } from "lucide-react";

function formatDateLabel(value: string) {
  if (!value) return "Select a date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
  ariaLabel?: string;
};

export function DatePicker({ value, onChange, required, min, max, disabled, ariaLabel }: DatePickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    const input = inputRef.current;
    if (!input || disabled) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  return (
    <div className="date-picker">
      <button
        type="button"
        className={`date-picker-trigger ${disabled ? "is-disabled" : ""}`}
        onClick={openPicker}
        disabled={disabled}
        aria-label={ariaLabel ?? "Choose a date"}
      >
        <span>{formatDateLabel(value)}</span>
        <CalendarDays size={16} />
      </button>
      <input
        id={inputId}
        ref={inputRef}
        className="date-picker-input"
        type="date"
        value={value}
        required={required}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
