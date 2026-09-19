"use client";

import { ChevronDown, Check } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface ChoiceOption<Value extends string> {
  value: Value;
  label: string;
  description?: string;
  icon?: ReactNode;
}

export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  value: Value;
  options: readonly ChoiceOption<Value>[];
  onChange: (value: Value) => void;
  compact?: boolean;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function moveFocus(currentIndex: number, direction: -1 | 1) {
    const nextIndex = (currentIndex + direction + options.length) % options.length;
    const option = options[nextIndex];
    if (!option) return;
    onChange(option.value);
    buttons.current[nextIndex]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index, -1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(index, 1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : options.length - 1;
      const option = options[nextIndex];
      if (!option) return;
      onChange(option.value);
      buttons.current[nextIndex]?.focus();
    }
  }

  return <div role="radiogroup" aria-label={label} className={`segmented-control ${compact ? "segmented-control-compact" : ""}`}>
    {options.map((option, index) => {
      const selected = option.value === value;
      return <button
        key={option.value}
        ref={(element) => { buttons.current[index] = element; }}
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={selected ? 0 : -1}
        className="segmented-option"
        onClick={() => onChange(option.value)}
        onKeyDown={(event) => handleKeyDown(event, index)}
      >
        {option.icon && <span className="segmented-icon" aria-hidden="true">{option.icon}</span>}
        <span className="min-w-0">
          <span className="segmented-label">{option.label}</span>
          {option.description && <span className="segmented-description">{option.description}</span>}
        </span>
      </button>;
    })}
  </div>;
}

export function PopoverSelect<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly ChoiceOption<Value>[];
  onChange: (value: Value) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const optionButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => optionButtons.current[selectedIndex]?.focus());
    const handlePointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open, selectedIndex]);

  function closeAndFocus() {
    setOpen(false);
    trigger.current?.focus();
  }

  function moveActive(direction: -1 | 1) {
    const nextIndex = (activeIndex + direction + options.length) % options.length;
    setActiveIndex(nextIndex);
    optionButtons.current[nextIndex]?.focus();
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeAndFocus();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndFocus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : options.length - 1;
      setActiveIndex(nextIndex);
      optionButtons.current[nextIndex]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(index);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return <div ref={root} className="popover-select">
    <button
      ref={trigger}
      type="button"
      className="popover-trigger"
      aria-label={`${label}: ${selected?.label ?? "Chưa chọn"}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={id}
      onClick={() => {
        setActiveIndex(selectedIndex);
        setOpen((current) => !current);
      }}
      onKeyDown={handleTriggerKeyDown}
    >
      <span className="popover-trigger-copy"><span>{label}</span><strong>{selected?.label}</strong></span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && <div id={id} role="listbox" aria-label={label} className="popover-list">
      {options.map((option, index) => <button
        key={option.value}
        ref={(element) => { optionButtons.current[index] = element; }}
        type="button"
        role="option"
        aria-selected={option.value === value}
        tabIndex={index === activeIndex ? 0 : -1}
        className="popover-option"
        onMouseEnter={() => setActiveIndex(index)}
        onClick={() => choose(index)}
        onKeyDown={(event) => handleOptionKeyDown(event, index)}
      >
        {option.icon && <span aria-hidden="true">{option.icon}</span>}
        <span className="min-w-0 flex-1 text-left"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
        {option.value === value && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
