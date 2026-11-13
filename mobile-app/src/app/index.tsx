/**
 * ============================================================================
 * SCREEN: Home Screen (index.tsx)
 * ============================================================================
 * Summary: 
 * The primary landing page featuring a collapsible navigation menu, a dynamic 
 * keyboard-safe floating AI chat window in the bottom right, and interactive 
 * dashboard boxes displaying live Gmail/Outlook notifications and upcoming calendar items.
 * 
 * Key Functions:
 * - HomeScreen: Main React component managing dashboard state and navigation.
 * - navigateTo: Handles Expo Router screen transitions.
 * - handleSendMessage: Appends user inputs and triggers AI assistant responses.
 * ============================================================================
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Href } from 'expo-router';

export default function HomeScreen() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: 'Hello! I am your AI assistant. How can I help you build your app today?' },
  ]);
  const [inputText, setInputText] = useState('');
  const router = useRouter();

  // Simulated live mail states (Gmail + Outlook combined or toggled)
  const [notifications] = useState([
    { id: '1', provider: 'Gmail', sender: 'GitHub', subject: 'Pull Request merged to main', time: '10m ago' },
    { id: '2', provider: 'Outlook', sender: 'University Advisor', subject: 'CS-314 syllabus update', time: '1h ago' },
  ]);

  // Upcoming items that link straight to calendar dates
  const [upcomingEvents] = useState([
    { id: '1', title: 'Team Sync', dateKey: '2026-11-13', time: '2:00 PM' },
    { id: '2', title: 'Code Review', dateKey: '2026-11-14', time: '10:00 AM' },
  ]);

  const navigateTo = (route: Href) => {
    setMenuOpen(false);
    router.push(route);
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    const userMsg = inputText.trim();
    setMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setInputText('');

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { sender: 'ai', text: `I received: "${userMsg}". (Backend connection pending!)` },
      ]);
    }, 600);
  };

  /**
   * Navigates to the calendar explore page with a target date query parameter
   */
  const jumpToCalendarDate = (dateKey: string) => {
    router.push({
      pathname: '/explore',
      params: { targetDate: dateKey },
    } as any);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setMenuOpen(!menuOpen)}
          activeOpacity={0.7}>
          <Text style={styles.arrowIcon}>{menuOpen ? '▼' : '▶'}</Text>
          <Text style={styles.headerTitle}>Home</Text>
        </TouchableOpacity>
      </View>

      {/* Dropdown Menu */}
      {menuOpen && (
        <View style={styles.dropdownMenu}>
          <TouchableOpacity style={[styles.dropdownItem, styles.activeDropdownItem]} onPress={() => navigateTo('/')}>
            <Text style={[styles.dropdownText, styles.activeDropdownText]}>Home Page</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.dropdownItem} onPress={() => navigateTo('/explore')}>
            <Text style={styles.dropdownText}>Calendar Page</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Main Content Dashboard */}
      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        {/* Notifications Box (Gmail & Outlook Integration) */}
        <View style={styles.box}>
          <View style={styles.boxHeaderRow}>
            <Text style={styles.boxTitle}>Notifications (Gmail & Outlook)</Text>
          </View>
          {notifications.map((item) => (
            <View key={item.id} style={styles.notifRow}>
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{item.provider}</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.notifSender} numberOfLines={1}>{item.sender}: {item.subject}</Text>
                <Text style={styles.notifTime}>{item.time}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Upcoming Box (Links to Calendar) */}
        <View style={styles.box}>
          <View style={styles.boxHeaderRow}>
            <Text style={styles.boxTitle}>Upcoming Schedule</Text>
          </View>
          {upcomingEvents.map((ev) => (
            <TouchableOpacity 
              key={ev.id} 
              style={styles.upcomingRow}
              onPress={() => jumpToCalendarDate(ev.dateKey)}>
              <View>
                <Text style={styles.upcomingText}>{ev.title}</Text>
                <Text style={styles.upcomingSub}>{ev.dateKey} at {ev.time}</Text>
              </View>
              <Text style={styles.chevronText}>▶</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* WORK Box */}
        <View style={styles.box}>
          <Text style={styles.boxTitle}>WORK Dashboard</Text>
          <Text style={styles.workSubText}>Partner codebase active on GitHub.</Text>
        </View>
      </ScrollView>

      {/* Floating Interactive AI Chat Window Overlay (Keyboard-Shifted) */}
      {chatOpen && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
          style={styles.chatWindow}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatHeaderTitle}>AI Assistant</Text>
            <TouchableOpacity onPress={() => setChatOpen(false)}>
              <Text style={styles.chatCloseText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.chatMessagesContainer} contentContainerStyle={{ padding: 12, gap: 8 }}>
            {messages.map((msg, index) => (
              <View
                key={index}
                style={[
                  styles.chatBubble,
                  msg.sender === 'user' ? styles.userBubble : styles.aiBubble,
                ]}>
                <Text style={msg.sender === 'user' ? styles.userText : styles.aiText}>
                  {msg.text}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.chatInputRow}>
            <TextInput
              style={styles.chatInput}
              placeholder="Type a message..."
              placeholderTextColor="#9CA3AF"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSendMessage}
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
              <Text style={styles.sendButtonText}>➔</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Bottom Right Floating Chat Circle Button */}
      {!chatOpen && (
        <TouchableOpacity
          style={styles.floatingChatBtn}
          onPress={() => setChatOpen(true)}
          activeOpacity={0.8}>
          <Text style={styles.floatingChatIcon}>💬</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F4F6' },
  headerContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', zIndex: 20 },
  menuButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingRight: 12 },
  arrowIcon: { fontSize: 16, color: '#111827', width: 22 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginLeft: 6 },
  dropdownMenu: { position: 'absolute', top: Platform.OS === 'android' ? 56 : 60, left: 16, width: 200, backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 8, borderWidth: 1, borderColor: '#E5E7EB', zIndex: 30 },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 16 },
  activeDropdownItem: { backgroundColor: '#EFF6FF' },
  dropdownText: { fontSize: 16, fontWeight: '500', color: '#374151' },
  activeDropdownText: { color: '#2563EB', fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 12 },
  contentContainer: { padding: 16, gap: 16, paddingBottom: 100 },
  box: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#E5E7EB', gap: 10 },
  boxHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  boxTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  notifRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  notifBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  notifBadgeText: { fontSize: 11, fontWeight: '700', color: '#4F46E5' },
  notifSender: { fontSize: 14, fontWeight: '600', color: '#374151' },
  notifTime: { fontSize: 11, color: '#9CA3AF' },
  upcomingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  upcomingText: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  upcomingSub: { fontSize: 12, color: '#6B7280' },
  chevronText: { fontSize: 12, color: '#9CA3AF', fontWeight: '700' },
  workSubText: { fontSize: 14, color: '#6B7280' },
  floatingChatBtn: { position: 'absolute', bottom: 24, right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 8, zIndex: 50 },
  floatingChatIcon: { fontSize: 24 },
  chatWindow: { position: 'absolute', bottom: 16, right: 16, left: 16, height: 380, backgroundColor: '#FFFFFF', borderRadius: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 10, borderWidth: 1, borderColor: '#E5E7EB', zIndex: 60, overflow: 'hidden' },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#2563EB' },
  chatHeaderTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  chatCloseText: { color: '#FFFFFF', fontSize: '18' as any, fontWeight: '700' },
  chatMessagesContainer: { flex: 1, backgroundColor: '#F9FAFB' },
  chatBubble: { padding: 10, borderRadius: 10, maxWidth: '80%' },
  userBubble: { backgroundColor: '#2563EB', alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: '#E5E7EB', alignSelf: 'flex-start' },
  userText: { color: '#FFFFFF', fontSize: 14 },
  aiText: { color: '#1F2937', fontSize: 14 },
  chatInputRow: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  chatInput: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827' },
  sendButton: { marginLeft: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 14 },
  sendButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});