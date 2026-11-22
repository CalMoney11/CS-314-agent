/**
 * ============================================================================
 * SCREEN: Home Screen (index.tsx)
 * ============================================================================
 * Summary:
 * Landing page (Cole's layout): collapsible navigation menu, a floating AI chat
 * window in the bottom right, and dashboard boxes with live Gmail messages,
 * upcoming Google Calendar events, and Canvas work due soon. Pull to refresh.
 *
 * Key Functions:
 * - HomeScreen: dashboard state, navigation, and chat.
 * - handleSendMessage: sends the conversation to the backend's Claude chat.
 * ============================================================================
 */

import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorNote } from '@/components/error-note';
import { NavHeader } from '@/components/nav-header';
import { useDashboard } from '@/hooks/use-dashboard';
import { api, ChatTurn, errorText } from '@/lib/api';
import { dueLabel, formatDayLabel, formatTime, timeAgo } from '@/lib/dates';

const GREETING = 'Hi! Ask me about your email, calendar, or what’s due on Canvas.';
const DUE_SOON_DAYS = 7;

export default function HomeScreen() {
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useDashboard();

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([{ role: 'assistant', content: GREETING }]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const chatScroll = useRef<ScrollViewInstance>(null);

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    const next: ChatTurn[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInputText('');
    setSending(true);
    try {
      // The greeting is local UI only; the server drops leading assistant turns.
      const { reply } = await api.chat(next);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${errorText(e)}` }]);
    } finally {
      setSending(false);
    }
  };

  const errors = data?.errors ?? {};
  const gmailError = Object.entries(errors).find(([k]) => k.startsWith('gmail:'))?.[1];
  const calendarError = Object.entries(errors).find(([k]) => k.startsWith('calendar:'))?.[1];

  const now = new Date();
  const emails = (data?.emails ?? []).slice(0, 8);
  const unreadCount = (data?.emails ?? []).filter((e) => e.unread).length;
  const upcomingEvents = (data?.events ?? []).filter((ev) => new Date(ev.end) > now).slice(0, 6);
  const dueSoon = (data?.canvas ?? [])
    .filter((c) => !c.done && c.due_at && c.type !== 'announcement' && c.type !== 'calendar_event')
    .filter((c) => new Date(c.due_at!).getTime() < now.getTime() + DUE_SOON_DAYS * 86400000)
    .slice(0, 6);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <NavHeader title="Home" />

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {loading && !data && <ActivityIndicator style={{ marginTop: 40 }} />}

        {error && !data && (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Can’t load your dashboard</Text>
            <ErrorNote message={error} />
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.navigate('/settings')}>
              <Text style={styles.primaryBtnText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {data && (
          <>
            {/* Email Box (Gmail) */}
            <View style={styles.box}>
              <View style={styles.boxHeaderRow}>
                <Text style={styles.boxTitle}>Email</Text>
                {unreadCount > 0 && (
                  <View style={styles.countPill}>
                    <Text style={styles.countPillText}>{unreadCount} unread</Text>
                  </View>
                )}
              </View>
              {gmailError && <ErrorNote message={gmailError} />}
              {!gmailError && emails.length === 0 && <Text style={styles.emptyText}>Inbox is empty.</Text>}
              {emails.map((item) => (
                <TouchableOpacity
                  key={`${item.account}-${item.id}`}
                  style={styles.notifRow}
                  onPress={() => router.navigate({ pathname: '/email', params: { account: item.account, id: item.id } })}>
                  <View style={[styles.unreadDot, !item.unread && styles.readDot]} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.notifSender, item.unread && styles.bold]} numberOfLines={1}>
                      {item.from_name}
                    </Text>
                    <Text style={styles.notifSubject} numberOfLines={1}>{item.subject}</Text>
                  </View>
                  <Text style={styles.notifTime}>{timeAgo(item.date, now)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Canvas Box */}
            <View style={styles.box}>
              <TouchableOpacity style={styles.boxHeaderRow} onPress={() => router.navigate('/canvas')}>
                <Text style={styles.boxTitle}>Canvas: due this week</Text>
                <Text style={styles.chevronText}>▶</Text>
              </TouchableOpacity>
              {errors.canvas && <ErrorNote message={errors.canvas} />}
              {!errors.canvas && dueSoon.length === 0 && <Text style={styles.emptyText}>Nothing due. 🎉</Text>}
              {dueSoon.map((c) => {
                const overdue = new Date(c.due_at!) < now;
                return (
                  <TouchableOpacity key={c.id} style={styles.upcomingRow} onPress={() => router.navigate('/canvas')}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.upcomingText} numberOfLines={1}>{c.title}</Text>
                      <Text style={[styles.upcomingSub, overdue && styles.overdue]} numberOfLines={1}>
                        {c.course} · {dueLabel(c.due_at, now)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Upcoming Box (Links to Calendar) */}
            <View style={styles.box}>
              <View style={styles.boxHeaderRow}>
                <Text style={styles.boxTitle}>Upcoming Schedule</Text>
              </View>
              {calendarError && <ErrorNote message={calendarError} />}
              {!calendarError && upcomingEvents.length === 0 && (
                <Text style={styles.emptyText}>No events in the next week.</Text>
              )}
              {upcomingEvents.map((ev) => (
                <TouchableOpacity
                  key={`${ev.calendar_id}-${ev.id}`}
                  style={styles.upcomingRow}
                  onPress={() => router.navigate({ pathname: '/explore', params: { targetDate: ev.date, t: String(Date.now()) } })}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.upcomingText} numberOfLines={1}>{ev.title}</Text>
                    <Text style={styles.upcomingSub}>
                      {formatDayLabel(new Date(ev.start), now)}
                      {ev.all_day ? ' · All day' : ` at ${formatTime(ev.start)}`}
                    </Text>
                  </View>
                  <Text style={styles.chevronText}>▶</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.updatedText}>Updated {timeAgo(data.generated_at, now)} · pull to refresh</Text>
          </>
        )}
      </ScrollView>

      {/* Floating AI Chat Window (Keyboard-Shifted) */}
      {chatOpen && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
          style={styles.chatWindow}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatHeaderTitle}>AI Assistant</Text>
            <TouchableOpacity onPress={() => setChatOpen(false)} accessibilityLabel="Close chat">
              <Text style={styles.chatCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={chatScroll}
            style={styles.chatMessagesContainer}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            onContentSizeChange={() => chatScroll.current?.scrollToEnd({ animated: true })}>
            {messages.map((msg, index) => (
              <View key={index} style={[styles.chatBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                <Text selectable style={msg.role === 'user' ? styles.userText : styles.aiText}>{msg.content}</Text>
              </View>
            ))}
            {sending && (
              <View style={[styles.chatBubble, styles.aiBubble]}>
                <ActivityIndicator size="small" />
              </View>
            )}
          </ScrollView>

          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder="Ask about your day..."
              placeholderTextColor="#9CA3AF"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSendMessage}
              returnKeyType="send"
              editable={!sending}
            />
            <TouchableOpacity
              style={[styles.sendButton, sending && { opacity: 0.5 }]}
              onPress={handleSendMessage}
              disabled={sending}
              accessibilityLabel="Send">
              <Text style={styles.sendButtonText}>➔</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {!chatOpen && (
        <TouchableOpacity
          style={styles.floatingChatBtn}
          onPress={() => setChatOpen(true)}
          activeOpacity={0.8}
          accessibilityLabel="Open AI assistant">
          <Text style={styles.floatingChatIcon}>💬</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F4F6' },
  contentContainer: { padding: 16, gap: 16, paddingBottom: 100 },
  box: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#E5E7EB', gap: 10 },
  boxHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boxTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  countPill: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  countPillText: { fontSize: 11, fontWeight: '700', color: '#4F46E5' },
  emptyText: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' },
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2563EB' },
  readDot: { backgroundColor: 'transparent' },
  notifSender: { fontSize: 14, fontWeight: '500', color: '#374151' },
  bold: { fontWeight: '700', color: '#111827' },
  notifSubject: { fontSize: 13, color: '#6B7280' },
  notifTime: { fontSize: 11, color: '#9CA3AF', marginLeft: 8 },
  upcomingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  upcomingText: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  upcomingSub: { fontSize: 12, color: '#6B7280' },
  overdue: { color: '#DC2626', fontWeight: '600' },
  chevronText: { fontSize: 12, color: '#9CA3AF', fontWeight: '700', marginLeft: 8 },
  updatedText: { textAlign: 'center', fontSize: 12, color: '#9CA3AF' },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  floatingChatBtn: { position: 'absolute', bottom: 24, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8, zIndex: 50 },
  floatingChatIcon: { fontSize: 24 },
  chatWindow: { position: 'absolute', bottom: 16, right: 16, left: 16, height: 420, backgroundColor: '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 10, borderWidth: 1, borderColor: '#E5E7EB', zIndex: 60, overflow: 'hidden' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#2563EB' },
  chatHeaderTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  chatCloseText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  chatMessagesContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  chatBubble: { padding: 10, borderRadius: 10, maxWidth: '85%' },
  userBubble: { backgroundColor: '#2563EB', alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: '#E5E7EB', alignSelf: 'flex-start' },
  userText: { color: '#FFFFFF', fontSize: 14 },
  aiText: { color: '#1F2937', fontSize: 14 },
  chatInputRow: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  chatInput: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827' },
  sendButton: { marginLeft: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 14 },
  sendButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
