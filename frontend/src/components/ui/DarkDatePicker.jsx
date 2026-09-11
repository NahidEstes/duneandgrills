"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  buildCalendarDays,
  formatDateEntry,
  formatDateValue,
  isDateAllowed,
  parseDateEntry,
  parseDateValue,
  sameDay,
  startOfMonth,
} from "./datePickerUtils.js";

const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const displayFormatter = new Intl.DateTimeFormat("en-SA", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const monthFormatter = new Intl.DateTimeFormat("en-SA", {
  month: "long",
  year: "numeric",
});
const accessibleDateFormatter = new Intl.DateTimeFormat("en-SA", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, Number.parseInt(value, 10) || 0));

const timeFrom = (date) => ({
  hour: String(date.getHours()).padStart(2, "0"),
  minute: String(date.getMinutes()).padStart(2, "0"),
});

const monthNames = Array.from({ length: 12 }, (_, month) =>
  new Intl.DateTimeFormat("en-SA", { month: "long" }).format(new Date(2026, month, 1))
);

const CalendarSelector = ({ ariaLabel, label, value, options, open, onToggle, onChange }) => {
  const listRef = useRef(null);
  const triggerRef = useRef(null);

  const restoreTriggerFocus = () => {
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      listRef.current?.querySelector('[aria-selected="true"]')?.focus();
    });
  }, [open]);

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${label}`}
        onClick={onToggle}
        className="flex h-9 w-full items-center justify-between gap-1 rounded-lg border border-white/10 bg-black/20 px-2.5 text-left text-xs font-semibold text-white hover:border-dune-amber/40"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-dune-amber transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={(event) => {
            const choices = [...event.currentTarget.querySelectorAll('[role="option"]')];
            const index = choices.indexOf(document.activeElement);
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const nextIndex = event.key === "Home"
                ? 0
                : event.key === "End"
                  ? choices.length - 1
                  : (index + (event.key === "ArrowDown" ? 1 : -1) + choices.length) % choices.length;
              choices[nextIndex]?.focus();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onToggle();
              restoreTriggerFocus();
            }
          }}
          className="dune-select-scrollbar absolute left-0 top-10 z-10 max-h-56 min-w-full overflow-y-auto rounded-xl border border-white/15 bg-[#111618] p-1.5 shadow-2xl shadow-black/70"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={String(option.value) === String(value)}
              onClick={() => {
                onChange(option.value);
                restoreTriggerFocus();
              }}
              className={`block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs transition ${String(option.value) === String(value) ? "bg-dune-amber text-black" : "text-neutral-300 hover:bg-white/[0.07] hover:text-white"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default function DarkDatePicker({
  type = "date",
  value = "",
  onChange,
  onBlur,
  className = "",
  disabled = false,
  required = false,
  min,
  max,
  name,
  id,
  title,
  placeholder,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}) {
  const generatedId = useId();
  const pickerId = id || `dark-date-picker-${generatedId}`;
  const dialogId = `${pickerId}-dialog`;
  const selectedDate = useMemo(() => parseDateValue(value), [value]);
  const today = useMemo(() => {
    const current = new Date();
    return new Date(current.getFullYear(), current.getMonth(), current.getDate(), current.getHours(), current.getMinutes());
  }, []);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate || today));
  const [activeDate, setActiveDate] = useState(selectedDate || today);
  const [time, setTime] = useState(() => timeFrom(selectedDate || today));
  const [draftEntry, setDraftEntry] = useState(() => formatDateEntry(selectedDate, type));
  const [entryError, setEntryError] = useState(false);
  const [openSelector, setOpenSelector] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const days = useMemo(() => buildCalendarDays(viewMonth), [viewMonth]);
  const isDateTime = type === "datetime-local";
  const yearOptions = useMemo(() => {
    const minimumYear = parseDateValue(min)?.getFullYear() ?? today.getFullYear() - 10;
    const maximumYear = parseDateValue(max)?.getFullYear() ?? today.getFullYear() + 20;
    const start = Math.min(minimumYear, viewMonth.getFullYear());
    const end = Math.max(maximumYear, viewMonth.getFullYear());
    return Array.from({ length: end - start + 1 }, (_, index) => ({
      value: start + index,
      label: String(start + index),
    }));
  }, [max, min, today, viewMonth]);

  const emitValue = (date) => {
    const nextValue = date ? formatDateValue(date, type) : "";
    setInvalid(false);
    setEntryError(false);
    setDraftEntry(date ? formatDateEntry(date, type) : "");
    onChange?.({
      target: { value: nextValue, name },
      currentTarget: { value: nextValue, name },
    });
  };

  const positionPanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(isDateTime ? 370 : 340, window.innerWidth - 16);
    const estimatedHeight = isDateTime ? 490 : 420;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const opensBelow = spaceBelow >= Math.min(estimatedHeight, 320) || rect.top < spaceBelow;
    setPanelStyle({
      left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      top: opensBelow ? rect.bottom + 6 : Math.max(8, rect.top - estimatedHeight - 6),
      width,
      maxHeight: Math.max(260, window.innerHeight - 16),
    });
  }, [isDateTime]);

  const openPicker = () => {
    if (disabled) return;
    const focusDate = selectedDate || today;
    setViewMonth(startOfMonth(focusDate));
    setActiveDate(focusDate);
    setTime(timeFrom(selectedDate || today));
    setDraftEntry(formatDateEntry(selectedDate, type));
    setEntryError(false);
    setOpenSelector(null);
    positionPanel();
    setOpen(true);
  };

  const closePicker = ({ restoreFocus = false } = {}) => {
    setOpen(false);
    setOpenSelector(null);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const withTime = (date, nextTime = time) => {
    const result = new Date(date);
    result.setHours(Number(nextTime.hour), Number(nextTime.minute), 0, 0);
    return result;
  };

  const selectDate = (date) => {
    const candidate = isDateTime ? withTime(date) : date;
    if (!isDateAllowed(candidate, type, min, max)) return;
    setActiveDate(candidate);
    setViewMonth(startOfMonth(candidate));
    emitValue(candidate);
    if (!isDateTime) closePicker({ restoreFocus: true });
  };

  const selectToday = () => selectDate(today);

  const setCalendarMonth = (month) => {
    const nextMonth = new Date(viewMonth.getFullYear(), Number(month), 1);
    setViewMonth(nextMonth);
    setActiveDate(new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      1,
      activeDate.getHours(),
      activeDate.getMinutes()
    ));
    setOpenSelector(null);
  };

  const setCalendarYear = (year) => {
    const nextMonth = new Date(Number(year), viewMonth.getMonth(), 1);
    setViewMonth(nextMonth);
    setActiveDate(new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      1,
      activeDate.getHours(),
      activeDate.getMinutes()
    ));
    setOpenSelector(null);
  };

  const applyTypedDate = () => {
    const parsed = parseDateEntry(draftEntry);
    if (!parsed || !isDateAllowed(parsed, type, min, max)) {
      setEntryError(true);
      return;
    }
    setEntryError(false);
    setTime(timeFrom(parsed));
    setActiveDate(parsed);
    setViewMonth(startOfMonth(parsed));
    emitValue(parsed);
    if (!isDateTime) closePicker({ restoreFocus: true });
  };

  const changeViewedMonth = (amount) => {
    const nextMonth = addMonths(viewMonth, amount);
    const nextActiveDate = new Date(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      1,
      activeDate.getHours(),
      activeDate.getMinutes()
    );
    setViewMonth(nextMonth);
    setActiveDate(nextActiveDate);
  };

  const updateTime = (field, rawValue) => {
    const nextTime = {
      ...time,
      [field]: String(clamp(rawValue, 0, field === "hour" ? 23 : 59)).padStart(2, "0"),
    };
    setTime(nextTime);
    if (selectedDate) {
      const candidate = withTime(selectedDate, nextTime);
      if (isDateAllowed(candidate, type, min, max)) emitValue(candidate);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) {
        closePicker();
        onBlur?.({ target: { value, name }, currentTarget: { value, name } });
      }
    };
    const reposition = () => positionPanel();
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, name, onBlur, positionPanel, value]);

  useEffect(() => {
    if (!open) return;
    const activeId = `${dialogId}-${formatDateValue(activeDate)}`;
    requestAnimationFrame(() => document.getElementById(activeId)?.focus());
  }, [activeDate, dialogId, open, viewMonth]);

  const moveActiveDate = (amount) => {
    let candidate = addDays(activeDate, amount);
    const direction = amount < 0 ? -1 : 1;
    while (!isDateAllowed(isDateTime ? withTime(candidate) : candidate, type, min, max)) {
      candidate = addDays(candidate, direction);
      if (Math.abs(candidate.getFullYear() - activeDate.getFullYear()) > 20) return;
    }
    setActiveDate(candidate);
    setViewMonth(startOfMonth(candidate));
  };

  const handleDayKeyDown = (event) => {
    const moves = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -activeDate.getDay(),
      End: 6 - activeDate.getDay(),
    };
    if (event.key in moves) {
      event.preventDefault();
      moveActiveDate(moves[event.key]);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const month = addMonths(activeDate, event.key === "PageUp" ? -1 : 1);
      const day = Math.min(activeDate.getDate(), new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate());
      setActiveDate(new Date(month.getFullYear(), month.getMonth(), day, activeDate.getHours(), activeDate.getMinutes()));
      setViewMonth(month);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePicker({ restoreFocus: true });
    }
  };

  const displayValue = selectedDate
    ? `${displayFormatter.format(selectedDate)}${isDateTime ? ` · ${timeFrom(selectedDate).hour}:${timeFrom(selectedDate).minute}` : ""}`
    : placeholder || (isDateTime ? "Select date and time" : "dd-mm-yyyy");

  return (
    <span className="relative block min-w-0">
      <button
        ref={triggerRef}
        id={pickerId}
        type="button"
        title={title}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        disabled={disabled}
        onClick={() => (open ? closePicker() : openPicker())}
        onKeyDown={(event) => {
          if (["ArrowDown", "Enter", " "].includes(event.key) && !open) {
            event.preventDefault();
            openPicker();
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            closePicker();
          }
        }}
        className={`relative w-full pr-10 text-left disabled:cursor-not-allowed disabled:opacity-50 ${invalid ? "border-red-500/70" : ""} ${className}`}
      >
        <span className={`block truncate tabular-nums ${selectedDate ? "text-white" : "text-neutral-600"}`}>
          {displayValue}
        </span>
        <CalendarDays
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dune-amber"
        />
      </button>
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          name={name}
          value={value}
          readOnly
          required
          disabled={disabled}
          onInvalid={(event) => {
            event.preventDefault();
            setInvalid(true);
            triggerRef.current?.focus();
          }}
        />
      )}

      {open && panelStyle && createPortal(
        <div
          ref={panelRef}
          id={dialogId}
          role="dialog"
          aria-modal="false"
          aria-label={isDateTime ? "Choose date and time" : "Choose date"}
          style={panelStyle}
          className="dune-select-scrollbar fixed z-[130] overflow-y-auto rounded-2xl border border-white/15 bg-[#111618] p-3 text-sm text-neutral-200 shadow-2xl shadow-black/75"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget) && !triggerRef.current?.contains(event.relatedTarget)) {
              closePicker();
              onBlur?.({ target: { value, name }, currentTarget: { value, name } });
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
              event.preventDefault();
              closePicker({ restoreFocus: true });
            }
          }}
        >
          <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <label className="sr-only" htmlFor={`${pickerId}-direct-entry`}>
              {isDateTime ? "Enter date and time" : "Enter date"}
            </label>
            <input
              id={`${pickerId}-direct-entry`}
              type="text"
              inputMode="numeric"
              value={draftEntry}
              placeholder={isDateTime ? "DD-MM-YYYY HH:mm" : "DD-MM-YYYY"}
              aria-invalid={entryError}
              onChange={(event) => {
                setDraftEntry(event.target.value);
                setEntryError(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  applyTypedDate();
                }
              }}
              className={`h-10 min-w-0 rounded-xl border bg-black/30 px-3 text-sm tabular-nums text-white outline-none placeholder:text-neutral-600 focus:border-dune-amber/70 ${entryError ? "border-red-500/70" : "border-white/10"}`}
            />
            <button
              type="button"
              onClick={applyTypedDate}
              className="h-10 rounded-xl bg-dune-amber px-3 text-xs font-bold text-black hover:bg-dune-amberLight"
            >
              Go
            </button>
          </div>
          {entryError && (
            <p className="-mt-1 mb-3 px-1 text-xs text-red-400">
              Use {isDateTime ? "DD-MM-YYYY HH:mm" : "DD-MM-YYYY"} within the allowed range.
            </p>
          )}

          <div className="flex items-center justify-between gap-2 px-1 pb-3">
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_88px] gap-1.5">
              <CalendarSelector
                ariaLabel="Choose month"
                label={monthNames[viewMonth.getMonth()]}
                value={viewMonth.getMonth()}
                options={monthNames.map((month, index) => ({ label: month, value: index }))}
                open={openSelector === "month"}
                onToggle={() => setOpenSelector((current) => current === "month" ? null : "month")}
                onChange={setCalendarMonth}
              />
              <CalendarSelector
                ariaLabel="Choose year"
                label={String(viewMonth.getFullYear())}
                value={viewMonth.getFullYear()}
                options={yearOptions}
                open={openSelector === "year"}
                onToggle={() => setOpenSelector((current) => current === "year" ? null : "year")}
                onChange={setCalendarYear}
              />
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => changeViewedMonth(-1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-dune-amber hover:bg-white/[0.07]"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => changeViewedMonth(1)}
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-dune-amber hover:bg-white/[0.07]"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div role="grid" aria-label={monthFormatter.format(viewMonth)}>
            <div role="row" className="grid grid-cols-7 border-b border-white/[0.07] pb-1">
              {weekdays.map((day) => (
                <span key={day} role="columnheader" className="py-2 text-center text-xs font-medium text-neutral-500">
                  {day}
                </span>
              ))}
            </div>
            <div className="mt-1 space-y-0.5">
              {Array.from({ length: 6 }, (_, rowIndex) => (
                <div key={rowIndex} role="row" className="grid grid-cols-7 gap-0.5">
                  {days.slice(rowIndex * 7, rowIndex * 7 + 7).map((date) => {
                    const candidate = isDateTime ? withTime(date) : date;
                    const allowed = isDateAllowed(candidate, type, min, max);
                    const selected = sameDay(date, selectedDate);
                    const active = sameDay(date, activeDate);
                    const currentMonth = date.getMonth() === viewMonth.getMonth();
                    return (
                      <button
                        key={formatDateValue(date)}
                        id={`${dialogId}-${formatDateValue(date)}`}
                        type="button"
                        role="gridcell"
                        tabIndex={active ? 0 : -1}
                        aria-label={accessibleDateFormatter.format(date)}
                        aria-selected={selected}
                        aria-current={sameDay(date, today) ? "date" : undefined}
                        disabled={!allowed}
                        onClick={() => selectDate(date)}
                        onKeyDown={handleDayKeyDown}
                        className={`grid h-10 place-items-center rounded-xl text-sm tabular-nums transition disabled:cursor-not-allowed disabled:opacity-25 ${currentMonth ? "text-neutral-200" : "text-neutral-600"} ${sameDay(date, today) && !selected ? "ring-1 ring-inset ring-dune-amber/50 text-dune-amberLight" : ""} ${selected ? "bg-dune-amber font-bold text-black shadow-lg shadow-orange-950/40" : "hover:bg-white/[0.07] hover:text-white"}`}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {isDateTime && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] px-1 pt-3">
              <span className="text-xs font-medium text-neutral-400">Time</span>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`${pickerId}-hour`}>Hour</label>
                <input
                  id={`${pickerId}-hour`}
                  type="number"
                  min="0"
                  max="23"
                  value={time.hour}
                  onChange={(event) => updateTime("hour", event.target.value)}
                  className="h-9 w-16 rounded-lg border border-white/10 bg-black/30 px-2 text-center text-white outline-none focus:border-dune-amber/60"
                />
                <span className="text-dune-amber">:</span>
                <label className="sr-only" htmlFor={`${pickerId}-minute`}>Minute</label>
                <input
                  id={`${pickerId}-minute`}
                  type="number"
                  min="0"
                  max="59"
                  value={time.minute}
                  onChange={(event) => updateTime("minute", event.target.value)}
                  className="h-9 w-16 rounded-lg border border-white/10 bg-black/30 px-2 text-center text-white outline-none focus:border-dune-amber/60"
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-white/[0.07] px-1 pt-3">
            <button
              type="button"
              onClick={() => {
                emitValue(null);
                closePicker({ restoreFocus: true });
              }}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-dune-amber hover:bg-dune-amber/10"
            >
              Clear
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectToday}
                disabled={!isDateAllowed(isDateTime ? withTime(today) : today, type, min, max)}
                className="rounded-lg px-2 py-1.5 text-xs font-semibold text-dune-amber hover:bg-dune-amber/10 disabled:opacity-40"
              >
                Today
              </button>
              {isDateTime && (
                <button
                  type="button"
                  onClick={() => closePicker({ restoreFocus: true })}
                  className="rounded-lg bg-dune-amber px-3 py-1.5 text-xs font-semibold text-black hover:bg-dune-amberLight"
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}
