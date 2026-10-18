import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { Btn, T } from './controls';
import { InfoRow } from './page';

type UpdateState = {
  status: 'disabled' | 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
  currentVersion: string;
  version?: string;
  percent?: number;
  message?: string;
};

type UpdaterBridge = {
  getState: () => Promise<UpdateState | null>;
  check: () => Promise<UpdateState | null>;
  install: () => Promise<boolean>;
  onState: (callback: (state: UpdateState) => void) => () => void;
};

// Present only inside the Windows desktop app (exposed by electron/preload.cjs).
function getBridge(): UpdaterBridge | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as { murlidharUpdater?: UpdaterBridge }).murlidharUpdater ?? null;
}

function describe(state: UpdateState): string {
  switch (state.status) {
    case 'checking':
      return 'Checking for updates…';
    case 'available':
      return `Version ${state.version} found. Starting download…`;
    case 'downloading':
      return `Downloading version ${state.version}: ${state.percent ?? 0}%`;
    case 'downloaded':
      return `Version ${state.version} is ready to install.`;
    case 'up-to-date':
      return 'You have the latest version.';
    case 'error':
      return state.message ?? 'The update could not be completed.';
    case 'disabled':
      return state.message ?? 'Updates are disabled in this build.';
    default:
      return 'No update check has run yet.';
  }
}

/** Update status and the manual "Check for updates" action. Renders nothing outside the desktop app. */
export function AppUpdater() {
  const bridge = getBridge();
  const [state, setState] = useState<UpdateState | null>(null);

  useEffect(() => {
    if (!bridge) return;
    let live = true;
    bridge.getState().then((next) => live && next && setState(next)).catch(() => undefined);
    const stop = bridge.onState((next) => live && setState(next));
    return () => {
      live = false;
      stop();
    };
  }, [bridge]);

  if (!bridge || !state) return null;

  const busy = state.status === 'checking' || state.status === 'downloading';
  return (
    <View style={{ marginTop: 8 }}>
      <InfoRow label="Update status" value={describe(state)} />
      <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {state.status === 'downloaded' ? (
          <Btn title="Restart and install" onPress={() => void bridge.install()} />
        ) : (
          <Btn
            title={busy ? 'Please wait…' : 'Check for updates'}
            variant="secondary"
            disabled={busy || state.status === 'disabled'}
            onPress={() => void bridge.check()}
          />
        )}
        {state.status === 'error' ? <T size={13} muted>Your data is not affected.</T> : null}
      </View>
    </View>
  );
}
