"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, BatteryCharging, BellRing, CalendarDays, Check, ListChecks, X } from "lucide-react";

const STORAGE_PREFIX = "hom-nay-the-nao:onboarding:v1:";
const completedInMemory = new Set<string>();
const SPOTLIGHT_PADDING = 8;
const VIEWPORT_MARGIN = 12;
const POPOVER_GAP = 14;

type Placement = "right" | "left" | "below" | "above" | "center";

interface OnboardingTourProps {
  open: boolean;
  profileId: string;
  onClose: () => void;
}

interface TargetBox {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: number;
}

interface PopoverPosition {
  top: number;
  left: number;
  placement: Placement;
  caretOffset: number;
}

type PopoverStyle = CSSProperties & { "--tour-caret-offset"?: string };

const steps = [
  {
    title: "Check-in năng lượng",
    description: "Chọn mức pin hiện tại để lịch hôm nay phản ánh đúng sức của bạn.",
    icon: BatteryCharging,
    selectors: ['[data-tour="energy-checkin"]'],
  },
  {
    title: "Điều khiển lịch",
    description: "Chuyển giữa Ngày, Tuần, Tháng hoặc đi nhanh tới khoảng thời gian bạn cần.",
    icon: CalendarDays,
    selectors: ['[data-tour="calendar-controls"]'],
  },
  {
    title: "Việc cần làm",
    description: "Mở Todo từ thanh bên; trên điện thoại, bắt đầu từ nút menu này.",
    icon: ListChecks,
    selectors: ['[data-tour="todo-nav"]', '[data-tour="mobile-menu"]'],
  },
  {
    title: "Nhắc việc đúng lúc",
    description: "Bật chuông để nhận lời nhắc trước hoạt động và Todo sắp tới.",
    icon: BellRing,
    selectors: ['[data-tour="reminder"]', '[data-tour="header-actions"]'],
  },
] as const;

export function onboardingStorageKey(profileId: string): string {
  return `${STORAGE_PREFIX}${profileId}`;
}

export function isOnboardingComplete(profileId: string): boolean {
  const key = onboardingStorageKey(profileId);
  if (completedInMemory.has(key)) return true;

  let completed = false;
  try { completed = localStorage.getItem(key) === "complete"; } catch { /* Dùng guard khác khi trình duyệt chặn localStorage. */ }
  if (!completed) {
    try { completed = sessionStorage.getItem(key) === "complete"; } catch { /* Bộ nhớ module vẫn chặn mở lặp trong phiên. */ }
  }
  if (completed) completedInMemory.add(key);
  return completed;
}

export function markOnboardingComplete(profileId: string): void {
  const key = onboardingStorageKey(profileId);
  completedInMemory.add(key);
  try { localStorage.setItem(key, "complete"); } catch {
    try { sessionStorage.setItem(key, "complete"); } catch { /* Bộ nhớ module là fallback cuối. */ }
  }
}

function isRendered(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
}

function intersectsViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

function isFullyInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.top >= VIEWPORT_MARGIN && rect.left >= VIEWPORT_MARGIN && rect.bottom <= window.innerHeight - VIEWPORT_MARGIN && rect.right <= window.innerWidth - VIEWPORT_MARGIN;
}

function findTarget(selectors: readonly string[]): HTMLElement | null {
  const candidates = selectors
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .filter((element): element is HTMLElement => Boolean(element && isRendered(element)));
  return candidates.find(intersectsViewport) ?? candidates[0] ?? null;
}

function centeredPosition(popover: HTMLElement | null): PopoverPosition {
  const width = popover?.offsetWidth ?? Math.min(360, window.innerWidth - VIEWPORT_MARGIN * 2);
  const height = popover?.offsetHeight ?? 250;
  return {
    top: Math.max(VIEWPORT_MARGIN, (window.innerHeight - height) / 2),
    left: Math.max(VIEWPORT_MARGIN, (window.innerWidth - width) / 2),
    placement: "center",
    caretOffset: 0,
  };
}

