/**
 * Fixed HUD compass: the rose rotates so that north stays aligned with world +Z.
 * viewerAzimuthRad = atan2(cam.x - target.x, cam.z - target.z) as produced by CompassAzimuthBridge.
 */
export type NorthCompassHudProps = {
  viewerAzimuthRad: number;
};

export function NorthCompassHud({ viewerAzimuthRad }: NorthCompassHudProps) {
  const deg = (-viewerAzimuthRad * 180) / Math.PI;

  return (
    <div
      className="pointer-events-none absolute bottom-6 right-6 z-[500] flex h-24 w-24 flex-col items-center justify-center rounded-full border-2 border-slate-600/80 bg-background/85 shadow-lg backdrop-blur-sm"
      aria-hidden
    >
      <div
        className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full border border-slate-400/70 bg-slate-100/90"
        style={{ transform: `rotate(${deg}deg)` }}
      >
        <span className="absolute top-0 text-[9px] font-semibold text-red-700">N</span>
        <span className="absolute bottom-0 text-[8px] text-slate-500">S</span>
        <span className="absolute left-0 text-[8px] text-slate-500">W</span>
        <span className="absolute right-0 text-[8px] text-slate-500">E</span>
        <div className="h-8 w-0.5 rounded-full bg-red-600" title="Nord" />
      </div>
      <span className="mt-1 text-[10px] text-muted-foreground">Nord</span>
    </div>
  );
}
