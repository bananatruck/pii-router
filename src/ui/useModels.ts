import { useCallback, useEffect, useMemo, useState } from 'react';
import { FakeModel, type ModelClient, type ModelStatus } from '@/core';
import { liveConfigProblem } from '@/models/live-config';

export type AppMode = 'live' | 'simulated';

export interface LiveModelSet {
  device: ModelClient;
  cloud: ModelClient | null;
  liveReason: string | null;
}

/** Stand-in for live models that cannot run; live mode is never selectable while liveReason is set. */
function unavailableLiveSet(reason: string): LiveModelSet {
  const fail = async (): Promise<never> => {
    throw new Error(reason);
  };
  return {
    device: {
      location: 'device',
      simulated: false,
      label: 'Gemini Nano (not loaded)',
      status: async () => ({ state: 'unavailable', reason }),
      prepare: fail,
      generate: fail,
    },
    cloud: null,
    liveReason: reason,
  };
}

export interface UseModelsOptions {
  liveModels?: LiveModelSet;
}

export interface UseModelsResult {
  mode: AppMode;
  setMode: (next: AppMode) => void;
  device: ModelClient;
  cloud: ModelClient | null;
  liveReason: string | null;
  deviceStatus: ModelStatus;
  prepareDevice: () => void;
  refreshStatus: () => Promise<ModelStatus>;
  simulateNanoUnavailable: boolean;
  setSimulateNanoUnavailable: (next: boolean) => void;
}

export function useModels(options?: UseModelsOptions): UseModelsResult {
  const injected = options?.liveModels;
  // Checked without the Firebase SDK. Only when live mode is possible is src/models (and the SDK)
  // loaded, so the simulated demo never downloads or runs Firebase code.
  const configProblem = useMemo(() => (injected ? null : liveConfigProblem()), [injected]);
  const [loadedLive, setLoadedLive] = useState<LiveModelSet | null>(null);
  const [userPickedMode, setUserPickedMode] = useState(false);

  const live = useMemo<LiveModelSet>(
    () =>
      injected ??
      loadedLive ??
      unavailableLiveSet(configProblem ?? 'Loading Firebase AI Logic.'),
    [injected, loadedLive, configProblem],
  );

  const [simulateNanoUnavailable, setSimulateNanoUnavailable] = useState(false);

  const simulated = useMemo(
    () => ({
      device: simulateNanoUnavailable
        ? new FakeModel({ location: 'device', behaviour: 'unavailable', latencyMs: 350 })
        : new FakeModel({ location: 'device', latencyMs: 350 }),
      cloud: new FakeModel({ location: 'cloud', latencyMs: 700 }),
    }),
    [simulateNanoUnavailable],
  );

  const [mode, setModeState] = useState<AppMode>(() =>
    live.liveReason === null ? 'live' : 'simulated',
  );

  useEffect(() => {
    if (injected || configProblem !== null) {
      return;
    }
    let cancelled = false;
    import('@/models')
      .then(models => {
        if (cancelled) return;
        const set = models.createLiveModels();
        setLoadedLive(set);
        if (set.liveReason === null && !userPickedMode) setModeState('live');
      })
      .catch(() => {
        if (!cancelled) setLoadedLive(unavailableLiveSet('Firebase AI Logic could not be loaded.'));
      });
    return () => {
      cancelled = true;
    };
    // userPickedMode is read once when the module arrives; it must not re-trigger the import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injected, configProblem]);

  const activeMode: AppMode = live.liveReason !== null && mode === 'live' ? 'simulated' : mode;
  const device = activeMode === 'live' ? live.device : simulated.device;
  const cloud = activeMode === 'live' ? live.cloud : simulated.cloud;

  const [deviceStatus, setDeviceStatus] = useState<ModelStatus>(() =>
    activeMode === 'simulated'
      ? { state: 'ready' }
      : { state: 'unavailable', reason: live.liveReason ?? 'Checking model status.' },
  );

  const refreshStatus = useCallback(async (): Promise<ModelStatus> => {
    try {
      const next = await device.status();
      setDeviceStatus(next);
      return next;
    } catch {
      const fallback: ModelStatus = {
        state: 'unavailable',
        reason: 'Could not read on-device model status.',
      };
      setDeviceStatus(fallback);
      return fallback;
    }
  }, [device]);

  const setMode = useCallback(
    (next: AppMode) => {
      if (next === 'live' && live.liveReason !== null) {
        return;
      }
      setUserPickedMode(true);
      setModeState(next);
    },
    [live.liveReason],
  );

  // Read device.status() on load and after mode changes.
  useEffect(() => {
    let cancelled = false;
    void device
      .status()
      .then(status => {
        if (!cancelled) {
          setDeviceStatus(status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDeviceStatus({
            state: 'unavailable',
            reason: 'Could not read on-device model status.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [device]);

  // Poll device.status() every 3 seconds only while it reports downloading.
  useEffect(() => {
    if (deviceStatus.state !== 'downloading') {
      return;
    }
    const timer = setInterval(() => {
      void refreshStatus();
    }, 3000);
    return () => {
      clearInterval(timer);
    };
  }, [deviceStatus.state, refreshStatus]);

  // Call device.prepare(onProgress) directly in the click handler to preserve the user gesture.
  const prepareDevice = useCallback(() => {
    const promise = device.prepare((fraction: number) => {
      setDeviceStatus({ state: 'downloading', fraction });
    });
    void promise
      .then(() => refreshStatus())
      .catch(() => refreshStatus());
  }, [device, refreshStatus]);

  return {
    mode: activeMode,
    setMode,
    device,
    cloud,
    liveReason: live.liveReason,
    deviceStatus,
    prepareDevice,
    refreshStatus,
    simulateNanoUnavailable,
    setSimulateNanoUnavailable,
  };
}
