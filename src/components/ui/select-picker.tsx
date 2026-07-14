"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectPickerOption = { value: string; label: string };

function labelFor(value: string, options: SelectPickerOption[]) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function SelectPicker({
  value,
  options,
  onChange,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  value: string;
  options: SelectPickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const canPortal = typeof document !== "undefined";

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = rootRef.current?.querySelector(".select-picker-trigger")?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = window.innerWidth;
      const estimatedHeight = Math.min(options.length * 38 + 12, 260);
      const estimatedWidth = Math.max(rect.width, 152);
      const fitsBelow = rect.bottom + estimatedHeight + 16 <= window.innerHeight;
      const top = fitsBelow ? rect.bottom + 6 : Math.max(12, rect.top - estimatedHeight - 6);
      const left = Math.min(Math.max(12, rect.left), Math.max(12, viewportWidth - estimatedWidth - 12));
      setMenuStyle({
        position: "fixed",
        top,
        left,
        width: Math.min(Math.max(rect.width, 152), viewportWidth - 24),
        maxHeight: Math.min(estimatedHeight, window.innerHeight - 24),
      });
    };
    updatePosition();
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length]);

  return (
    <div className="select-picker" ref={rootRef}>
      <button
        type="button"
        className="select-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{labelFor(value, options)}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && canPortal && createPortal(
        <div className="select-picker-menu" ref={menuRef} style={menuStyle} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="select-picker-option"
              key={option.value}
              onClick={() => {
                setOpen(false);
                if (option.value !== value) onChange(option.value);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
