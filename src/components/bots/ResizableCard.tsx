import { ReactNode, useRef, useState, useEffect } from 'react';
import { X, GripVertical, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ResizableCardProps {
  id: string;
  children: ReactNode;
  isEditMode: boolean;
  colSpan: number;
  rowSpan: number;
  visible: boolean;
  onResize: (colSpan: number, rowSpan: number) => void;
  onRemove: () => void;
  className?: string;
}

export function ResizableCard({
  id,
  children,
  isEditMode,
  colSpan,
  rowSpan,
  visible,
  onResize,
  onRemove,
  className,
}: ResizableCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [textScale, setTextScale] = useState(1);

  // Auto-scale text based on container size
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        // Scale text based on width (smaller = smaller text)
        const scale = Math.max(0.7, Math.min(1.2, width / 300));
        setTextScale(scale);
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!visible && !isEditMode) return null;

  const gridStyles = {
    gridColumn: `span ${colSpan}`,
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative transition-all duration-200',
        !visible && isEditMode && 'opacity-40',
        isEditMode && 'ring-2 ring-primary/30 ring-dashed rounded-lg',
        className
      )}
      style={{
        ...gridStyles,
        '--text-scale': textScale,
      } as React.CSSProperties}
    >
      {/* Edit Mode Controls */}
      {isEditMode && (
        <div className="absolute -top-2 -right-2 z-20 flex items-center gap-1">
          {/* Resize Controls */}
          <div className="flex items-center gap-0.5 bg-background border rounded-md shadow-sm">
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              onClick={() => onResize(Math.max(3, colSpan - 1), rowSpan)}
              title="Shrink width"
            >
              <Minimize2 className="h-3 w-3" />
            </Button>
            <span className="text-[9px] font-mono px-1">{colSpan}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              onClick={() => onResize(Math.min(12, colSpan + 1), rowSpan)}
              title="Expand width"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
          
          {/* Remove Button */}
          <Button
            size="icon"
            variant="destructive"
            className="h-5 w-5"
            onClick={onRemove}
            title="Hide card"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      
      {/* Drag Handle */}
      {isEditMode && (
        <div className="absolute top-1/2 -left-3 -translate-y-1/2 z-20 cursor-grab active:cursor-grabbing">
          <div className="bg-background border rounded p-0.5 shadow-sm">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      )}
      
      {/* Content with Text Scaling */}
      <div 
        className="h-full [&_*]:transition-[font-size] [&_*]:duration-200"
        style={{ 
          fontSize: `calc(1rem * var(--text-scale, 1))`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
