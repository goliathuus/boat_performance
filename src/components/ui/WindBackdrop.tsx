import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Fond d'ecran des pages hors carte : un degrade nuit marine et des lignes de
 * courant qui derivent lentement, en echo aux particules de vent du replay.
 *
 * Le champ est synthetique (quelques sinus superposes), pas de donnees : c'est
 * du decor. Densite et opacite restent basses pour ne jamais gener la lecture
 * du contenu pose dessus. Mouvement coupe si l'utilisateur demande moins
 * d'animations : une image fixe est alors dessinee une fois.
 */
export function WindBackdrop({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    type P = { x: number; y: number; age: number; life: number };
    let particles: P[] = [];

    // Champ de vent synthetique : dominante ouest-sud-ouest, ondulations lentes.
    const field = (x: number, y: number, t: number) => {
      const a =
        -0.35 +
        0.55 * Math.sin(y * 0.0045 + t * 0.00012) +
        0.35 * Math.cos(x * 0.0035 - t * 0.00009) +
        0.2 * Math.sin((x + y) * 0.006);
      const s = 0.55 + 0.35 * Math.sin(x * 0.002 + y * 0.003 + t * 0.0001);
      return [Math.cos(a) * s, Math.sin(a) * s];
    };

    const spawn = (p: P) => {
      p.x = Math.random() * w;
      p.y = Math.random() * h;
      p.age = 0;
      p.life = 60 + Math.random() * 90;
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(900, Math.round(((w * h) / 2600) * intensity));
      particles = Array.from({ length: count }, () => {
        const p = { x: 0, y: 0, age: 0, life: 0 };
        spawn(p);
        p.age = Math.random() * p.life;
        return p;
      });
    };

    const step = (t: number, fade: number) => {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(190,215,255,${0.28 * intensity})`;
      for (const p of particles) {
        if (p.age++ > p.life || p.x < 0 || p.y < 0 || p.x > w || p.y > h) {
          spawn(p);
          continue;
        }
        const [vx, vy] = field(p.x, p.y, t);
        ctx.moveTo(p.x, p.y);
        p.x += vx * 1.1;
        p.y += vy * 1.1;
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    };

    const frame = (t: number) => {
      step(t, 0.94);
      raf = requestAnimationFrame(frame);
    };

    resize();
    if (reduceMotion) {
      // Image fixe : quelques dizaines de pas sans effacement dessinent des trainees.
      for (let i = 0; i < 40; i++) step(0, 1);
    } else {
      raf = requestAnimationFrame(frame);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [intensity]);

  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="absolute inset-0 app-backdrop" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
