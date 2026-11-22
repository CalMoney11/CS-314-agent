/**
 * Background refresh. iOS decides when this runs (typically every 15 min to a
 * few hours, more often when the phone is charging on Wi-Fi). Must be imported
 * at app start so the task is defined in global scope.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { api } from './api';
import { getConfig, isConfigured } from './config';
import { processDashboard } from './notifications';

export const REFRESH_TASK = 'dashboard-refresh';

TaskManager.defineTask(REFRESH_TASK, async () => {
  try {
    if (!isConfigured(await getConfig())) return BackgroundTask.BackgroundTaskResult.Success;
    await processDashboard(await api.dashboard());
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundRefresh(): Promise<string> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    return 'Background App Refresh is off for this app (iPhone Settings → General → Background App Refresh).';
  }
  if (!(await TaskManager.isTaskRegisteredAsync(REFRESH_TASK))) {
    await BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: 15 });
  }
  return 'On. iOS decides exact timing (often every 15–60 min).';
}
