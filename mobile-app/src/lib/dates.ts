/** Date helpers. Calendar keys are local dates formatted YYYY-MM-DD (month 1-12). */

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses YYYY-MM-DD as a local date. Returns null for anything else. */
export function fromKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function startOfWeek(d: Date): Date {
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -d.getDay());
}

export function formatLongDate(d: Date): string {
  return `${DAYS_OF_WEEK[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${ampm}`;
}

/** "Today", "Tomorrow", "Wed Nov 26". */
export function formatDayLabel(d: Date, now = new Date()): string {
  const diff = Math.round((fromKey(toKey(d))!.getTime() - fromKey(toKey(now))!.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return `${DAYS_OF_WEEK[d.getDay()]} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

/** "5m ago", "3h ago", "Yesterday", "Nov 3". */
export function timeAgo(iso: string | null, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'Yesterday';
  return `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

/** "Due in 3h", "Due tomorrow 11:59 PM", "Overdue". */
export function dueLabel(iso: string | null, now = new Date()): string {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  const ms = d.getTime() - now.getTime();
  if (ms < 0) return `Was due ${formatDayLabel(d, now)} ${formatTime(iso)}`;
  if (ms < 3600000) return `Due in ${Math.max(1, Math.round(ms / 60000))}m`;
  if (ms < 6 * 3600000) return `Due in ${Math.round(ms / 3600000)}h`;
  return `Due ${formatDayLabel(d, now)} ${formatTime(iso)}`;
}

/** Local YYYY-MM-DD key for an ISO timestamp. */
export function keyOfIso(iso: string): string {
  return toKey(new Date(iso));
}
