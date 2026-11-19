import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  running?: boolean;
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
  const running = options?.running ?? false;
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

  const userPickedModeRef = useRef(userPickedMode);
  const runningRef = useRef(running);

  useEffect(() => {
    userPickedModeRef.current = userPickedMode;
    runningRef.current = running;
  }, [userPickedMode, running]);

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
        // Switch to Live only if the user has not chosen a mode and no run is in flight; the app
        // starts in Simulated while this import is pending, so the current mode is not a condition.
        if (set.liveReason === null && !userPickedModeRef.current && !runningRef.current) {
          setModeState('live');
        }
      })
      .catch(() => {
        if (!cancelled) setLoadedLive(unavailableLiveSet('Firebase AI Logic could not be loaded.'));
      });
    return () => {
      cancelled = true;
    };
  }, [injected, configProblem]);

  const activeMode: AppMode = live.liveReason !== null && mode === 'live' ? 'simulated' : mode;
  const device = activeMode === 'live' ? live.device : simulated.device;
  const cloud = activeMode === 'live' ? live.cloud : simulated.cloud;

  const activeDeviceRef = useRef(device);
  const statusGenerationRef = useRef(0);
  const pendingStatusRef = useRef<{
    generation: number;
    promise: Promise<ModelStatus>;
  } | null>(null);

  useEffect(() => {
    activeDeviceRef.current = device;
    statusGenerationRef.current += 1;
    return () => { statusGenerationRef.current += 1; };
  }, [device]);

  const [deviceStatus, setDeviceStatus] = useState<ModelStatus>(() =>
    activeMode === 'simulated'
      ? { state: 'ready' }
      : { state: 'unavailable', reason: live.liveReason ?? 'Checking model status.' },
  );

  const writeStatusIfCurrent = useCallback((client: ModelClient, generation: number, next: ModelStatus) => {
    if (client === activeDeviceRef.current && generation === statusGenerationRef.current) {
      setDeviceStatus(next);
    }
  }, []);

  const refreshStatus = useCallback(async (): Promise<ModelStatus> => {
    // Share a pending read, so polling cannot supersede a slow availability check forever.
    const pending = pendingStatusRef.current;
    if (pending?.generation === statusGenerationRef.current) return pending.promise;
    const client = activeDeviceRef.current;
    const generation = ++statusGenerationRef.current;
    const promise = (async () => {
      try {
        const next = await client.status();
        writeStatusIfCurrent(client, generation, next);
        return next;
      } catch {
        const fallback: ModelStatus = {
          state: 'unavailable',
          reason: 'Could not read on-device model status.',
        };
        writeStatusIfCurrent(client, generation, fallback);
        return fallback;
      }
    })();
    pendingStatusRef.current = { generation, promise };
    try {
      return await promise;
    } finally {
      if (pendingStatusRef.current?.generation === generation) pendingStatusRef.current = null;
    }
  }, [writeStatusIfCurrent]);

  const setMode = useCallback(
    (next: AppMode) => {
      if (runningRef.current) {
        return;
      }
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
    void refreshStatus();
  }, [device, refreshStatus]);

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
    const client = activeDeviceRef.current;
    const generation = ++statusGenerationRef.current;
    const promise = client.prepare((fraction: number) => {
      writeStatusIfCurrent(client, generation, { state: 'downloading', fraction });
    });
    void promise
      .then(() => {
        if (client === activeDeviceRef.current && generation === statusGenerationRef.current) void refreshStatus();
      })
      .catch(() => {
        if (client === activeDeviceRef.current && generation === statusGenerationRef.current) void refreshStatus();
      });
  }, [refreshStatus, writeStatusIfCurrent]);

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