function placePopover(box: TargetBox, popover: HTMLElement | null): PopoverPosition {
  const maxWidth = Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2);
  const width = Math.min(popover?.offsetWidth ?? 360, maxWidth);
  const height = Math.min(popover?.offsetHeight ?? 250, Math.max(0, window.innerHeight - VIEWPORT_MARGIN * 2));
  const available = {
    right: window.innerWidth - (box.left + box.width),
    left: box.left,
    below: window.innerHeight - (box.top + box.height),
    above: box.top,
  };
  const neededHorizontal = width + POPOVER_GAP;
  const neededVertical = height + POPOVER_GAP;
  let placement: Exclude<Placement, "center">;

  if (available.right >= neededHorizontal) placement = "right";
  else if (available.left >= neededHorizontal) placement = "left";
  else if (available.below >= neededVertical) placement = "below";
  else if (available.above >= neededVertical) placement = "above";
  else placement = (Object.entries(available).sort((first, second) => second[1] - first[1])[0]?.[0] ?? "below") as Exclude<Placement, "center">;

  let top = box.top + box.height / 2 - height / 2;
  let left = box.left + box.width + POPOVER_GAP;
  if (placement === "left") left = box.left - width - POPOVER_GAP;
  if (placement === "below" || placement === "above") {
    left = box.left + box.width / 2 - width / 2;
    top = placement === "below" ? box.top + box.height + POPOVER_GAP : box.top - height - POPOVER_GAP;
  }

  left = Math.min(Math.max(VIEWPORT_MARGIN, left), Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN));
  top = Math.min(Math.max(VIEWPORT_MARGIN, top), Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN));
  const caretOffset = placement === "left" || placement === "right"
    ? Math.min(Math.max(22, box.top + box.height / 2 - top), Math.max(22, height - 22))
    : Math.min(Math.max(22, box.left + box.width / 2 - left), Math.max(22, width - 22));

  return { top, left, placement, caretOffset };
}

function isTextEntry(element: Element | null): boolean {
  return Boolean(element?.matches("input, textarea, select, [contenteditable='true']"));
}

