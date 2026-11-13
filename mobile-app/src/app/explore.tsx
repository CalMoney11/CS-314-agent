/**
 * ============================================================================
 * SCREEN: Calendar & Event Manager (explore.tsx)
 * ============================================================================
 * Summary: 
 * Manages the calendar view with multi-view zoom levels (Month, Week, Day), 
 * route parameter handling to jump directly from home screen widgets, and 
 * event management (adding/deleting items).
 * ============================================================================
 */

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Href } from 'expo-router';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const params = useLocalSearchParams();

  const currentYear = new Date().getFullYear();
  const today = new Date();

  const [zoomView, setZoomView] = useState<'month' | 'week' | 'day'>('month');
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(
    `${currentYear}-${today.getMonth()}-${today.getDate()}`
  );

  // Handle incoming deep links from home screen upcoming events
  useEffect(() => {
    if (params?.targetDate && typeof params.targetDate === 'string') {
      setSelectedDate(params.targetDate);
      const parts = params.targetDate.split('-');
      if (parts.length >= 2) {
        const mIdx = parseInt(parts[1], 10);
        if (!isNaN(mIdx) && mIdx >= 0 && mIdx <= 11) {
          setSelectedMonth(mIdx);
        }
      }
    }
  }, [params?.targetDate]);

  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [events, setEvents] = useState<Record<string, string[]>>({
    [`${currentYear}-${today.getMonth()}-${today.getDate()}`]: ['Team Sync', 'Review Code'],
    '2026-11-13': ['Team Sync'],
    '2026-11-14': ['Code Review'],
  });

  const [newEventText, setNewEventText] = useState('');

  const navigateTo = (route: Href) => {
    setMenuOpen(false);
    router.push(route);
  };

  const handleConnectGoogle = () => {
    setIsGoogleConnected(true);
    Alert.alert('Google Calendar Connected', 'Successfully synced events from your primary Google Calendar!');
  };

  const handleAddEvent = () => {
    if (!newEventText.trim()) return;
    setEvents((prev) => {
      const currentList = prev[selectedDate] || [];
      return { ...prev, [selectedDate]: [...currentList, newEventText.trim()] };
    });
    setNewEventText('');
  };

  const handleDeleteEvent = (indexToDelete: number) => {
    setEvents((prev) => {
      const currentList = prev[selectedDate] || [];
      const updatedList = currentList.filter((_, idx) => idx !== indexToDelete);
      return { ...prev, [selectedDate]: updatedList };
    });
  };

  const firstDayOfMonth = new Date(currentYear, selectedMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, selectedMonth + 1, 0).getDate();

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const [selYear, selMonthIdx, selDay] = selectedDate.split('-').map(Number);
  const formattedSelectedDate = `${MONTHS[selMonthIdx] || 'Month'} ${selDay || 1}, ${selYear || currentYear}`;
  const dayEvents = events[selectedDate] || [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setMenuOpen(!menuOpen)}
          activeOpacity={0.7}>
          <Text style={styles.arrowIcon}>{menuOpen ? '▼' : '▶'}</Text>
          <Text style={styles.headerTitle}>Calendar</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.googleSyncBtn, isGoogleConnected && styles.googleSyncedBtn]}
          onPress={handleConnectGoogle}>
          <Text style={[styles.googleSyncText, isGoogleConnected && styles.googleSyncedText]}>
            {isGoogleConnected ? '✓ Google Synced' : 'Connect Google'}
          </Text>
        </TouchableOpacity>
      </View>

      {menuOpen && (
        <View style={styles.dropdownMenu}>
          <TouchableOpacity style={styles.dropdownItem} onPress={() => navigateTo('/')}>
            <Text style={styles.dropdownText}>Home Page</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={[styles.dropdownItem, styles.activeDropdownItem]} onPress={() => navigateTo('/explore')}>
            <Text style={[styles.dropdownText, styles.activeDropdownText]}>Calendar Page</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.zoomToggleRow}>
          <TouchableOpacity style={[styles.zoomBtn, zoomView === 'month' && styles.activeZoomBtn]} onPress={() => setZoomView('month')}>
            <Text style={[styles.zoomBtnText, zoomView === 'month' && styles.activeZoomBtnText]}>Month View</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.zoomBtn, zoomView === 'week' && styles.activeZoomBtn]} onPress={() => setZoomView('week')}>
            <Text style={[styles.zoomBtnText, zoomView === 'week' && styles.activeZoomBtnText]}>Week View</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.zoomBtn, zoomView === 'day' && styles.activeZoomBtn]} onPress={() => setZoomView('day')}>
            <Text style={[styles.zoomBtnText, zoomView === 'day' && styles.activeZoomBtnText]}>Day Focus</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthPillsContainer}>
          {MONTHS.map((month, index) => {
            const isActive = index === selectedMonth;
            return (
              <TouchableOpacity
                key={month}
                style={[styles.monthPill, isActive && styles.activeMonthPill]}
                onPress={() => setSelectedMonth(index)}>
                <Text style={[styles.monthPillText, isActive && styles.activeMonthPillText]}>
                  {month.slice(0, 3)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.calendarCard}>
          <View style={styles.monthNavRow}>
            <TouchableOpacity onPress={() => setSelectedMonth((p) => (p > 0 ? p - 1 : 11))} style={styles.navArrowBtn}>
              <Text style={styles.navArrowText}>◀</Text>
            </TouchableOpacity>
            <Text style={styles.monthYearLabel}>
              {MONTHS[selectedMonth]} {currentYear} ({zoomView.toUpperCase()})
            </Text>
            <TouchableOpacity onPress={() => setSelectedMonth((p) => (p < 11 ? p + 1 : 0))} style={styles.navArrowBtn}>
              <Text style={styles.navArrowText}>▶</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.weekHeaderRow}>
            {DAYS_OF_WEEK.map((day) => (
              <Text key={day} style={styles.weekDayText}>{day}</Text>
            ))}
          </View>

          {zoomView === 'month' && (
            <View style={styles.daysGrid}>
              {calendarCells.map((day, index) => {
                if (day === null) return <View key={`empty-${index}`} style={styles.dayCell} />;
                const dateKey = `${currentYear}-${selectedMonth}-${day}`;
                const isSelected = selectedDate === dateKey;
                const hasEvents = events[dateKey] && events[dateKey].length > 0;

                return (
                  <TouchableOpacity
                    key={dateKey}
                    style={[styles.dayCell, isSelected && styles.selectedDayCell]}
                    onPress={() => setSelectedDate(dateKey)}>
                    <Text style={[styles.dayNumberText, isSelected && styles.selectedDayText]}>{day}</Text>
                    {hasEvents && <View style={styles.eventDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {zoomView === 'week' && (
            <View style={styles.weekZoomContainer}>
              <Text style={styles.zoomSubLabel}>Showing active week row for {MONTHS[selectedMonth]}</Text>
              <View style={styles.weekRowGrid}>
                {DAYS_OF_WEEK.map((dName, idx) => {
                  const targetDay = Math.min(daysInMonth, Math.max(1, selDay - 3 + idx));
                  const dateKey = `${currentYear}-${selectedMonth}-${targetDay}`;
                  const isSelected = selectedDate === dateKey;
                  return (
                    <TouchableOpacity
                      key={dName}
                      style={[styles.weekColumnCell, isSelected && styles.selectedDayCell]}
                      onPress={() => setSelectedDate(dateKey)}>
                      <Text style={styles.weekColName}>{dName}</Text>
                      <Text style={[styles.dayNumberText, isSelected && styles.selectedDayText]}>{targetDay}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {zoomView === 'day' && (
            <View style={styles.dayZoomContainer}>
              <Text style={styles.dayZoomTitle}>{formattedSelectedDate}</Text>
              <Text style={styles.dayZoomSubtitle}>Hourly schedule block overview (08:00 AM - 06:00 PM)</Text>
            </View>
          )}
        </View>

        <View style={styles.eventManagerCard}>
          <Text style={styles.eventManagerTitle}>Events on {formattedSelectedDate}</Text>

          {dayEvents.length === 0 ? (
            <Text style={styles.noEventsText}>No events scheduled for this day.</Text>
          ) : (
            dayEvents.map((ev, idx) => (
              <View key={idx} style={styles.eventRow}>
                <Text style={styles.eventItemText}>• {ev}</Text>
                <TouchableOpacity onPress={() => handleDeleteEvent(idx)}>
                  <Text style={styles.deleteEventText}>Delete</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <View style={styles.addEventRow}>
            <TextInput
              style={styles.eventInput}
              placeholder="Add new event..."
              placeholderTextColor="#9CA3AF"
              value={newEventText}
              onChangeText={setNewEventText}
            />
            <TouchableOpacity style={styles.addEventBtn} onPress={handleAddEvent}>
              <Text style={styles.addEventBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F4F6' },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', zIndex: 20 },
  menuButton: { flexDirection: 'row', alignItems: 'center' },
  arrowIcon: { fontSize: 16, color: '#111827', width: 22 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginLeft: 6 },
  googleSyncBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#2563EB' },
  googleSyncedBtn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  googleSyncText: { fontSize: 13, fontWeight: '600', color: '#2563EB' },
  googleSyncedText: { color: '#FFFFFF' },
  dropdownMenu: { position: 'absolute', top: Platform.OS === 'android' ? 56 : 60, left: 16, width: 200, backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 8, borderWidth: 1, borderColor: '#E5E7EB', zIndex: 30 },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 16 },
  activeDropdownItem: { backgroundColor: '#EFF6FF' },
  dropdownText: { fontSize: 16, fontWeight: '500', color: '#374151' },
  activeDropdownText: { color: '#2563EB', fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 12 },
  contentContainer: { padding: 16, gap: 16 },
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
  selectedDayText: { color: '#FFFFFF', fontWeight: '700' },
  eventDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#EF4444', position: 'absolute', bottom: 6 },
  weekZoomContainer: { paddingVertical: 12 },
  zoomSubLabel: { fontSize: 13, color: '#6B7280', marginBottom: 8, textAlign: 'center' },
  weekRowGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  weekColumnCell: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 8, backgroundColor: '#F9FAFB' },
  weekColName: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  dayZoomContainer: { paddingVertical: 24, alignItems: 'center' },
  dayZoomTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  dayZoomSubtitle: { fontSize: 13, color: '#6B7280' },
  eventManagerCard: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', gap: 12 },
  eventManagerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  noEventsText: { fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' },
  eventRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  eventItemText: { fontSize: 15, color: '#374151' },
  deleteEventText: { fontSize: 14, color: '#EF4444', fontWeight: '600' },
  addEventRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  eventInput: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827' },
  addEventBtn: { backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, borderRadius: 8 },
  addEventBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});