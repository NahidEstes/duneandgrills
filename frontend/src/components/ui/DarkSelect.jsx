"use client";

import { Children, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

const textValue = (node) =>
  Children.toArray(node)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : child?.props
          ? textValue(child.props.children)
          : ""
    )
    .join("");

const readOptions = (children) => {
  const options = [];
  Children.toArray(children).forEach((child) => {
    if (!child?.props) return;
    if (child.type === "optgroup") {
      Children.toArray(child.props.children).forEach((option) => {
        if (option?.type === "option") {
          options.push({
            value: String(option.props.value ?? textValue(option.props.children)),
            label: option.props.children,
            searchLabel: textValue(option.props.children),
            disabled: Boolean(option.props.disabled),
            group: child.props.label,
          });
        }
      });
      return;
    }
    if (child.type === "option") {
      options.push({
        value: String(child.props.value ?? textValue(child.props.children)),
        label: child.props.children,
        searchLabel: textValue(child.props.children),
        disabled: Boolean(child.props.disabled),
        group: null,
      });
    }
  });
  return options;
};

const nextEnabled = (options, start, direction) => {
  if (!options.length) return -1;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (start + direction * offset + options.length) % options.length;
    if (!options[index].disabled) return index;
  }
  return -1;
};

export default function DarkSelect({
  children,
  value = "",
  onChange,
  onBlur,
  className = "",
  disabled = false,
  required = false,
  name,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}) {
  const generatedId = useId();
  const selectId = id || `dark-select-${generatedId}`;
  const listId = `${selectId}-listbox`;
  const options = useMemo(() => readOptions(children), [children]);
  const selectedIndex = options.findIndex((option) => option.value === String(value ?? ""));
  const selected = options[selectedIndex];
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const [invalid, setInvalid] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const searchRef = useRef({ value: "", timer: null });

  const positionMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const maxHeight = Math.max(120, Math.min(288, Math.max(spaceBelow, spaceAbove)));
    const width = Math.min(Math.max(rect.width, 220), window.innerWidth - 16);
    setMenuStyle({
      left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
      top: spaceBelow >= Math.min(220, maxHeight) ? rect.bottom + 6 : Math.max(8, rect.top - maxHeight - 6),
      width,
      maxHeight,
    });
  };

  const openMenu = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : nextEnabled(options, -1, 1));
    positionMenu();
    setOpen(true);
  };

  const choose = (index) => {
    const option = options[index];
    if (!option || option.disabled) return;
    setInvalid(false);
    onChange?.({ target: { value: option.value, name }, currentTarget: { value: option.value, name } });
    setOpen(false);
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const reposition = () => positionMenu();
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId, open]);

  useEffect(() => () => clearTimeout(searchRef.current.timer), []);

  const handleKeyDown = (event) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return openMenu();
      setActiveIndex((index) => nextEnabled(options, index, event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!open) openMenu();
      setActiveIndex(event.key === "Home" ? nextEnabled(options, -1, 1) : nextEnabled(options, 0, -1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex);
      else openMenu();
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const query = `${searchRef.current.value}${event.key}`.toLowerCase();
      searchRef.current.value = query;
      clearTimeout(searchRef.current.timer);
      searchRef.current.timer = setTimeout(() => { searchRef.current.value = ""; }, 600);
      const match = options.findIndex((option) => !option.disabled && option.searchLabel.toLowerCase().startsWith(query));
      if (match >= 0) {
        if (!open) openMenu();
        setActiveIndex(match);
      }
    }
  };

  return (
    <span className="relative block min-w-0">
      <button
        ref={buttonRef}
        id={selectId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          if (!menuRef.current?.contains(event.relatedTarget)) onBlur?.(event);
        }}
        className={`relative w-full appearance-none pr-9 text-left disabled:cursor-not-allowed disabled:opacity-50 ${invalid ? "border-red-500/70" : ""} ${className}`}
      >
        <span className={`block truncate ${!selected || selected.disabled ? "text-neutral-500" : ""}`}>{selected?.label ?? "Select an option"}</span>
        <ChevronDown aria-hidden="true" className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500 transition-transform ${open ? "rotate-180 text-dune-amber" : ""}`} />
      </button>
      {required && <input tabIndex={-1} aria-hidden="true" className="sr-only" name={name} value={value} readOnly required disabled={disabled} onInvalid={(event) => { event.preventDefault(); setInvalid(true); buttonRef.current?.focus(); }} />}
      {open && menuStyle && createPortal(
        <div ref={menuRef} id={listId} role="listbox" aria-labelledby={ariaLabelledBy || selectId} style={menuStyle} className="dune-select-scrollbar fixed z-[120] overflow-y-auto rounded-xl border border-white/15 bg-[#111618] p-1.5 text-sm text-neutral-200 shadow-2xl shadow-black/70">
          {options.map((option, index) => {
            const showGroup = option.group && option.group !== options[index - 1]?.group;
            return <div key={`${option.value}-${index}`}>{showGroup && <div className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-wider text-dune-amber/70">{option.group}</div>}<div id={`${listId}-option-${index}`} role="option" aria-selected={index === selectedIndex} aria-disabled={option.disabled || undefined} onMouseEnter={() => !option.disabled && setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)} className={`flex min-h-10 items-center justify-between gap-3 rounded-lg px-3 py-2 ${option.disabled ? "cursor-not-allowed text-neutral-600" : "cursor-pointer"} ${index === activeIndex ? "bg-white/[0.07] text-white" : ""} ${index === selectedIndex ? "bg-dune-amber/10 text-dune-amberLight" : ""}`}><span className="min-w-0 truncate">{option.label}</span>{index === selectedIndex && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}</div></div>;
          })}
        </div>,
        document.body
      )}
    </span>
  );
}
