/**
 * Performance profiling module for boat tracker
 * Measures execution time and collects statistics for operations
 */

interface MetricData {
  name: string;
  times: number[]; // Array of execution times in ms
  callCount: number;
  totalTime: number;
  elementCounts: number[]; // Number of elements processed (points, segments, etc.)
  datasetSizes: number[]; // Size of dataset when operation was called
}

class PerformanceProfiler {
  private metrics: Map<string, MetricData> = new Map();
  private enabled: boolean = false;
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private fps: number = 0;

  /**
   * Enable or disable profiling
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.reset();
    }
  }

  /**
   * Check if profiling is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Measure execution time of an operation
   * @param operationName Name of the operation
   * @param fn Function to measure
   * @param elementCount Number of elements processed (optional)
   * @param datasetSize Size of dataset (optional)
   */
  measure<T>(
    operationName: string,
    fn: () => T,
    elementCount?: number,
    datasetSize?: number
  ): T {
    if (!this.enabled) {
      return fn();
    }

    const start = performance.now();
    const result = fn();
    const end = performance.now();
    const duration = end - start;

    this.recordMetric(operationName, duration, elementCount, datasetSize);

    return result;
  }

  /**
   * Record a metric manually
   */
  recordMetric(
    operationName: string,
    duration: number,
    elementCount?: number,
    datasetSize?: number
  ): void {
    if (!this.enabled) return;

    let metric = this.metrics.get(operationName);
    if (!metric) {
      metric = {
        name: operationName,
        times: [],
        callCount: 0,
        totalTime: 0,
        elementCounts: [],
        datasetSizes: [],
      };
      this.metrics.set(operationName, metric);
    }

    metric.times.push(duration);
    metric.callCount++;
    metric.totalTime += duration;

    if (elementCount !== undefined) {
      metric.elementCounts.push(elementCount);
    }
    if (datasetSize !== undefined) {
      metric.datasetSizes.push(datasetSize);
    }

    // Keep only last 1000 measurements to avoid memory issues
    if (metric.times.length > 1000) {
      const removed = metric.times.shift()!;
      metric.totalTime -= removed;
      metric.callCount--;
      if (metric.elementCounts.length > 0) {
        metric.elementCounts.shift();
      }
      if (metric.datasetSizes.length > 0) {
        metric.datasetSizes.shift();
      }
    }
  }

  /**
   * Update FPS counter
   */
  updateFrame(): void {
    if (!this.enabled) return;

    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFrameTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
  }

  /**
   * Get statistics for an operation
   */
  getStats(operationName: string) {
    const metric = this.metrics.get(operationName);
    if (!metric || metric.times.length === 0) {
      return null;
    }

    const times = metric.times;
    const sorted = [...times].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = metric.totalTime / metric.callCount;
    const median = sorted[Math.floor(sorted.length / 2)];

    const avgElementCount =
      metric.elementCounts.length > 0
        ? metric.elementCounts.reduce((a, b) => a + b, 0) / metric.elementCounts.length
        : 0;

    const avgDatasetSize =
      metric.datasetSizes.length > 0
        ? metric.datasetSizes.reduce((a, b) => a + b, 0) / metric.datasetSizes.length
        : 0;

    return {
      name: operationName,
      callCount: metric.callCount,
      avgTime: avg,
      minTime: min,
      maxTime: max,
      medianTime: median,
      totalTime: metric.totalTime,
      callsPerSecond: this.fps > 0 ? (metric.callCount / this.frameCount) * this.fps : 0,
      avgElementCount,
      avgDatasetSize,
    };
  }

  /**
   * Get all metrics
   */
  getAllStats() {
    const stats: Array<ReturnType<typeof this.getStats>> = [];
    for (const [name] of this.metrics) {
      const stat = this.getStats(name);
      if (stat) {
        stats.push(stat);
      }
    }
    return stats.sort((a, b) => (b?.avgTime || 0) - (a?.avgTime || 0));
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.frameCount = 0;
    this.lastFrameTime = performance.now();
    this.fps = 0;
  }

  /**
   * Export metrics as JSON
   */
  exportJSON(): string {
    return JSON.stringify(
      {
        fps: this.fps,
        metrics: Array.from(this.metrics.entries()).map(([name, metric]) => ({
          name,
          ...metric,
        })),
      },
      null,
      2
    );
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.fps;
  }
}

// Singleton instance
export const profiler = new PerformanceProfiler();

// Enable by default in development mode
if (import.meta.env.DEV) {
  profiler.setEnabled(true);
}

// Keyboard shortcut to toggle (P key)
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P') {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        profiler.setEnabled(!profiler.isEnabled());
        console.log('Performance profiling:', profiler.isEnabled() ? 'ENABLED' : 'DISABLED');
      }
    }
  });
}

