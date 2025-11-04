import { useState, useEffect } from 'react';
import { profiler } from '@/lib/performance';
import { Button } from '@/components/ui/button';

export function PerformancePanel() {
  const [enabled, setEnabled] = useState(profiler.isEnabled());
  const [stats, setStats] = useState(profiler.getAllStats());
  const [fps, setFps] = useState(profiler.getFPS());

  useEffect(() => {
    profiler.setEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      profiler.updateFrame();
      setStats(profiler.getAllStats());
      setFps(profiler.getFPS());
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [enabled]);

  const handleReset = () => {
    profiler.reset();
    setStats([]);
    setFps(0);
  };

  const handleExport = () => {
    const data = profiler.exportJSON();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance-metrics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!enabled && stats.length === 0) {
    return (
      <div className="absolute bottom-4 right-4 z-[2000]">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEnabled(true)}
          className="bg-background/95 backdrop-blur-sm"
        >
          📊 Enable Performance Profiling
        </Button>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 z-[2000] bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg p-4 max-w-2xl max-h-[80vh] overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Performance Metrics</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleReset}>
            Reset
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport}>
            Export JSON
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEnabled(false)}>
            Close
          </Button>
        </div>
      </div>

      <div className="mb-3 text-xs text-muted-foreground">
        FPS: <span className="font-mono">{fps}</span> | Press Ctrl+P to toggle
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Operation</th>
              <th className="text-right p-2">Avg (ms)</th>
              <th className="text-right p-2">Min (ms)</th>
              <th className="text-right p-2">Max (ms)</th>
              <th className="text-right p-2">Median (ms)</th>
              <th className="text-right p-2">Calls</th>
              <th className="text-right p-2">Calls/s</th>
              <th className="text-right p-2">Avg Elements</th>
              <th className="text-right p-2">Avg Dataset</th>
            </tr>
          </thead>
          <tbody>
            {stats.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center p-4 text-muted-foreground">
                  No metrics collected yet
                </td>
              </tr>
            ) : (
              stats.map((stat) => {
                if (!stat) return null;
                return (
                  <tr key={stat.name} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-mono">{stat.name}</td>
                    <td className="text-right p-2 font-mono">{stat.avgTime.toFixed(3)}</td>
                    <td className="text-right p-2 font-mono">{stat.minTime.toFixed(3)}</td>
                    <td className="text-right p-2 font-mono">{stat.maxTime.toFixed(3)}</td>
                    <td className="text-right p-2 font-mono">{stat.medianTime.toFixed(3)}</td>
                    <td className="text-right p-2 font-mono">{stat.callCount}</td>
                    <td className="text-right p-2 font-mono">{stat.callsPerSecond.toFixed(1)}</td>
                    <td className="text-right p-2 font-mono">
                      {stat.avgElementCount > 0 ? stat.avgElementCount.toFixed(0) : '—'}
                    </td>
                    <td className="text-right p-2 font-mono">
                      {stat.avgDatasetSize > 0 ? stat.avgDatasetSize.toFixed(0) : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

