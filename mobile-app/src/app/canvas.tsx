/**
 * SCREEN: Canvas — assignments, quizzes, discussions, and announcements from
 * the Canvas planner, grouped into Overdue / Upcoming / Done / Announcements.
 */
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorNote } from '@/components/error-note';
import { NavHeader } from '@/components/nav-header';
import { api, CanvasItem, errorText } from '@/lib/api';
import { dueLabel, formatDayLabel } from '@/lib/dates';

const TYPE_LABEL: Record<string, string> = {
  assignment: 'Assignment',
  quiz: 'Quiz',
  discussion_topic: 'Discussion',
  announcement: 'Announcement',
  calendar_event: 'Event',
  planner_note: 'To-do',
  wiki_page: 'Page',
};

export default function CanvasScreen() {
  const [items, setItems] = useState<CanvasItem[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const lastLoad = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await api.canvas(14, 45);
      setItems(res.items);
      setErrors(Object.values(res.errors));
      lastLoad.current = Date.now();
    } catch (e) {
      setErrors([errorText(e)]);
      setItems((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoad.current > 60_000) load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const now = new Date();
  const all = items ?? [];
  const work = all.filter((i) => i.type !== 'announcement');
  const overdue = work.filter((i) => !i.done && i.due_at && new Date(i.due_at) < now && i.type !== 'calendar_event');
  const upcoming = work.filter((i) => !i.done && (!i.due_at || new Date(i.due_at) >= now));
  const done = work.filter((i) => i.done).reverse();
  const announcements = all.filter((i) => i.type === 'announcement').reverse();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <NavHeader title="Canvas" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {items === null && <ActivityIndicator style={{ marginTop: 40 }} />}
        {errors.map((e, i) => <ErrorNote key={i} message={e} />)}
        {items !== null && (
          <>
            <Section title={`Overdue (${overdue.length})`} items={overdue} now={now} tone="danger" empty="Nothing overdue." />
            <Section title={`Upcoming (${upcoming.length})`} items={upcoming} now={now} empty="Nothing due in the next 45 days." />
            <Section title="Announcements" items={announcements} now={now} empty="No recent announcements." announcement />
            <Section title="Done recently" items={done} now={now} empty="Nothing completed in the last two weeks." muted />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section(props: {
  title: string; items: CanvasItem[]; now: Date; empty: string;
  tone?: 'danger'; muted?: boolean; announcement?: boolean;
}) {
  const { title, items, now, empty, tone, muted, announcement } = props;
  return (
    <View style={styles.box}>
      <Text style={[styles.boxTitle, tone === 'danger' && items.length > 0 && styles.danger]}>{title}</Text>
      {items.length === 0 && <Text style={styles.emptyText}>{empty}</Text>}
      {items.map((c) => (
        <TouchableOpacity key={c.id} style={styles.row} disabled={!c.web_url} onPress={() => Linking.openURL(c.web_url)}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, muted && styles.muted]} numberOfLines={2}>
              {c.new_activity && !muted ? '● ' : ''}{c.title}
            </Text>
            <Text style={[styles.sub, tone === 'danger' && styles.danger]} numberOfLines={1}>
              {c.course} · {TYPE_LABEL[c.type] ?? c.type}
              {announcement
                ? c.due_at ? ` · ${formatDayLabel(new Date(c.due_at), now)}` : ''
                : ` · ${dueLabel(c.due_at, now)}`}
              {c.points_possible ? ` · ${c.points_possible} pts` : ''}
              {c.missing ? ' · missing' : ''}
              {c.graded ? ' · graded' : ''}
            </Text>
          </View>
          <Text style={styles.chevron}>▶</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  box: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#E5E7EB', gap: 10 },
  boxTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  emptyText: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  title: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  muted: { color: '#9CA3AF' },
  danger: { color: '#DC2626' },
  chevron: { fontSize: 12, color: '#9CA3AF', fontWeight: '700', marginLeft: 8 },
});
