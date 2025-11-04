import { create } from 'zustand';
import type { RaceDataset } from '@/domain/types';
import type { LatLngBounds } from 'leaflet';

interface RaceState {
  dataset: RaceDataset | null;
  currentTime: number | null;
  speed: number; // 0.5, 1, 2, 4, 8, 16, 24, 48
  playing: boolean;
  drawFullTrack: boolean;
  zoomToBounds: LatLngBounds | null; // Trigger zoom action
  timeRange: [number, number] | null; // [start, end] time range for filtering
  autoFitEnabled: boolean; // Whether to auto-fit bounds on data load
  windAngleMode: 'AWA' | 'TWA'; // Wind angle mode for wind rose
  showTWD: boolean; // Show TWD arrows on map

  setDataset: (dataset: RaceDataset) => void;
  setCurrentTime: (time: number | null) => void;
  setSpeed: (speed: number) => void;
  setPlaying: (playing: boolean) => void;
  toggleDrawFull: () => void;
  triggerZoom: (bounds: LatLngBounds | null) => void;
  setTimeRange: (range: [number, number] | null) => void;
  setAutoFitEnabled: (enabled: boolean) => void;
  setWindAngleMode: (mode: 'AWA' | 'TWA') => void;
  setShowTWD: (show: boolean) => void;
}

export const useRaceStore = create<RaceState>((set) => ({
  dataset: null,
  currentTime: null,
  speed: 1,
  playing: false,
  drawFullTrack: false,
  zoomToBounds: null,
  timeRange: null,
  autoFitEnabled: true,
  windAngleMode: 'TWA',
  showTWD: false,

  setDataset: (dataset) => {
    set({
      dataset,
      currentTime: dataset.tMin,
      playing: false,
      timeRange: null, // Reset time range on new dataset
      autoFitEnabled: true, // Enable auto-fit on new data
    });
  },

  setCurrentTime: (time) => {
    set({ currentTime: time });
  },

  setSpeed: (speed) => {
    set({ speed });
  },

  setPlaying: (playing) => {
    set({ playing });
  },

  toggleDrawFull: () => {
    set((state) => ({ drawFullTrack: !state.drawFullTrack }));
  },

  triggerZoom: (bounds) => {
    set({ zoomToBounds: bounds });
    // Clear the trigger after a short delay
    setTimeout(() => set({ zoomToBounds: null }), 100);
  },

  setTimeRange: (range) => {
    set({ timeRange: range });
  },

  setAutoFitEnabled: (enabled) => {
    set({ autoFitEnabled: enabled });
  },

  setWindAngleMode: (mode) => {
    set({ windAngleMode: mode });
  },

  setShowTWD: (show) => {
    set({ showTWD: show });
  },
}));
