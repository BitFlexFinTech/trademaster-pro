import { useState } from 'react';
import {
  Crosshair,
  TrendingUp,
  Minus,
  Type,
  Square,
  GitBranch,
  Trash2,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type DrawingTool = 'crosshair' | 'trendline' | 'horizontal' | 'text' | 'rectangle' | 'fibonacci' | null;

const TOOLS = [
  { id: 'crosshair', icon: Crosshair, name: 'Crosshair' },
  { id: 'trendline', icon: TrendingUp, name: 'Trend Line' },
  { id: 'horizontal', icon: Minus, name: 'Horizontal Line' },
  { id: 'fibonacci', icon: GitBranch, name: 'Fibonacci' },
  { id: 'rectangle', icon: Square, name: 'Rectangle' },
  { id: 'text', icon: Type, name: 'Text' },
] as const;

interface DrawingToolsSidebarProps {
  activeTool: DrawingTool;
  setActiveTool: (tool: DrawingTool) => void;
  onClearDrawings?: () => void;
}

export function DrawingToolsSidebar({
  activeTool,
  setActiveTool,
  onClearDrawings,
}: DrawingToolsSidebarProps) {
  return (
    <div className="w-10 bg-card border-r border-border flex flex-col items-center py-2 gap-0.5">
      {TOOLS.map((tool) => (
        <Tooltip key={tool.id}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id as DrawingTool)}
              className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
                activeTool === tool.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <tool.icon className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {tool.name}
          </TooltipContent>
        </Tooltip>
      ))}
      
      <div className="flex-1" />
      
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClearDrawings}
            className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          Clear All
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
