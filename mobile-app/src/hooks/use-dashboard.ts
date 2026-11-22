/**
 * Loads /api/dashboard, refreshes when the app comes back to the foreground,
 * and hands the result to the notification logic.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { api, Dashboard, errorText } from '@/lib/api';
import { processDashboard } from '@/lib/notifications';

const STALE_MS = 60_000;

export function useDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastLoad = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async (manual = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (manual) setRefreshing(true);
    try {
      const d = await api.dashboard();
      setData(d);
      setError(null);
      lastLoad.current = Date.now();
      processDashboard(d).catch(() => {});
    } catch (e) {
      setError(errorText(e));
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload when this screen gets focus (e.g. after changing Settings) if data is stale.
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoad.current > STALE_MS) load();
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastLoad.current > STALE_MS) load();
    });
    return () => sub.remove();
  }, [load]);

  return { data, error, loading, refreshing, refresh: () => load(true) };
}
