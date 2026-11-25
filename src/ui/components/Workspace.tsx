import type { RefObject } from 'react';
import { AnimatedBeam } from '@/components/vendor/animated-beam';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { CloudPane, type CloudPaneProps } from './CloudPane';
import { DevicePane, type DevicePaneProps } from './DevicePane';

export interface WorkspaceProps {
  workspaceRef: RefObject<HTMLDivElement | null>;
  deviceAnchorRef: RefObject<HTMLDivElement | null>;
  cloudAnchorRef: RefObject<HTMLDivElement | null>;
  payloadCrossed: boolean;
  payloadCrossedSimulated: boolean;
  device: Omit<DevicePaneProps, 'deviceAnchorRef'>;
  cloud: Omit<CloudPaneProps, 'cloudAnchorRef'>;
}

export function Workspace({
  workspaceRef,
  deviceAnchorRef,
  cloudAnchorRef,
  payloadCrossed,
  payloadCrossedSimulated,
  device,
  cloud,
}: WorkspaceProps) {
  const wideLayout = useMediaQuery('(min-width: 768px)');

  const crossedLabelDesktop = payloadCrossedSimulated
    ? 'redacted payload passed to the simulated cloud'
    : 'redacted payload crossed →';
  const crossedLabelMobile = payloadCrossedSimulated
    ? 'redacted payload passed to the simulated cloud'
  : 'redacted payload crossed ↓';

  return (
    <div ref={workspaceRef} className="relative">
      <div className="hidden md:flex md:items-center md:justify-center">
        <div className="flex w-full items-center">
          <div className="h-px flex-1 bg-ink/30" />
          <span className="border border-boundary-blue bg-boundary-blue px-3 py-0.5 text-xs font-semibold text-fog">
            Trust boundary
          </span>
          {payloadCrossed && (
            <span
              data-testid="payload-crossed-tag"
              className="border border-boundary-blue bg-fog px-2 py-0.5 font-mono text-[11px] font-semibold text-boundary-blue"
            >
              {crossedLabelDesktop}
            </span>
          )}
          <div className="h-px flex-1 bg-ink/30" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_3px_minmax(0,1fr)]">
        <DevicePane {...device} deviceAnchorRef={deviceAnchorRef} />

        <div className="relative flex items-center justify-center bg-boundary-blue py-1.5 md:py-0">
          <span className="border border-fog bg-boundary-blue px-2.5 py-0.5 text-xs font-semibold text-fog md:hidden">
            Trust boundary
          </span>
          {payloadCrossed && (
            <span
              data-testid="payload-crossed-tag-mobile"
              className="z-10 border border-fog bg-boundary-blue px-2 py-0.5 font-mono text-[11px] font-semibold text-fog md:hidden"
            >
              {crossedLabelMobile}
            </span>
          )}
        </div>

        <CloudPane {...cloud} cloudAnchorRef={cloudAnchorRef} />
      </div>

      {payloadCrossed && wideLayout && (
        <AnimatedBeam
          containerRef={workspaceRef}
          fromRef={deviceAnchorRef}
          toRef={cloudAnchorRef}
          pathColor="#2B59E8"
          gradientStartColor="#2B59E8"
          gradientStopColor="#18202B"
          pathWidth={3}
        />
      )}
    </div>
  );
}