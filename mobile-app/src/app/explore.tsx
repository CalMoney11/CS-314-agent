/**
 * ============================================================================
 * SCREEN: Calendar (explore.tsx)
 * ============================================================================
 * Summary:
 * Cole's calendar view (Month / Week / Day zoom), now showing live Google
 * Calendar events plus Canvas due dates. Accepts a `targetDate` (YYYY-MM-DD)
 * route param so the home screen can jump straight to a day.
 * Read-only: events are managed in Google Calendar (tap one to open it).
 * ============================================================================
 */

import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorNote } from '@/components/error-note';
import { NavHeader } from '@/components/nav-header';
import { api, CalendarEvent, CanvasItem, errorText } from '@/lib/api';
import {
  addDays, DAYS_OF_WEEK, formatLongDate, formatTime, fromKey, keyOfIso, MONTHS, startOfWeek, toKey,
} from '@/lib/dates';

type DayItem =
  | { kind: 'event'; key: string; title: string; sub: string; url: string; sortAt: string }
  | { kind: 'canvas'; key: string; title: string; sub: string; url: string; sortAt: string; done: boolean };

async function fetchMonth(year: number, month: number) {
  // Pad a week on each side so the week view and grid edges have data.
  const start = toKey(addDays(new Date(year, month, 1), -7));
  const end = toKey(addDays(new Date(year, month + 1, 1), 7));
  try {
    const res = await api.calendar(start, end);
    return { items: res.items, errors: Object.values(res.errors) };
  } catch (e) {
    return { items: null, errors: [errorText(e)] };
  }
}

async function fetchCanvas() {
  try {
    const res = await api.canvas(60, 120);
    return { items: res.items, errors: Object.values(res.errors) };
  } catch (e) {
    return { items: null, errors: [errorText(e)] };
  }
}

