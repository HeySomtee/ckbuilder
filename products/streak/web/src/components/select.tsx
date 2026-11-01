import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KeyboardEvent } from 'react';
import { Icon } from './icon';
import '../../../public/select-controls.css';

export type SelectOption = { value: string; label: string; disabled?: boolean };
type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};
type Position = { left: number; top: number; width: number; maxHeight: number };

/** A select-only combobox. No native picker or wallet-webview bridge is invoked. */
export function Select({
  value,
  onChange,
  options,
  id,
  name,
  disabled = false,
  required = false,
  placeholder = 'Choose an option',
  className = '',
  ...aria
}: SelectProps) {
  const generatedId = useId();
  const triggerId = id ?? `select-${generatedId}`;
  const menuId = `${triggerId}-options`;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ value: '', at: 0 });
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState(value);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const selected = options.find((option) => option.value === value);
  const selectable = options.flatMap((option, index) => (option.disabled ? [] : [index]));
  const requestedIndex = options.findIndex(
    (option) => option.value === activeValue && !option.disabled,
  );
  const activeIndex = requestedIndex >= 0 ? requestedIndex : (selectable[0] ?? -1);
  const expanded = open && !disabled;
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    search.current = { value: '', at: 0 };
    if (restoreFocus && trigger.current?.isConnected)
      trigger.current.focus({ preventScroll: true });
  }, []);

  const measure = useCallback((): Position | null => {
    const button = trigger.current;
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const gap = 8;
    if (rect.bottom < top || rect.top > top + height || !button.getClientRects().length)
      return null;
    const menuWidth = Math.min(Math.max(rect.width, 220), width - gap * 2);
    const below = Math.max(0, top + height - rect.bottom - gap * 2);
    const above = Math.max(0, rect.top - top - gap * 2);
    const needed = Math.min(320, Math.max(1, options.length) * 44 + 12);
    const placeAbove = below < needed && above > below;
    const overlapTrigger = Math.max(above, below) < Math.min(needed, 100);
    const maxHeight = Math.min(
      needed,
      overlapTrigger ? height - gap * 2 : placeAbove ? above : below,
    );
    return {
      left: Math.max(left + gap, Math.min(rect.left, left + width - menuWidth - gap)),
      top: overlapTrigger ? top + gap : placeAbove ? rect.top - maxHeight - gap : rect.bottom + gap,
      width: menuWidth,
      maxHeight,
    };
  }, [options.length]);

  const show = (edge?: 'first' | 'last') => {
    if (disabled || !trigger.current) return;
    const nextPosition = measure();
    if (!nextPosition) return;
    // Safari does not focus a button on pointer activation.
    trigger.current.focus({ preventScroll: true });
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    const index =
      edge === 'last'
        ? selectable.at(-1)
        : edge === 'first'
          ? selectable[0]
          : selectedIndex >= 0
            ? selectedIndex
            : selectable[0];
    setActiveValue(index === undefined ? '' : options[index].value);
    setPosition(nextPosition);
    setHost(trigger.current.closest<HTMLDialogElement>('dialog[open]') ?? document.body);
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled || disabled) return;
    close(true);
    if (option.value !== value) onChange(option.value);
  };
  const move = (direction: number) => {
    if (!selectable.length) return;
    const current = selectable.indexOf(activeIndex);
    const next = Math.max(0, Math.min(selectable.length - 1, current + direction));
    setActiveValue(options[selectable[next]].value);
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'Tab') {
      if (expanded) close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (expanded) move(event.key === 'ArrowDown' ? 1 : -1);
      else show();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      if (!expanded) show(event.key === 'Home' ? 'first' : 'last');
      else {
        const next = event.key === 'Home' ? selectable[0] : selectable.at(-1);
        if (next !== undefined) setActiveValue(options[next].value);
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (expanded) choose(activeIndex);
      else show();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const typed = now - search.current.at < 700 ? search.current.value + event.key : event.key;
      search.current = { value: typed.toLocaleLowerCase(), at: now };
      const repeated = [...typed.toLocaleLowerCase()].every(
        (letter) => letter === typed[0].toLocaleLowerCase(),
      );
      const query = repeated ? typed[0].toLocaleLowerCase() : typed.toLocaleLowerCase();
      const start = repeated ? activeIndex + 1 : Math.max(activeIndex, 0);
      const ordered = [...options.keys()].slice(start).concat([...options.keys()].slice(0, start));
      const found = ordered.find(
        (index) =>
          !options[index].disabled && options[index].label.toLocaleLowerCase().startsWith(query),
      );
      if (!expanded) show();
      if (found !== undefined) setActiveValue(options[found].value);
    }
  };

  useEffect(() => {
    if (!expanded) return;
    const reposition = (event?: Event) => {
      if (event?.target instanceof Node && menu.current?.contains(event.target)) return;
      const next = measure();
      if (!next) close();
      else setPosition(next);
    };
    const outside = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !trigger.current?.contains(target) &&
        !menu.current?.contains(target)
      )
        close();
    };
    const dialog = trigger.current?.closest('dialog');
    const dialogClosed = () => close();
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => reposition());
    if (trigger.current) observer?.observe(trigger.current);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    document.addEventListener('scroll', reposition, { capture: true, passive: true });
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    dialog?.addEventListener('close', dialogClosed);
    return () => {
      observer?.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      document.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      dialog?.removeEventListener('close', dialogClosed);
    };
  }, [expanded, close, measure]);
  useEffect(() => {
    if (!disabled) return;
    const frame = requestAnimationFrame(() => close());
    return () => cancelAnimationFrame(frame);
  }, [disabled, close]);
  useLayoutEffect(() => {
    const list = menu.current;
    const option = list?.querySelector('[data-active="true"]');
    if (!expanded || !list || !option) return;
    const listRect = list.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    const top = optionRect.top - listRect.top - list.clientTop;
    const bottom = optionRect.bottom - listRect.top - list.clientTop;
    if (top < 0) list.scrollTop += top;
    else if (bottom > list.clientHeight) list.scrollTop += bottom - list.clientHeight;
  }, [expanded, activeIndex]);

  return (
    <span className={`streak-select ${className}`.trim()}>
      {name && (
        <input type="hidden" name={name} value={selected?.value ?? ''} disabled={disabled} />
      )}
      <button
        {...aria}
        id={triggerId}
        ref={trigger}
        type="button"
        role="combobox"
        className="streak-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? menuId : undefined}
        aria-activedescendant={
          expanded && activeIndex >= 0 ? `${menuId}-${activeIndex}` : undefined
        }
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (expanded ? close(true) : show())}
        onKeyDown={keyDown}
        onKeyUp={(event) => {
          // Selection is handled on keydown; suppress a second native button click.
          if (event.key === ' ' || event.key === 'Enter') event.preventDefault();
        }}
      >
        <span className="streak-select-value">{selected?.label ?? placeholder}</span>
        <span className="streak-select-chevron">
          <Icon name="chevron-down" />
        </span>
      </button>
      {expanded &&
        host &&
        position &&
        createPortal(
          <div
            id={menuId}
            ref={menu}
            role="listbox"
            className="streak-select-menu"
            aria-labelledby={triggerId}
            style={position}
          >
            {options.length ? (
              options.map((option, index) => (
                <div
                  id={`${menuId}-${index}`}
                  key={option.value}
                  role="option"
                  className="streak-select-option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  data-active={index === activeIndex}
                  onPointerDown={(event) => {
                    if (event.pointerType === 'mouse') event.preventDefault();
                  }}
                  onMouseDown={(event) => {
                    // Touch produces a compatibility mousedown after scrolling ends.
                    // Keep focus on the combobox without cancelling native touch panning.
                    event.preventDefault();
                  }}
                  onPointerMove={(event) => {
                    if (event.pointerType === 'mouse' && !option.disabled)
                      setActiveValue(option.value);
                  }}
                  onClick={() => choose(index)}
                >
                  <span className="streak-select-option-label">{option.label}</span>
                  <svg
                    className="streak-select-check"
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m4 10 4 4 8-8" />
                  </svg>
                </div>
              ))
            ) : (
              <div className="streak-select-empty">No options available</div>
            )}
          </div>,
          host,
        )}
    </span>
  );
}
