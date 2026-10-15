/** Viewer-local Friday through Monday, including DST and month/year boundaries. */
export function weekend(offset = 0, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = start.getDay();
  const toFriday = day === 0 ? -2 : day === 1 ? -3 : 5 - day;
  start.setDate(start.getDate() + toFriday + offset * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 4);
  const days = Array.from({ length: 4 }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index);
    return date;
  });
  return { start, end, days };
}
