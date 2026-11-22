/**
 * SCREEN: Settings — server connection, notification preferences, and status.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NavHeader } from '@/components/nav-header';
import { api, errorText } from '@/lib/api';
import { registerBackgroundRefresh } from '@/lib/background';
import { getConfig, saveConfig } from '@/lib/config';
import { ensurePermission, getPrefs, NotificationPrefs, processDashboard, sendTestNotification, setPrefs } from '@/lib/notifications';

export default function SettingsScreen() {
  const [serverUrl, setServerUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [prefs, setPrefsState] = useState<NotificationPrefs>({ emails: true, canvas: true });
  const [notifAllowed, setNotifAllowed] = useState<boolean | null>(null);
  const [bgStatus, setBgStatus] = useState('');

  useEffect(() => {
    getConfig().then((c) => {
      setServerUrl(c.serverUrl);
      setApiToken(c.apiToken);
    });
    getPrefs().then(setPrefsState);
    ensurePermission(false).then(setNotifAllowed);
    registerBackgroundRefresh().then(setBgStatus).catch((e) => setBgStatus(errorText(e)));
  }, []);

  const saveAndTest = async () => {
    setTesting(true);
    setStatus(null);
    try {
      await saveConfig({ serverUrl, apiToken });
      await api.health();
      const d = await api.dashboard();
      const problems = Object.entries(d.errors);
      setStatus(
        problems.length === 0
          ? { ok: true, text: `Connected. ${d.emails.length} emails, ${d.events.length} events, ${d.canvas.length} Canvas items.` }
          : { ok: false, text: `Connected, but:\n${problems.map(([k, v]) => `• ${k}: ${v}`).join('\n')}` },
      );
      processDashboard(d).catch(() => {});
    } catch (e) {
      setStatus({ ok: false, text: errorText(e) });
    } finally {
      setTesting(false);
    }
  };

  const updatePrefs = async (next: NotificationPrefs) => {
    setPrefsState(next);
    await setPrefs(next);
    if (next.emails || next.canvas) setNotifAllowed(await ensurePermission(true));
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <NavHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.box}>
          <Text style={styles.boxTitle}>Server</Text>
          <Text style={styles.label}>Server URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="https://cs314-agent-api-xxxx.run.app"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.label}>API token</Text>
          <TextInput
            style={styles.input}
            value={apiToken}
            onChangeText={setApiToken}
            placeholder="APP_API_TOKEN from the server's .env"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={saveAndTest} disabled={testing}>
            {testing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryBtnText}>Save & Test</Text>}
          </TouchableOpacity>
          {status && <Text style={[styles.status, status.ok ? styles.ok : styles.bad]}>{status.text}</Text>}
        </View>

        <View style={styles.box}>
          <Text style={styles.boxTitle}>Notifications</Text>
          <Row label="New emails" value={prefs.emails} onChange={(v) => updatePrefs({ ...prefs, emails: v })} />
          <Row label="Canvas deadlines (24h and 2h before)" value={prefs.canvas} onChange={(v) => updatePrefs({ ...prefs, canvas: v })} />
          {notifAllowed === false && (
            <Text style={styles.bad}>Notifications are blocked. Turn them on in iPhone Settings → Notifications.</Text>
          )}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={async () => {
              if (await ensurePermission(true)) {
                setNotifAllowed(true);
                await sendTestNotification();
              } else setNotifAllowed(false);
            }}>
            <Text style={styles.secondaryBtnText}>Send test notification</Text>
          </TouchableOpacity>
          <Text style={styles.help}>Background refresh: {bgStatus || 'checking…'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: 16, gap: 16, paddingBottom: 60 },
  box: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#E5E7EB', gap: 10 },
  boxTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  label: { fontSize: 13, fontWeight: '600', color: '#4B5563' },
  input: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' },
  primaryBtn: { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { backgroundColor: '#EFF6FF', borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2563EB' },
  secondaryBtnText: { color: '#2563EB', fontWeight: '600', fontSize: 14 },
  status: { fontSize: 13 },
  ok: { color: '#059669' },
  bad: { color: '#DC2626', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 15, color: '#374151', flex: 1, marginRight: 12 },
  help: { fontSize: 12, color: '#6B7280' },
});
