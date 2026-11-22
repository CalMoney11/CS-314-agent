/**
 * Local notifications (no Apple push needed, works with a free Apple ID):
 *  - New unread emails: posted when the app or the background task sees an
 *    unread inbox message it hasn't seen before.
 *  - Canvas deadlines: scheduled ahead of time (24h and 2h before) for every
 *    unfinished assignment/quiz/discussion, so they fire on time even if the
 *    app never runs in the background.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import type { CanvasItem, Dashboard, Email } from './api';
import { formatTime, formatDayLabel } from './dates';

export type NotificationPrefs = { emails: boolean; canvas: boolean };

const PREFS_KEY = 'notif_prefs_v1';
const SEEN_KEY = 'seen_email_ids_v1';
const CANVAS_PREFIX = 'canvas-';
const MAX_SEEN = 500;
// iOS keeps at most 64 pending local notifications per app.
const MAX_CANVAS_SCHEDULED = 40;
const REMIND_BEFORE_HOURS = [24, 2];
const DUE_TYPES = new Set(['assignment', 'quiz', 'discussion_topic']);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (raw) return { emails: true, canvas: true, ...JSON.parse(raw) };
  } catch {
    // fall through to defaults
  }
  return { emails: true, canvas: true };
}

export async function setPrefs(prefs: NotificationPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  if (!prefs.canvas) await cancelCanvasReminders();
}

export async function ensurePermission(ask: boolean): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask || !current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

// ---------------------------------------------------------------- emails

/** Records these emails as seen. Returns unread ones not seen before, and whether this was the first run. */
async function markSeen(emails: Email[]): Promise<{ fresh: Email[]; firstRun: boolean }> {
  const raw = await AsyncStorage.getItem(SEEN_KEY);
  const seen: string[] = raw ? JSON.parse(raw) : [];
  const seenSet = new Set(seen);
  const fresh = emails.filter((e) => e.unread && !seenSet.has(e.id));
  const merged = [...emails.map((e) => e.id).filter((id) => !seenSet.has(id)), ...seen].slice(0, MAX_SEEN);
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(merged));
  return { fresh, firstRun: raw === null };
}

async function notifyNewEmails(emails: Email[]): Promise<number> {
  const { fresh, firstRun } = await markSeen(emails);
  // First run: remember what's already there instead of announcing the whole inbox.
  if (firstRun || fresh.length === 0) return 0;

  if (fresh.length <= 3) {
    for (const e of fresh) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: e.from_name || e.from_email || 'New email',
          subtitle: e.subject,
          body: e.snippet,
          data: { kind: 'email', account: e.account, id: e.id },
        },
        trigger: null,
      });
    }
  } else {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${fresh.length} new emails`,
        body: fresh.slice(0, 3).map((e) => `${e.from_name}: ${e.subject}`).join('\n'),
        data: { kind: 'inbox' },
      },
      trigger: null,
    });
  }
  return fresh.length;
}

// ---------------------------------------------------------------- canvas

async function cancelCanvasReminders(): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    pending
      .filter((n) => n.identifier.startsWith(CANVAS_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export function canvasReminderTimes(item: CanvasItem, now = Date.now()): { at: number; hours: number }[] {
  if (item.done || !item.due_at || !DUE_TYPES.has(item.type)) return [];
  const due = new Date(item.due_at).getTime();
  return REMIND_BEFORE_HOURS.map((hours) => ({ at: due - hours * 3600000, hours })).filter((r) => r.at > now + 60000);
}

async function scheduleCanvasReminders(items: CanvasItem[]): Promise<number> {
  await cancelCanvasReminders();
  const now = Date.now();
  const reminders = items
    .flatMap((item) => canvasReminderTimes(item, now).map((r) => ({ item, ...r })))
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_CANVAS_SCHEDULED);

  for (const { item, at, hours } of reminders) {
    const due = item.due_at!;
    await Notifications.scheduleNotificationAsync({
      identifier: `${CANVAS_PREFIX}${item.id}-${hours}h`,
      content: {
        title: `${hours === 24 ? 'Due tomorrow' : `Due in ${hours} hours`}: ${item.title}`,
        body: `${item.course} · ${formatDayLabel(new Date(due))} ${formatTime(due)}`,
        data: { kind: 'canvas', url: item.web_url },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
  }
  return reminders.length;
}

// ---------------------------------------------------------------- entry point

/** Called after every successful dashboard fetch (foreground or background). */
export async function processDashboard(d: Dashboard): Promise<void> {
  const prefs = await getPrefs();
  const allowed = await ensurePermission(false);
  // Always record seen emails, so turning notifications on later doesn't replay old mail.
  if (!d.errors || !Object.keys(d.errors).some((k) => k.startsWith('gmail:'))) {
    if (prefs.emails && allowed) await notifyNewEmails(d.emails);
    else await markSeen(d.emails);
  }
  if (prefs.canvas && allowed && !d.errors?.canvas) await scheduleCanvasReminders(d.canvas);
}

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Notifications are working', body: 'You will get new-email and Canvas deadline alerts.' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 },
  });
}