export default function CalendarScreen() {
  // `t` makes repeated taps on the same date from the home screen still jump.
  const params = useLocalSearchParams<{ targetDate?: string; t?: string }>();
  const today = new Date();

  const [zoomView, setZoomView] = useState<'month' | 'week' | 'day'>('month');
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-11
  const [selectedKey, setSelectedKey] = useState(toKey(today));

  const [eventsByMonth, setEventsByMonth] = useState<Record<string, CalendarEvent[]>>({});
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [calErrors, setCalErrors] = useState<string[]>([]);
  const [canvasErrors, setCanvasErrors] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const selectDate = (key: string) => {
    const d = fromKey(key);
    if (!d) return;
    setSelectedKey(key);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  // Jump from the home screen's Upcoming list (state adjusted during render, per React docs).
  const jumpKey = params.targetDate ? `${params.targetDate}|${params.t ?? ''}` : '';
  const [handledJump, setHandledJump] = useState('');
  if (jumpKey && jumpKey !== handledJump) {
    setHandledJump(jumpKey);
    selectDate(params.targetDate!);
  }

  const monthKey = `${viewYear}-${viewMonth}`;
  const loading = !eventsByMonth[monthKey] && calErrors.length === 0;

  useEffect(() => {
    if (eventsByMonth[monthKey]) return;
    let cancelled = false;
    fetchMonth(viewYear, viewMonth).then((res) => {
      if (cancelled) return;
      if (res.items) setEventsByMonth((prev) => ({ ...prev, [monthKey]: res.items! }));
      setCalErrors(res.errors);
    });
    return () => {
      cancelled = true;
    };
  }, [monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchCanvas().then((res) => {
      if (res.items) setCanvasItems(res.items);
      setCanvasErrors(res.errors);
    });
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    const [cal, cv] = await Promise.all([fetchMonth(viewYear, viewMonth), fetchCanvas()]);
    // Drop other cached months so they reload fresh when visited.
    setEventsByMonth(cal.items ? { [monthKey]: cal.items } : {});
    setCalErrors(cal.errors);
    if (cv.items) setCanvasItems(cv.items);
    setCanvasErrors(cv.errors);
    setRefreshing(false);
  };

  const errors = [...calErrors, ...canvasErrors];

  // Everything for each local day, from the loaded month plus Canvas.
  const itemsByDay = useMemo(() => {
    const map: Record<string, DayItem[]> = {};
    const push = (k: string, item: DayItem) => (map[k] ??= []).push(item);
    const seen = new Set<string>();
    for (const evs of Object.values(eventsByMonth)) {
      for (const ev of evs) {
        const id = `${ev.calendar_id}|${ev.id}`;
        if (seen.has(id)) continue; // months overlap by a week
        seen.add(id);
        // Multi-day events appear on each day they cover.
        const startD = fromKey(ev.date)!;
        const endD = new Date(ev.end);
        let d = startD;
        for (let i = 0; i < 31 && (i === 0 || d < endD); i++, d = addDays(startD, i)) {
          if (i > 0 && ev.all_day && toKey(d) === toKey(endD)) break; // all-day end is exclusive
          push(toKey(d), {
            kind: 'event',
            key: `${id}|${i}`,
            title: ev.title,
            sub: ev.all_day ? 'All day' : `${formatTime(ev.start)} – ${formatTime(ev.end)}${ev.location ? ` · ${ev.location}` : ''}`,
            url: ev.web_url,
            sortAt: ev.all_day ? '' : ev.start,
          });
        }
      }
    }
    for (const c of canvasItems) {
      if (!c.due_at) continue;
      push(keyOfIso(c.due_at), {
        kind: 'canvas',
        key: c.id,
        title: c.title,
        sub: `${c.course} · due ${formatTime(c.due_at)}${c.done ? ' · done' : ''}`,
        url: c.web_url,
        sortAt: c.due_at,
        done: c.done,
      });
    }
    for (const list of Object.values(map)) list.sort((a, b) => a.sortAt.localeCompare(b.sortAt));
    return map;
  }, [eventsByMonth, canvasItems]);

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const selectedDate = fromKey(selectedKey) ?? today;
  const weekStart = startOfWeek(selectedDate);
  const dayItems = itemsByDay[selectedKey] ?? [];
  const todayKey = toKey(today);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const dotsFor = (k: string) => {
    const items = itemsByDay[k] ?? [];
    return {
      event: items.some((i) => i.kind === 'event'),
      canvas: items.some((i) => i.kind === 'canvas' && !i.done),
    };
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <NavHeader
        title="Calendar"
        right={
          <TouchableOpacity style={styles.todayBtn} onPress={() => selectDate(todayKey)}>
            <Text style={styles.todayBtnText}>Today</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.zoomToggleRow}>
          {(['month', 'week', 'day'] as const).map((z) => (
            <TouchableOpacity key={z} style={[styles.zoomBtn, zoomView === z && styles.activeZoomBtn]} onPress={() => setZoomView(z)}>
              <Text style={[styles.zoomBtnText, zoomView === z && styles.activeZoomBtnText]}>
                {z === 'month' ? 'Month View' : z === 'week' ? 'Week View' : 'Day Focus'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthPillsContainer}>
          {MONTHS.map((month, index) => {
            const isActive = index === viewMonth;
            return (
              <TouchableOpacity key={month} style={[styles.monthPill, isActive && styles.activeMonthPill]} onPress={() => setViewMonth(index)}>
                <Text style={[styles.monthPillText, isActive && styles.activeMonthPillText]}>{month.slice(0, 3)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {errors.map((e, i) => <ErrorNote key={i} message={e} />)}

        <View style={styles.calendarCard}>
          <View style={styles.monthNavRow}>
            <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.navArrowBtn} accessibilityLabel="Previous month">
              <Text style={styles.navArrowText}>◀</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={styles.monthYearLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
              {loading && <ActivityIndicator size="small" />}
            </View>
            <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.navArrowBtn} accessibilityLabel="Next month">
              <Text style={styles.navArrowText}>▶</Text>
            </TouchableOpacity>
          </View>

          {zoomView !== 'day' && (
            <View style={styles.weekHeaderRow}>
              {DAYS_OF_WEEK.map((day) => <Text key={day} style={styles.weekDayText}>{day}</Text>)}
            </View>
          )}

          {zoomView === 'month' && (
            <View style={styles.daysGrid}>
              {calendarCells.map((day, index) => {
                if (day === null) return <View key={`empty-${index}`} style={styles.dayCell} />;
                const k = toKey(new Date(viewYear, viewMonth, day));
                const isSelected = selectedKey === k;
                const dots = dotsFor(k);
                return (
                  <TouchableOpacity key={k} style={[styles.dayCell, isSelected && styles.selectedDayCell]} onPress={() => setSelectedKey(k)}>
                    <Text style={[styles.dayNumberText, k === todayKey && styles.todayText, isSelected && styles.selectedDayText]}>{day}</Text>
                    <View style={styles.dotRow}>
                      {dots.event && <View style={[styles.eventDot, isSelected && styles.dotOnSelected]} />}
                      {dots.canvas && <View style={[styles.canvasDot, isSelected && styles.dotOnSelected]} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {zoomView === 'week' && (
            <View style={styles.weekRowGrid}>
              {DAYS_OF_WEEK.map((dName, idx) => {
                const d = addDays(weekStart, idx);
                const k = toKey(d);
                const isSelected = selectedKey === k;
                const count = (itemsByDay[k] ?? []).length;
                return (
                  <TouchableOpacity key={dName} style={[styles.weekColumnCell, isSelected && styles.selectedDayCell]} onPress={() => selectDate(k)}>
                    <Text style={[styles.dayNumberText, k === todayKey && styles.todayText, isSelected && styles.selectedDayText]}>{d.getDate()}</Text>
                    <Text style={[styles.weekCount, isSelected && styles.selectedDayText]}>{count > 0 ? count : ' '}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {zoomView === 'day' && (
            <View style={styles.dayZoomContainer}>
              <View style={styles.dayNavRow}>
                <TouchableOpacity style={styles.navArrowBtn} onPress={() => selectDate(toKey(addDays(selectedDate, -1)))} accessibilityLabel="Previous day">
                  <Text style={styles.navArrowText}>◀</Text>
                </TouchableOpacity>
                <Text style={styles.dayZoomTitle}>{formatLongDate(selectedDate)}</Text>
                <TouchableOpacity style={styles.navArrowBtn} onPress={() => selectDate(toKey(addDays(selectedDate, 1)))} accessibilityLabel="Next day">
                  <Text style={styles.navArrowText}>▶</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.dayZoomSubtitle}>
                {dayItems.length === 0 ? 'Nothing scheduled' : `${dayItems.length} item${dayItems.length === 1 ? '' : 's'}`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.eventManagerCard}>
          <Text style={styles.eventManagerTitle}>{formatLongDate(selectedDate)}</Text>
          {dayItems.length === 0 ? (
            <Text style={styles.noEventsText}>No events scheduled for this day.</Text>
          ) : (
            dayItems.map((it) => (
              <TouchableOpacity key={it.key} style={styles.eventRow} disabled={!it.url} onPress={() => Linking.openURL(it.url)}>
                <View style={[styles.kindBar, it.kind === 'canvas' ? styles.kindCanvas : styles.kindEvent]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventItemText, it.kind === 'canvas' && it.done && styles.doneText]} numberOfLines={2}>
                    {it.kind === 'canvas' ? '📚 ' : ''}{it.title}
                  </Text>
                  <Text style={styles.eventSub} numberOfLines={1}>{it.sub}</Text>
                </View>
              </TouchableOpacity>
            ))
          )}
          <View style={styles.legendRow}>
            <View style={styles.eventDot} /><Text style={styles.legendText}>Google Calendar</Text>
            <View style={[styles.canvasDot, { marginLeft: 12 }]} /><Text style={styles.legendText}>Canvas due</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F4F6' },
  todayBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2563EB' },
  todayBtnText: { fontSize: 13, fontWeight: '600', color: '#2563EB' },
  contentContainer: { padding: 16, gap: 16, paddingBottom: 40 },
  zoomToggleRow: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 10, padding: 4 },
  zoomBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  activeZoomBtn: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  zoomBtnText: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  activeZoomBtnText: { color: '#2563EB' },
  monthPillsContainer: { gap: 8, paddingVertical: 4 },
  monthPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  activeMonthPill: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  monthPillText: { fontSize: 14, fontWeight: '600', color: '#4B5563' },
  activeMonthPillText: { color: '#FFFFFF' },
  calendarCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  monthNavRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  navArrowBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F3F4F6' },
  navArrowText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  monthYearLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  weekHeaderRow: { flexDirection: 'row', marginBottom: 8 },
  weekDayText: { width: '14.28%', textAlign: 'center', fontSize: 13, fontWeight: '600', color: '#6B7280' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 10, marginVertical: 2 },
  selectedDayCell: { backgroundColor: '#2563EB' },
  dayNumberText: { fontSize: 15, fontWeight: '500', color: '#1F2937' },
  todayText: { color: '#2563EB', fontWeight: '800' },
  selectedDayText: { color: '#FFFFFF', fontWeight: '700' },
  dotRow: { flexDirection: 'row', gap: 3, position: 'absolute', bottom: 6 },
  eventDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#2563EB' },
  canvasDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#EF4444' },
  dotOnSelected: { backgroundColor: '#FFFFFF' },
  weekRowGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  weekColumnCell: { width: '13.5%', alignItems: 'center', paddingVertical: 12, borderRadius: 8, backgroundColor: '#F9FAFB' },
  weekCount: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  dayZoomContainer: { alignItems: 'center', gap: 8 },
  dayNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' },
  dayZoomTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flexShrink: 1, textAlign: 'center' },
  dayZoomSubtitle: { fontSize: 13, color: '#6B7280' },
  eventManagerCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', gap: 12 },
  eventManagerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  noEventsText: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  kindBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  kindEvent: { backgroundColor: '#2563EB' },
  kindCanvas: { backgroundColor: '#EF4444' },
  eventItemText: { fontSize: 15, color: '#374151', fontWeight: '600' },
  doneText: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  eventSub: { fontSize: 12, color: '#6B7280' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  legendText: { fontSize: 12, color: '#6B7280' },
});
