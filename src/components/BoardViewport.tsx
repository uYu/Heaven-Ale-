import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';

/** The same board at every screen size; only its viewing scale changes. */
export function BoardViewport({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [magnification, setMagnification] = useState(1);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(1, width / 1000) * magnification;
  return (
    <div className="board-viewport" ref={ref}>
      <div className="board-zoom" aria-label={`${label}缩放`}>
        <span>{magnification === 1 ? '完整棋盘 · 可放大操作' : '放大查看 · 左右滑动'}</span>
        <button
          aria-label={`缩小${label}`}
          disabled={magnification === 1}
          onClick={() => setMagnification((value) => Math.max(1, value - 0.5))}
        >
          <Minus size={16} />
        </button>
        <button
          aria-label={`适合屏幕：${label}`}
          onClick={() => {
            setMagnification(1);
            ref.current?.querySelector('.board-pan')?.scrollTo({ left: 0 });
          }}
        >
          <Scan size={15} />
          全图
        </button>
        <button
          aria-label={`放大${label}`}
          disabled={magnification === 3}
          onClick={() => setMagnification((value) => Math.min(3, value + 0.5))}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="board-pan" role="region" aria-label={label} tabIndex={0}>
        <div className="board-scale-content" style={{ width: Math.max(1000, width), zoom: scale }}>
          {children}
        </div>
      </div>
    </div>
  );
}
