import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon } from '../../components/icon';
import { dayKey, dayLabel, monthDays, moveDay, parseDay } from './calendar';
import { weekend } from './weekend';
import './day-navigation.css';

export function useCalendarToday() {
  const [today, setToday] = useState(() => dayKey(new Date()));
  useEffect(() => {
    const tick = () => setToday(dayKey(new Date()));
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return parseDay(today)!;
}

function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d={back ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'} />
    </svg>
  );
}

export function DayNavigation({
  value,
  today,
  live,
  onChange,
  onLive,
}: {
  value: string;
  today: Date;
  live: boolean;
  onChange: (value: string) => void;
  onLive: () => void;
}) {
  const selected = value === 'weekend' ? weekend(0, today).start : (parseDay(value) ?? today);
  const selectedKey = dayKey(selected);
  const [month, setMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const [focused, setFocused] = useState(() => dayKey(selected));
  const dialog = useRef<HTMLDialogElement>(null);
  const calendarButton = useRef<HTMLButtonElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const focusCalendar = useRef(false);
  const days = Array.from({ length: 15 }, (_, i) => moveDay(selected, i - 7));
  const dates = monthDays(month);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const center = () => {
      const button = element.querySelector<HTMLButtonElement>(`[data-date="${selectedKey}"]`);
      if (button && element.clientWidth)
        element.scrollTo({
          left:
            button.offsetLeft - element.offsetLeft - (element.clientWidth - button.offsetWidth) / 2,
          behavior: 'instant',
        });
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(element);
    return () => observer.disconnect();
  }, [selectedKey]);
  useEffect(() => {
    if (focusCalendar.current && dialog.current?.open) {
      dialog.current.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
      focusCalendar.current = false;
    }
  }, [focused, month]);
  const openCalendar = () => {
    setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setFocused(dayKey(selected));
    focusCalendar.current = true;
    dialog.current?.showModal();
    // Also focus when reopening on the same month and date.
    requestAnimationFrame(() =>
      dialog.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${dayKey(selected)}"]`)
        ?.focus(),
    );
  };
  const choose = (date: Date) => {
    onChange(dayKey(date) === dayKey(today) ? 'today' : dayKey(date));
    dialog.current?.close();
  };
  const step = (amount: number) => {
    const next = moveDay(selected, amount);
    if (parseDay(dayKey(next))) onChange(dayKey(next) === dayKey(today) ? 'today' : dayKey(next));
  };
  const keyDay = (event: KeyboardEvent<HTMLButtonElement>, date: Date) => {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -((date.getDay() + 6) % 7),
      End: 6 - ((date.getDay() + 6) % 7),
    };
    const next =
      event.key === 'PageUp' || event.key === 'PageDown'
        ? new Date(date.getFullYear(), date.getMonth() + (event.key === 'PageUp' ? -1 : 1), 1)
        : event.key in offsets
          ? moveDay(date, offsets[event.key])
          : null;
    if (!next || !parseDay(dayKey(next))) return;
    event.preventDefault();
    focusCalendar.current = true;
    setFocused(dayKey(next));
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  };
  const browseMonth = (amount: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1);
    setMonth(next);
    setFocused(dayKey(next));
  };
  const fullDate = (date: Date) =>
    date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const range = weekend(0, today);
  return (
    <section className="fixture-calendar" aria-label="Fixture dates">
      <div className="fixture-date-bar">
        <button className="fixture-live" aria-pressed={live} onClick={onLive}>
          <i aria-hidden="true" />
          Live
        </button>
        <button className="fixture-day-arrow" aria-label="Previous day" onClick={() => step(-1)}>
          <Chevron back />
        </button>
        <button className="fixture-current-day" onClick={openCalendar} aria-haspopup="dialog">
          <strong aria-live="polite" aria-atomic="true">
            {live ? 'Live now' : value === 'weekend' ? 'This weekend' : dayLabel(selected, today)}
          </strong>
          <span>
            {value === 'weekend'
              ? `${range.start.getDate()} ${range.start.toLocaleDateString('en-GB', { month: 'short' })} – ${range.days[3].getDate()} ${range.days[3].toLocaleDateString('en-GB', { month: 'short' })}`
              : selected.toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
          </span>
        </button>
        <button className="fixture-day-arrow" aria-label="Next day" onClick={() => step(1)}>
          <Chevron />
        </button>
        <div className="fixture-day-strip" ref={strip} role="group" aria-label="Choose a day">
          {days.map((date) => {
            const key = dayKey(date);
            return (
              <button
                key={key}
                tabIndex={key === selectedKey ? 0 : -1}
                aria-label={fullDate(date)}
                aria-pressed={!live && value !== 'weekend' && key === dayKey(selected)}
                onClick={() => choose(date)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                  event.preventDefault();
                  const next = moveDay(date, event.key === 'ArrowLeft' ? -1 : 1);
                  choose(next);
                  requestAnimationFrame(() =>
                    strip.current
                      ?.querySelector<HTMLButtonElement>(`[data-date="${dayKey(next)}"]`)
                      ?.focus(),
                  );
                }}
                data-date={key}
              >
                <strong>
                  {key === dayKey(today)
                    ? 'Today'
                    : date.toLocaleDateString('en-GB', { weekday: 'short' })}
                </strong>
                <span>{date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </button>
            );
          })}
        </div>
        <button
          ref={calendarButton}
          className="fixture-calendar-open"
          aria-label="Choose fixture date"
          aria-haspopup="dialog"
          onClick={openCalendar}
        >
          <Icon name="activity" />
        </button>
      </div>
      <dialog
        ref={dialog}
        className="fixture-date-dialog"
        aria-labelledby="fixture-calendar-title"
        onClose={() => calendarButton.current?.focus()}
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="fixture-date-sheet">
          <header>
            <h2 id="fixture-calendar-title">Choose a date</h2>
            <button aria-label="Close calendar" onClick={() => dialog.current?.close()}>
              ×
            </button>
          </header>
          <div className="fixture-month">
            <strong aria-live="polite">
              {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </strong>
            <button
              aria-label="Previous month"
              disabled={month.getFullYear() === 1900 && month.getMonth() === 0}
              onClick={() => browseMonth(-1)}
            >
              <Chevron back />
            </button>
            <button
              aria-label="Next month"
              disabled={month.getFullYear() === 2100 && month.getMonth() === 11}
              onClick={() => browseMonth(1)}
            >
              <Chevron />
            </button>
          </div>
          <div className="fixture-month-grid" role="group" aria-label="Calendar days">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
              <span className="fixture-weekday" key={day}>
                {day}
              </span>
            ))}
            {dates.map((date) => (
              <button
                key={dayKey(date)}
                data-date={dayKey(date)}
                disabled={!parseDay(dayKey(date))}
                tabIndex={dayKey(date) === focused ? 0 : -1}
                aria-label={fullDate(date)}
                aria-pressed={value !== 'weekend' && dayKey(date) === dayKey(selected)}
                aria-current={dayKey(date) === dayKey(today) ? 'date' : undefined}
                data-outside={date.getMonth() !== month.getMonth()}
                onKeyDown={(event) => keyDay(event, date)}
                onClick={() => choose(date)}
              >
                {date.getDate()}
              </button>
            ))}
          </div>
          <footer>
            <button onClick={() => choose(today)}>Back to today</button>
            <button
              onClick={() => {
                onChange('weekend');
                dialog.current?.close();
              }}
            >
              Weekend
            </button>
          </footer>
        </div>
      </dialog>
    </section>
  );
}
