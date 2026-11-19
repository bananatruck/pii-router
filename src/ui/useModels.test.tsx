// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { FakeModel, type ModelClient, type ModelStatus } from '@/core';
import { useModels } from './useModels';

afterEach(cleanup);

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
