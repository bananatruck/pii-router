import { useCallback, useEffect, useMemo, useState } from 'react';
import { FakeModel, type ModelClient, type ModelStatus } from '@/core';
import { createLiveModels } from '@/models';

export type AppMode = 'live' | 'simulated';

export interface LiveModelSet {
  device: ModelClient;
  cloud: ModelClient | null;
  liveReason: string | null;
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
  const live = useMemo<LiveModelSet>(
    () => options?.liveModels ?? createLiveModels(),
    [options?.liveModels],
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
