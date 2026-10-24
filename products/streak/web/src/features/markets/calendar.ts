/** Calendar arithmetic uses local dates, not 24-hour offsets across DST. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return year >= 1900 && year <= 2100 && dayKey(date) === value ? date : null;
}
export function moveDay(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}
export function dayLabel(date: Date, today: Date): string {
  const key = dayKey(date);
  if (key === dayKey(today)) return 'Today';
  if (key === dayKey(moveDay(today, -1))) return 'Yesterday';
  if (key === dayKey(moveDay(today, 1))) return 'Tomorrow';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
export function monthDays(month: Date): Date[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const monday = moveDay(start, -((start.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => moveDay(monday, index));
}
