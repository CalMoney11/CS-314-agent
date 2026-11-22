/**
 * SCREEN: Email detail. Opened from the home screen with ?account=&id=.
 * Read-only; "Open in Gmail" hands off to the Gmail app or website.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorNote } from '@/components/error-note';
import { api, EmailDetail, errorText } from '@/lib/api';
import { formatLongDate, formatTime } from '@/lib/dates';

export default function EmailScreen() {
  const router = useRouter();
  const { account, id } = useLocalSearchParams<{ account?: string; id?: string }>();
  const key = account && id ? `${account}/${id}` : '';
  const [result, setResult] = useState<{ key: string; email?: EmailDetail; error?: string } | null>(null);

  useEffect(() => {
    if (!account || !id) return;
    let cancelled = false;
    const k = `${account}/${id}`;
    api.email(account, id)
      .then((e) => !cancelled && setResult({ key: k, email: e }))
      .catch((e) => !cancelled && setResult({ key: k, error: errorText(e) }));
    return () => {
      cancelled = true;
    };
  }, [account, id]);

  const current = result?.key === key ? result : null;
  const email = current?.email ?? null;
  const error = !key ? 'No email selected.' : current?.error ?? null;

  const openInGmail = () => {
    if (email) Linking.openURL(email.web_url);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} accessibilityLabel="Back">
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        {email && (
          <TouchableOpacity onPress={openInGmail}>
            <Text style={styles.link}>Open in Gmail</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {!email && !error && <ActivityIndicator style={{ marginTop: 40 }} />}
        {error && <ErrorNote message={error} />}
        {email && (
          <>
            <Text style={styles.subject} selectable>{email.subject}</Text>
            <View style={styles.metaBox}>
              <Text style={styles.from} selectable>{email.from_name}</Text>
              <Text style={styles.meta} selectable>{email.from_email}</Text>
              {email.to ? <Text style={styles.meta} numberOfLines={2}>To: {email.to}</Text> : null}
              {email.date && (
                <Text style={styles.meta}>{formatLongDate(new Date(email.date))} at {formatTime(email.date)}</Text>
              )}
            </View>
            <Text style={styles.body} selectable>{email.body || email.snippet}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  back: { fontSize: 17, color: '#2563EB', fontWeight: '600' },
  link: { fontSize: 15, color: '#2563EB', fontWeight: '600' },
  content: { padding: 16, gap: 14, paddingBottom: 60 },
  subject: { fontSize: 20, fontWeight: '700', color: '#111827' },
  metaBox: { gap: 2, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  from: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
  meta: { fontSize: 13, color: '#6B7280' },
  body: { fontSize: 15, lineHeight: 22, color: '#1F2937' },
});
