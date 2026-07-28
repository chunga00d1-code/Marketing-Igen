import type { ShotstackSyncSummary } from '../../../types/video-template';

export function canManageShotstackTemplates(role?: string): boolean {
  return role === 'admin' || role === 'superadmin';
}

interface RunShotstackTemplateSyncDependencies {
  sync: () => Promise<ShotstackSyncSummary>;
  refreshCatalogue: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setSyncing: (value: boolean) => void;
  onSuccess: (summary: ShotstackSyncSummary) => void;
  onError: (message: string) => void;
}

export async function runShotstackTemplateSync({
  sync,
  refreshCatalogue,
  refreshStatus,
  setSyncing,
  onSuccess,
  onError,
}: RunShotstackTemplateSyncDependencies): Promise<ShotstackSyncSummary | null> {
  setSyncing(true);
  try {
    const summary = await sync();
    await refreshCatalogue();
    await refreshStatus();
    onSuccess(summary);
    return summary;
  } catch (error: unknown) {
    onError(error instanceof Error ? error.message : 'Không thể đồng bộ thư viện mẫu Shotstack.');
    return null;
  } finally {
    setSyncing(false);
  }
}
