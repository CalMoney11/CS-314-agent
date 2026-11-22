/**
 * Top header with the collapsible page menu (Cole's design, shared by every screen).
 */
import { Href, usePathname, useRouter } from 'expo-router';
import React, { ReactNode, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PAGES: { label: string; route: Href; path: string }[] = [
  { label: 'Home', route: '/', path: '/' },
  { label: 'Calendar', route: '/explore', path: '/explore' },
  { label: 'Canvas', route: '/canvas', path: '/canvas' },
  { label: 'Settings', route: '/settings', path: '/settings' },
];

export function NavHeader({ title, right }: { title: string; right?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <>
      <View style={styles.headerContainer}>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => setOpen(!open)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Close menu' : 'Open menu'}>
          <Text style={styles.arrowIcon}>{open ? '▼' : '▶'}</Text>
          <Text style={styles.headerTitle}>{title}</Text>
        </TouchableOpacity>
        {right}
      </View>

      {open && (
        <View style={styles.dropdownMenu}>
          {PAGES.map((p, i) => {
            const active = pathname === p.path;
            return (
              <View key={p.path}>
                {i > 0 && <View style={styles.divider} />}
                <TouchableOpacity
                  style={[styles.dropdownItem, active && styles.activeDropdownItem]}
                  onPress={() => {
                    setOpen(false);
                    if (!active) router.navigate(p.route);
                  }}>
                  <Text style={[styles.dropdownText, active && styles.activeDropdownText]}>{p.label}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', zIndex: 20 },
  menuButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingRight: 12 },
  arrowIcon: { fontSize: 16, color: '#111827', width: 22 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginLeft: 6 },
  dropdownMenu: { position: 'absolute', top: Platform.OS === 'android' ? 56 : 60, left: 16, width: 200, backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 10, elevation: 8, borderWidth: 1, borderColor: '#E5E7EB', zIndex: 30 },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 16 },
  activeDropdownItem: { backgroundColor: '#EFF6FF' },
  dropdownText: { fontSize: 16, fontWeight: '500', color: '#374151' },
  activeDropdownText: { color: '#2563EB', fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginHorizontal: 12 },
});
