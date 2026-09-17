import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';

type Point = { x: number; y: number };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animate between logical spaces, including corners, without delaying game state. */
export function useTrackMotion(
  ref: RefObject<SVGGElement | null>,
  identity: string,
  position: number,
  destination: Point,
  pointAt: (position: number) => Point,
) {
  const previous = useRef<{ identity: string; position: number; point: Point } | null>(null);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = { identity, position, point: destination };
    const node = ref.current;
    if (!node || !old || old.identity !== identity || reducedMotion()) return;
    if (old.point.x === destination.x && old.point.y === destination.y) return;
    const points = [old.point];
    const direction = Math.sign(position - old.position);
    for (let step = old.position + direction; direction && step !== position; step += direction) {
      points.push(pointAt(step));
    }
    points.push(destination);
    const animation = node.animate(
      points.map(({ x, y }) => ({ transform: `translate(${x}px, ${y}px)` })),
      {
        duration: Math.min(1800, 900 + Math.abs(position - old.position) * 70),
        easing: 'ease-in-out',
      },
    );
    return () => animation.cancel();
  }, [identity, position, destination.x, destination.y, pointAt, ref]);
}

/** Pawns live inside different road buttons; retain their last logical position across reparenting. */
export function useRoadMotion(
  ref: RefObject<HTMLDivElement | null>,
  identity: string,
  positions: string,
) {
  const previous = useRef<{
    identity: string;
    steps: Map<string, number>;
    offsets: Map<string, Point>;
  } | null>(null);
  useLayoutEffect(() => {
    const board = ref.current;
    if (!board) return;
    const old = previous.current;
    const steps = new Map<string, number>();
    const offsets = new Map<string, Point>();
    const animations: Animation[] = [];
    const raised: HTMLElement[] = [];
    const rect = board.getBoundingClientRect();
    const scale = rect.width / board.offsetWidth || 1;
    const spaces = [...board.querySelectorAll<HTMLElement>('[data-road-step]')];
    const center = (step: number) => {
      const space = spaces.find((node) => Number(node.dataset.roadStep) === step)!;
      const box = space.getBoundingClientRect();
      return { x: (box.left + box.width / 2) / scale, y: (box.top + box.height / 2) / scale };
    };
    board.querySelectorAll<HTMLElement>('[data-road-pawn]').forEach((pawn) => {
      const id = pawn.dataset.roadPawn!;
      const step = Number(pawn.dataset.roadPosition);
      steps.set(id, step);
      const end = center(step % spaces.length);
      const box = pawn.getBoundingClientRect();
      const offset = {
        x: (box.left + box.width / 2) / scale - end.x,
        y: (box.top + box.height / 2) / scale - end.y,
      };
      offsets.set(id, offset);
      const from = old?.steps.get(id);
      if (
        !old ||
        old.identity !== identity ||
        from === undefined ||
        from === step ||
        reducedMotion()
      )
        return;
      // Returning home follows the remainder of the clockwise road. Undo follows it backwards.
      const last = spaces.length;
      if (from % last === step % last) return;
      const start = from;
      const finish = step;
      const direction = Math.sign(finish - start);
      const frames: Keyframe[] = [];
      for (let n = start; ; n += direction) {
        const point = center(n % last);
        const previousOffset = old.offsets?.get(id) ?? offset;
        const progress = Math.abs(n - start) / Math.abs(finish - start);
        const dx = (previousOffset.x - offset.x) * (1 - progress);
        const dy = (previousOffset.y - offset.y) * (1 - progress);
        frames.push({
          transform: `translate(${point.x - end.x + dx}px, ${point.y - end.y + dy}px)`,
        });
        if (n === finish) break;
      }
      const space = pawn.closest<HTMLElement>('[data-road-step]')!;
      space.style.zIndex = '20';
      raised.push(space);
      animations.push(
        pawn.animate(frames, {
          duration: Math.min(2200, 1000 + Math.abs(finish - start) * 80),
          easing: 'ease-in-out',
        }),
      );
    });
    previous.current = { identity, steps, offsets };
    animations.forEach((animation) => {
      animation.onfinish = () => raised.forEach((space) => space.style.removeProperty('z-index'));
    });
    return () => {
      animations.forEach((animation) => animation.cancel());
      raised.forEach((space) => space.style.removeProperty('z-index'));
    };
  }, [identity, positions, ref]);
}

/** Only animate changed contents, never an initial load or a switch to another player's board. */
export function usePlacementMotion(
  ref: RefObject<Element | null>,
  identity: string,
  value: string,
) {
  const previous = useRef<{ identity: string; value: string } | null>(null);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = { identity, value };
    if (!ref.current || !old || old.identity !== identity || old.value === value || reducedMotion())
      return;
    const base = getComputedStyle(ref.current).transform;
    const transform = base === 'none' ? '' : base;
    const animation = ref.current.animate(
      [
        {
          opacity: 0.25,
          filter: 'brightness(1.6)',
          transform: `${transform} translateY(-6px) scale(.92)`,
        },
        { opacity: 1, filter: 'brightness(1)', transform: `${transform} translateY(0) scale(1)` },
      ],
      { duration: 800, easing: 'ease-out' },
    );
    return () => animation.cancel();
  }, [identity, value, ref]);
}
