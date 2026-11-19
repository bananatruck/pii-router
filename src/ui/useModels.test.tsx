// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { FakeModel, type ModelClient, type ModelStatus } from '@/core';
import { useModels } from './useModels';

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('ignores a status request from an earlier selection of the same device', async () => {
  let finishStatus: (status: ModelStatus) => void = () => {};
  const oldStatus = new Promise<ModelStatus>(resolve => { finishStatus = resolve; });
  const status = vi.fn<() => Promise<ModelStatus>>().mockResolvedValue({ state: 'ready' });
  const fake = new FakeModel({ location: 'device' });
  const device: ModelClient = {
    location: 'device', simulated: false, label: 'Test device', status,
    prepare: progress => fake.prepare(progress), generate: request => fake.generate(request),
  };
  const liveModels = { device, cloud: null, liveReason: null };
  const { result } = renderHook(() => useModels({ liveModels }));
  await waitFor(() => expect(result.current.deviceStatus.state).toBe('ready'));
  status.mockImplementationOnce(() => oldStatus);
  const pending = result.current.refreshStatus();
  await act(async () => { result.current.setMode('simulated'); });
  await act(async () => { result.current.setMode('live'); });
  await waitFor(() => expect(result.current.deviceStatus.state).toBe('ready'));
  await act(async () => {
    finishStatus({ state: 'unavailable', reason: 'Earlier selection' });
    await pending;
  });
  expect(result.current.deviceStatus.state).toBe('ready');
});

it.each(['resolve', 'reject'])('lets a slow status poll %s after multiple polling intervals', async settlement => {
  vi.useFakeTimers();
  const slowRead = deferred<ModelStatus>();
  const status = vi.fn<() => Promise<ModelStatus>>()
    .mockResolvedValue({ state: 'downloading' })
    .mockResolvedValueOnce({ state: 'downloading' })
    .mockImplementationOnce(() => slowRead.promise);
  const fake = new FakeModel({ location: 'device' });
  const device: ModelClient = {
    location: 'device', simulated: false, label: 'Test device', status,
    prepare: progress => fake.prepare(progress), generate: request => fake.generate(request),
  };
  const { result } = renderHook(() => useModels({ liveModels: { device, cloud: null, liveReason: null } }));
  await act(async () => {});
  expect(result.current.deviceStatus.state).toBe('downloading');
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  await act(async () => {
    if (settlement === 'resolve') slowRead.resolve({ state: 'ready' });
    else slowRead.reject(new Error('Status unavailable'));
  });
  expect(result.current.deviceStatus.state).toBe(settlement === 'resolve' ? 'ready' : 'unavailable');
  expect(status).toHaveBeenCalledTimes(2);
});

it.each(['resolve', 'reject'])('keeps preparation progress and %s callbacks active after polling', async settlement => {
  vi.useFakeTimers();
  const preparation = deferred<void>();
  let onProgress: (fraction: number) => void = () => {};
  const status = vi.fn<() => Promise<ModelStatus>>().mockResolvedValue({ state: 'needs-download' });
  const fake = new FakeModel({ location: 'device' });
  const device: ModelClient = {
    location: 'device', simulated: false, label: 'Test device', status,
    prepare: progress => {
      onProgress = fraction => progress?.(fraction);
      onProgress(0.1);
      return preparation.promise;
    },
    generate: request => fake.generate(request),
  };
  const { result } = renderHook(() => useModels({ liveModels: { device, cloud: null, liveReason: null } }));
  await act(async () => {});
  status.mockResolvedValue({ state: 'downloading', fraction: 0.1 });
  act(() => { result.current.prepareDevice(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(status).toHaveBeenCalledTimes(2);
  act(() => { onProgress(0.75); });
  expect(result.current.deviceStatus).toEqual({ state: 'downloading', fraction: 0.75 });
  const finalStatus: ModelStatus = settlement === 'resolve'
    ? { state: 'ready' }
    : { state: 'unavailable', reason: 'Preparation failed' };
  status.mockResolvedValue(finalStatus);
  await act(async () => {
    if (settlement === 'resolve') preparation.resolve();
    else preparation.reject(new Error('Preparation failed'));
  });
  expect(status).toHaveBeenCalledTimes(3);
  expect(result.current.deviceStatus).toEqual(finalStatus);
});

it('refreshes after preparation without reusing a poll started before completion', async () => {
  vi.useFakeTimers();
  const preparation = deferred<void>();
  const slowRead = deferred<ModelStatus>();
  const status = vi.fn<() => Promise<ModelStatus>>()
    .mockResolvedValue({ state: 'ready' })
    .mockResolvedValueOnce({ state: 'needs-download' })
    .mockImplementationOnce(() => slowRead.promise);
  const fake = new FakeModel({ location: 'device' });
  const device: ModelClient = {
    location: 'device', simulated: false, label: 'Test device', status,
    prepare: progress => { progress?.(0.1); return preparation.promise; },
    generate: request => fake.generate(request),
  };
  const { result } = renderHook(() => useModels({ liveModels: { device, cloud: null, liveReason: null } }));
  await act(async () => {});
  act(() => { result.current.prepareDevice(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await act(async () => { preparation.resolve(); });
  expect(result.current.deviceStatus.state).toBe('ready');
  await act(async () => { slowRead.resolve({ state: 'downloading', fraction: 0.1 }); });
  expect(result.current.deviceStatus.state).toBe('ready');
});

it.each(['selection', 'preparation'])('ignores callbacks from preparation superseded by a newer %s', async supersededBy => {
  const oldPreparation = deferred<void>();
  let oldProgress: (fraction: number) => void = () => {};
  const status = vi.fn<() => Promise<ModelStatus>>().mockResolvedValue({ state: 'ready' });
  const fake = new FakeModel({ location: 'device' });
  const prepare = vi.fn<ModelClient['prepare']>()
    .mockResolvedValue(undefined)
    .mockImplementationOnce(progress => {
      oldProgress = fraction => progress?.(fraction);
      return oldPreparation.promise;
    });
  const device: ModelClient = {
    location: 'device', simulated: false, label: 'Test device', status, prepare,
    generate: request => fake.generate(request),
  };
  const { result } = renderHook(() => useModels({ liveModels: { device, cloud: null, liveReason: null } }));
  await act(async () => {});
  act(() => { result.current.prepareDevice(); });
  if (supersededBy === 'selection') {
    await act(async () => { result.current.setMode('simulated'); });
    await act(async () => { result.current.setMode('live'); });
  } else {
    await act(async () => { result.current.prepareDevice(); });
  }
  const reads = status.mock.calls.length;
  act(() => { oldProgress(0.25); });
  expect(result.current.deviceStatus.state).toBe('ready');
  await act(async () => { oldPreparation.resolve(); });
  expect(result.current.deviceStatus.state).toBe('ready');
  expect(status).toHaveBeenCalledTimes(reads);
});
