import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { FileText, Play } from 'lucide-react';
import { TASKS, type ModelStatus, type RoutePreference, type TaskId } from '@/core';
import { BorderBeam } from '@/components/vendor/border-beam';
import { cn } from '@/lib/utils';
import type { AppMode } from '../useModels';
import { ROUTE_OPTIONS, TASK_IDS } from '../ui-constants';
import { SAMPLES, type SampleItem } from '../samples';

export interface ControlsProps {
  mode: AppMode;
  task: TaskId;
  setTask: (task: TaskId) => void;
  preference: RoutePreference;
  setPreference: (pref: RoutePreference) => void;
  taskSelectId: string;
  sampleMenuOpen: boolean;
  setSampleMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  sampleMenuRef: RefObject<HTMLDivElement | null>;
  onSelectSample: (sample: SampleItem) => void;
  deviceStatus: ModelStatus;
  prepareDevice: () => void;
  isRunning: boolean;
  onRun: () => void;
  simulateNanoUnavailable: boolean;
  setSimulateNanoUnavailable: (next: boolean) => void;
}

function menuItems(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

function focusMenuItem(container: HTMLElement | null, index: number) {
  const items = menuItems(container);
  if (items.length === 0) return;
  const wrapped = ((index % items.length) + items.length) % items.length;
  items[wrapped]?.focus();
}

export function Controls({
  mode,
  task,
  setTask,
  preference,
  setPreference,
  taskSelectId,
  sampleMenuOpen,
  setSampleMenuOpen,
  sampleMenuRef,
  onSelectSample,
  deviceStatus,
  prepareDevice,
  isRunning,
  onRun,
  simulateNanoUnavailable,
  setSimulateNanoUnavailable,
}: ControlsProps) {
  const sampleButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);

  const closeSampleMenu = useCallback(
    (returnFocus = true) => {
      setSampleMenuOpen(false);
      if (returnFocus) {
        sampleButtonRef.current?.focus();
      }
    },
    [setSampleMenuOpen],
  );

  const handleSelectSample = (sample: SampleItem) => {
    onSelectSample(sample);
    closeSampleMenu(true);
  };

  useLayoutEffect(() => {
    if (sampleMenuOpen) {
      focusMenuItem(menuPanelRef.current, 0);
    }
  }, [sampleMenuOpen]);

  useEffect(() => {
    if (isRunning && sampleMenuOpen) {
      closeSampleMenu(false);
    }
  }, [isRunning, sampleMenuOpen, closeSampleMenu]);

  useEffect(() => {
    if (!sampleMenuOpen) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSampleMenu(true);
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(event.target as Node)) {
        closeSampleMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [sampleMenuOpen, sampleMenuRef, closeSampleMenu]);

  const handleSampleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const container = menuPanelRef.current;
    const items = menuItems(container);
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusMenuItem(container, currentIndex < 0 ? 0 : currentIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusMenuItem(container, currentIndex < 0 ? items.length - 1 : currentIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusMenuItem(container, 0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusMenuItem(container, items.length - 1);
    }
  };

  return (
    <section
      aria-label="Pipeline controls"
      className="flex flex-col gap-3 border-b border-ink py-3.5 lg:flex-row lg:items-center lg:justify-between"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={taskSelectId} className="text-sm font-semibold text-ink">
            Task
          </label>
          <select
            id={taskSelectId}
            aria-label="Task"
            disabled={isRunning}
            value={task}
            onChange={e => setTask(e.target.value as TaskId)}
            className="border border-ink bg-fog px-3 py-1.5 text-sm font-medium text-ink disabled:cursor-wait disabled:opacity-60"
          >
            {TASK_IDS.map(id => (
              <option key={id} value={id}>
                {TASKS[id].description}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink">Route</span>
          <div
            role="group"
            aria-label="Route"
            className="inline-flex flex-wrap border border-ink bg-fog"
          >
            {ROUTE_OPTIONS.map((opt, idx) => {
              const selected = preference === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isRunning}
                  aria-pressed={selected}
                  onClick={() => setPreference(opt.value)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm',
                    idx > 0 && 'border-l border-ink',
                    selected ? 'bg-ink text-fog' : 'bg-fog text-ink hover:bg-ink/10',
                    'disabled:cursor-wait disabled:opacity-60',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div ref={sampleMenuRef} className="relative">
          <button
            ref={sampleButtonRef}
            type="button"
            disabled={isRunning}
            aria-expanded={sampleMenuOpen}
            aria-haspopup="menu"
            onClick={() => setSampleMenuOpen(prev => !prev)}
            className="inline-flex items-center gap-1.5 border border-ink bg-fog px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/10 disabled:cursor-wait disabled:opacity-60 sm:text-sm"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Use sample
          </button>

          {sampleMenuOpen && (
            <div
              ref={menuPanelRef}
              role="menu"
              aria-label="Sample texts"
              onKeyDown={handleSampleMenuKeyDown}
              className="absolute left-0 z-30 mt-1 w-48 border border-ink bg-fog py-1 shadow-none"
            >
              {SAMPLES.map(sample => (
                <button
                  key={sample.id}
                  type="button"
                  role="menuitem"
                  disabled={isRunning}
                  onClick={() => handleSelectSample(sample)}
                  className="block w-full px-3 py-1.5 text-left text-sm font-medium text-ink hover:bg-device-sage disabled:cursor-wait disabled:opacity-60"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {deviceStatus.state === 'needs-download' && (
          <button
            type="button"
            onClick={() => prepareDevice()}
            className="border border-ink bg-marker-amber px-3 py-1.5 text-xs font-semibold text-ink hover:bg-marker-amber/80 sm:text-sm"
          >
            Prepare Gemini Nano
          </button>
        )}

        {mode === 'simulated' && (
          <label className="inline-flex cursor-pointer items-center gap-2 border border-ink bg-fog px-3 py-1.5 text-xs font-medium text-ink sm:text-sm">
            <input
              type="checkbox"
              data-testid="simulate-nano-unavailable"
              checked={simulateNanoUnavailable}
              disabled={isRunning}
              onChange={e => setSimulateNanoUnavailable(e.target.checked)}
              className="h-3.5 w-3.5 border-ink accent-boundary-blue"
            />
            Simulate Gemini Nano unavailable
          </label>
        )}
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          disabled={isRunning}
          onClick={() => void onRun()}
          className="relative inline-flex items-center justify-center gap-2 overflow-hidden border border-boundary-blue bg-boundary-blue px-5 py-2 text-sm font-semibold text-fog hover:bg-boundary-blue/90 disabled:cursor-wait disabled:opacity-80"
        >
          <Play className="h-4 w-4 fill-current" aria-hidden="true" />
          <span>Run</span>
          {isRunning && <BorderBeam size={48} duration={2.5} colorFrom="#F4C04E" colorTo="#EDF0F3" />}
        </button>
      </div>
    </section>
  );
}