export function OnboardingTour({ open, profileId, onClose }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetBox, setTargetBox] = useState<TargetBox | null>(null);
  const [targetResolved, setTargetResolved] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({ top: VIEWPORT_MARGIN, left: VIEWPORT_MARGIN, placement: "center", caretOffset: 0 });
  const popoverRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const step = steps[stepIndex];
  const StepIcon = step.icon;
  const isLastStep = stepIndex === steps.length - 1;

  const completeAndClose = useCallback(() => {
    markOnboardingComplete(profileId);
    setStepIndex(0);
    setTargetBox(null);
    setTargetResolved(false);
    onClose();
  }, [onClose, profileId]);

  const goNext = useCallback(() => {
    if (isLastStep) completeAndClose();
    else {
      setTargetBox(null);
      setTargetResolved(false);
      setStepIndex((current) => Math.min(steps.length - 1, current + 1));
    }
  }, [completeAndClose, isLastStep]);

  const goPrevious = useCallback(() => {
    if (stepIndex === 0) return;
    setTargetBox(null);
    setTargetResolved(false);
    setStepIndex((current) => Math.max(0, current - 1));
  }, [stepIndex]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let retryCount = 0;
    let scrollAttempted = false;
    let timer: number | undefined;
    let frame: number | undefined;
    let observedTarget: HTMLElement | null = null;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => scheduleMeasure(true));

    function updateGeometry(target: HTMLElement) {
      const rect = target.getBoundingClientRect();
      const top = Math.max(0, rect.top - SPOTLIGHT_PADDING);
      const left = Math.max(0, rect.left - SPOTLIGHT_PADDING);
      const right = Math.min(window.innerWidth, rect.right + SPOTLIGHT_PADDING);
      const bottom = Math.min(window.innerHeight, rect.bottom + SPOTLIGHT_PADDING);
      const radius = Number.parseFloat(window.getComputedStyle(target).borderTopLeftRadius) || 12;
      const nextBox = { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top), borderRadius: Math.min(32, radius + SPOTLIGHT_PADDING) };
      setTargetBox(nextBox);
      setPopoverPosition(placePopover(nextBox, popoverRef.current));
      setTargetResolved(true);
      if (observer && observedTarget !== target) {
        observer.disconnect();
        observer.observe(target);
        if (popoverRef.current) observer.observe(popoverRef.current);
        observedTarget = target;
      }
    }

    function measure(allowScroll: boolean) {
      if (!active) return;
      const target = findTarget(step.selectors);
      if (!target) {
        if (retryCount < 2) {
          retryCount += 1;
          timer = window.setTimeout(() => measure(true), retryCount === 1 ? 100 : 240);
          return;
        }
        setTargetBox(null);
        setPopoverPosition(centeredPosition(popoverRef.current));
        setTargetResolved(true);
        return;
      }
      retryCount = 0;
      const onScreen = intersectsViewport(target);
      if (allowScroll && !scrollAttempted && !isFullyInViewport(target)) {
        scrollAttempted = true;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ block: "center", inline: "center", behavior: reducedMotion ? "auto" : "smooth" });
        timer = window.setTimeout(() => measure(false), reducedMotion ? 0 : 350);
        return;
      }
      if (scrollAttempted && !onScreen) {
        if (allowScroll) return;
        setTargetBox(null);
        setPopoverPosition(centeredPosition(popoverRef.current));
        setTargetResolved(true);
        return;
      }
      if (isFullyInViewport(target)) scrollAttempted = false;
      updateGeometry(target);
    }

    function scheduleMeasure(allowScroll: boolean) {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => measure(allowScroll));
    }

    const handleViewportChange = () => scheduleMeasure(true);
    scheduleMeasure(true);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, step.selectors]);

  useEffect(() => {
    if (!open || !targetResolved) return;
    const timer = window.setTimeout(() => nextButtonRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, stepIndex, targetResolved]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        completeAndClose();
        return;
      }
      if (!isTextEntry(document.activeElement) && event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
        return;
      }
      if (!isTextEntry(document.activeElement) && event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
        return;
      }
      if (event.key !== "Tab" || !popoverRef.current) return;
      const focusable = Array.from(popoverRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (!popoverRef.current.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [completeAndClose, goNext, goPrevious, open]);

  if (!open) return null;

  const popoverStyle: PopoverStyle = {
    top: popoverPosition.top,
    left: popoverPosition.left,
    "--tour-caret-offset": `${popoverPosition.caretOffset}px`,
  };

  return <div
    className="tour-root"
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    aria-describedby={descriptionId}
    data-fallback={targetResolved && !targetBox ? "true" : undefined}
    data-pending={!targetResolved ? "true" : undefined}
  >
    {targetBox && <div className="tour-spotlight" aria-hidden="true" style={{ top: targetBox.top, left: targetBox.left, width: targetBox.width, height: targetBox.height, borderRadius: targetBox.borderRadius }} />}
    <div
      ref={popoverRef}
      className={`tour-popover tour-popover-${popoverPosition.placement} ${targetResolved ? "" : "tour-popover-pending"}`}
      style={popoverStyle}
    >
      <div className="tour-heading">
        <span className="tour-icon" aria-hidden="true"><StepIcon size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="tour-kicker">Khám phá nhanh</p>
          <h2 id={titleId} className="tour-title">{step.title}</h2>
        </div>
        <button type="button" className="tour-close" onClick={completeAndClose} aria-label="Đóng hướng dẫn"><X size={18} /></button>
      </div>
      <p id={descriptionId} className="tour-description" aria-live="polite">{step.description}</p>
      <div className="tour-progress" aria-label={`Tiến trình hướng dẫn: bước ${stepIndex + 1} trên ${steps.length}`}>
        <strong>{stepIndex + 1}/{steps.length}</strong>
        <div className="tour-dots" aria-hidden="true">
          {steps.map((item, index) => <span key={item.title} className={index === stepIndex ? "tour-dot tour-dot-active" : "tour-dot"} />)}
        </div>
      </div>
      <div className="tour-actions">
        <button type="button" className="tour-previous" disabled={stepIndex === 0} onClick={goPrevious}><ArrowLeft size={16} />Trước</button>
        <button type="button" className="tour-skip" onClick={completeAndClose}>Bỏ qua</button>
        <button ref={nextButtonRef} type="button" className="tour-next" onClick={goNext}>
          {isLastStep ? <><Check size={16} />Hoàn tất</> : <>Tiếp theo<ArrowRight size={16} /></>}
        </button>
      </div>
    </div>
  </div>;
}
