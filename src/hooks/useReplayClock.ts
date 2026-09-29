import { useState, useEffect, useRef, useCallback } from 'react';
import { useReplayStore } from '@/state/useReplayStore';

interface UseReplayClockResult {
  currentTime: number;
  playing: boolean;
  speed: number;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setCurrentTime: (time: number) => void;
}

/**
 * Horloge du replay, cadencee par requestAnimationFrame.
 *
 * Une seule boucle vit pendant toute la lecture. Une version precedente
 * dependait de currentTime : elle se reabonnait a chaque image et la premiere
 * image de chaque abonnement avait un delta nul. Le temps n'avancait donc
 * qu'une image sur deux -- animation a 30 i/s et vitesse reelle divisee par
 * deux par rapport a celle affichee.
 *
 * Lecture et vitesse vivent dans le store, seule source de verite : le bouton
 * Lecture ecrit dans le store, l'horloge le lit, et remet le store en pause
 * en fin de replay. Avant, chaque page recopiait le store dans un etat local
 * de l'horloge : en fin de replay les deux divergeaient (boucle de rendus
 * sur la page de replay) et la page publique ne recopiait rien du tout (le
 * bouton Lecture n'y faisait rien).
 */
export function useReplayClock(initialTime: number, minTime: number, maxTime: number): UseReplayClockResult {
  const playing = useReplayStore((s) => s.playing);
  const speed = useReplayStore((s) => s.speed);
  const setPlaying = useReplayStore((s) => s.setPlaying);
  const setSpeed = useReplayStore((s) => s.setSpeed);

  const [currentTime, setCurrentTimeState] = useState(initialTime);
  const currentTimeRef = useRef(initialTime);
  const speedRef = useRef(speed);
  const minTimeRef = useRef(minTime);
  const maxTimeRef = useRef(maxTime);

  speedRef.current = speed;

  // Update refs when bounds change
  useEffect(() => {
    minTimeRef.current = minTime;
    maxTimeRef.current = maxTime;
  }, [minTime, maxTime]);

  useEffect(() => {
    if (!playing) return;
    if (currentTimeRef.current >= maxTimeRef.current) {
      setPlaying(false);
      return;
    }

    let raf = 0;
    let last: number | null = null;
    const animate = (timestamp: number) => {
      // Onglet en arriere-plan : rAF est suspendu, on ne rattrape pas d'un bond
      // plusieurs minutes de replay au retour.
      const delta = last === null ? 0 : Math.min(timestamp - last, 100);
      last = timestamp;

      const maxT = maxTimeRef.current;
      const next = Math.min(maxT, currentTimeRef.current + delta * speedRef.current);
      if (next !== currentTimeRef.current) {
        currentTimeRef.current = next;
        setCurrentTimeState(next);
      }
      if (next >= maxT) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [playing, setPlaying]);

  const handleSetCurrentTime = useCallback((time: number) => {
    const minT = minTimeRef.current;
    const maxT = maxTimeRef.current;
    const clampedTime = Math.max(minT, Math.min(maxT, time));
    currentTimeRef.current = clampedTime;
    setCurrentTimeState(clampedTime);
  }, []);

  return {
    currentTime,
    playing,
    speed,
    setPlaying,
    setSpeed,
    setCurrentTime: handleSetCurrentTime,
  };
}
