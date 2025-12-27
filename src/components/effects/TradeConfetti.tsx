import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  color: string;
}

interface TradeConfettiProps {
  trigger: boolean;
  color?: string;
  particleCount?: number;
  originX?: number;
  originY?: number;
  onComplete?: () => void;
}

// Default vibrant colors from our palette
const DEFAULT_COLORS = [
  '#00FF88', // Lime green
  '#00BFFF', // Electric blue
  '#FF1493', // Neon pink
  '#FFD700', // Golden yellow
  '#9B59B6', // Cyber purple
  '#40E0D0', // Turquoise
];

export function TradeConfetti({
  trigger,
  color,
  particleCount = 18,
  originX = 50,
  originY = 50,
  onComplete,
}: TradeConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [isActive, setIsActive] = useState(false);

  const createParticles = useCallback(() => {
    const newParticles: Particle[] = [];
    const colors = color ? [color] : DEFAULT_COLORS;

    for (let i = 0; i < particleCount; i++) {
      // Random angle for dispersal
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const velocity = 2 + Math.random() * 3;

      newParticles.push({
        id: i,
        x: originX,
        y: originY,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 2, // Slight upward bias
        size: 4 + Math.random() * 4,
        opacity: 1,
        color: colors[i % colors.length],
      });
    }

    return newParticles;
  }, [color, particleCount, originX, originY]);

  useEffect(() => {
    if (!trigger) return;

    setIsActive(true);
    setParticles(createParticles());

    // Animation loop
    let animationFrame: number;
    let startTime = performance.now();
    const duration = 1000; // 1 second animation

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      if (progress < 1) {
        setParticles(prev =>
          prev.map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy + progress * 2, // Gravity effect
            vy: p.vy + 0.1, // Accelerate downward
            opacity: 1 - progress,
          }))
        );
        animationFrame = requestAnimationFrame(animate);
      } else {
        setIsActive(false);
        setParticles([]);
        onComplete?.();
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [trigger, createParticles, onComplete]);

  if (!isActive || particles.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {particles.map(particle => (
        <div
          key={particle.id}
          className="absolute"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            opacity: particle.opacity,
            transform: 'translate(-50%, -50%)',
            // Flat square particles - no border-radius
          }}
        />
      ))}
    </div>
  );
}

// Hook to trigger confetti from anywhere
export function useConfetti() {
  const [triggerState, setTriggerState] = useState({
    active: false,
    color: undefined as string | undefined,
    x: 50,
    y: 50,
  });

  const triggerConfetti = useCallback((options?: { color?: string; x?: number; y?: number }) => {
    setTriggerState({
      active: true,
      color: options?.color,
      x: options?.x ?? 50,
      y: options?.y ?? 50,
    });
  }, []);

  const handleComplete = useCallback(() => {
    setTriggerState(prev => ({ ...prev, active: false }));
  }, []);

  const ConfettiComponent = () => (
    <TradeConfetti
      trigger={triggerState.active}
      color={triggerState.color}
      originX={triggerState.x}
      originY={triggerState.y}
      onComplete={handleComplete}
    />
  );

  return { triggerConfetti, ConfettiComponent };
}
