import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit2, Check, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardLayout, CardLayout } from '@/hooks/useDashboardLayout';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface DashboardEditModeProps {
  className?: string;
}

export function DashboardEditMode({ className }: DashboardEditModeProps) {
  const { layouts, isEditMode, setEditMode, toggleCardVisibility, resetLayout } = useDashboardLayout();
  
  const hiddenCount = layouts.filter(l => !l.visible).length;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {isEditMode ? (
        <>
          {/* Done Button */}
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs gap-1"
            onClick={() => setEditMode(false)}
          >
            <Check className="h-3 w-3" />
            Done
          </Button>
          
          {/* Hidden Cards Dropdown */}
          {hiddenCount > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <EyeOff className="h-3 w-3" />
                  {hiddenCount} hidden
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {layouts.filter(l => !l.visible).map(layout => (
                  <DropdownMenuItem
                    key={layout.id}
                    onClick={() => toggleCardVisibility(layout.id)}
                    className="text-xs"
                  >
                    <Eye className="h-3 w-3 mr-2" />
                    Show {layout.id.replace(/-/g, ' ')}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {/* Reset Button */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1"
            onClick={resetLayout}
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
          
          {/* Edit Mode Indicator */}
          <Badge variant="outline" className="text-[9px] h-5 animate-pulse">
            EDIT MODE
          </Badge>
        </>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1"
          onClick={() => setEditMode(true)}
        >
          <Edit2 className="h-3 w-3" />
          Edit Layout
        </Button>
      )}
    </div>
  );
}
