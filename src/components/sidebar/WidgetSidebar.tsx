import { useState, useEffect, useMemo } from 'react';
import GridLayout, { Layout } from 'react-grid-layout';
import { WindRose } from '@/components/map/WindRose';
import { TimeSeriesGraph } from './TimeSeriesGraph';
import { PolarChart } from './PolarChart';
import type { BoatTrack } from '@/domain/types';
import { Button } from '@/components/ui/button';

interface WidgetSidebarProps {
  boats: BoatTrack[];
  currentTime: number | null;
  onOpenChange?: (isOpen: boolean) => void;
}

export function WidgetSidebar({ boats, currentTime, onOpenChange }: WidgetSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [availableHeight, setAvailableHeight] = useState(0);
  
  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    onOpenChange?.(newState);
  };
  const [timeRangeMinutes, setTimeRangeMinutes] = useState<number>(5);

  // Calculate available height for grid
  useEffect(() => {
    const calculateHeight = () => {
      const timeControllerHeight = 220; // Height of TimeController
      const available = window.innerHeight - timeControllerHeight;
      setAvailableHeight(available);
    };

    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    return () => window.removeEventListener('resize', calculateHeight);
  }, []);

  // Define layout for widgets
  const layout: Layout[] = useMemo(() => [
    // Wind Rose (full width)
    { i: 'windRose', x: 0, y: 0, w: 6, h: 3, minW: 2, minH: 2 },
    // Time Series Graph (middle, full width)
    { i: 'timeSeriesGraph', x: 0, y: 3, w: 6, h: 3, minW: 2, minH: 1 },
    // Polar Chart (bottom, full width, increased height)
    { i: 'polarChart', x: 0, y: 6, w: 6, h: 4, minW: 2, minH: 2 },
  ], []);

  // Calculate row height based on available space
  const rowHeight = useMemo(() => {
    // Total rows needed: windRose (3) + timeSeriesGraph (3) + polarChart (4) = 10 rows
    if (availableHeight <= 0) return 50;
    return Math.floor(availableHeight / 10);
  }, [availableHeight]);

  // Calculate widget sizes
  const widgetSizes = useMemo(() => ({
    windRose: rowHeight * 3,
    timeSeries: rowHeight * 3,
    polarChart: rowHeight * 4,
  }), [rowHeight]);

  return (
    <div
      className={`fixed left-0 top-0 bottom-0 z-[1000] bg-background/95 backdrop-blur-sm border-r rounded-r-2xl shadow-lg transition-all duration-300 ease-in-out ${
        isOpen ? 'w-auto' : 'w-[15px]'
      }`}
    >
      {/* Toggle Button - Fixed at middle-left inside sidebar */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 z-[1001] flex items-center justify-center transition-all duration-300 ${
          isOpen ? 'left-0' : 'left-0'
        }`}
      >
        <Button
          onClick={handleToggle}
          variant="ghost"
          size="icon"
          className={`rounded-r-md rounded-l-none hover:bg-accent/80 transition-all duration-300 ${
            isOpen ? 'h-10 w-10' : 'h-[15px] w-[15px]'
          }`}
          aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          >
            {isOpen ? (
              <path d="M15 18l-6-6 6-6" />
            ) : (
              <path d="M9 18l6-6-6-6" />
            )}
          </svg>
        </Button>
      </div>

      {/* Content Container with Grid Layout */}
      <div
        className={`transition-opacity duration-300 h-full ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ 
          minWidth: isOpen ? '300px' : '15px',
          padding: isOpen ? '16px 0px 16px 8px' : '0', // Top, Right, Bottom, Left - increased vertical padding
          overflow: 'hidden' // Prevent any overflow
        }}
      >
        {isOpen && availableHeight > 0 && (
          <GridLayout
            className="layout"
            layout={layout}
            cols={6}
            rowHeight={rowHeight}
            width={300} // Use full width of sidebar (300px)
            margin={[0, 8]} // No horizontal margin, 8px vertical margin between widgets
            isDraggable={false}
            isResizable={false}
            compactType={null}
            preventCollision={true}
            style={{ height: availableHeight }}
          >
            {/* Wind Rose */}
            <div key="windRose" className="bg-transparent">
              <WindRose boats={boats} currentTime={currentTime} size={widgetSizes.windRose} />
            </div>

            {/* Time Series Graph */}
            <div key="timeSeriesGraph" className="bg-transparent flex flex-col pt-8 -mx-4">
              {/* Time Range Selector Buttons */}
              <div className="flex gap-1 justify-center mb-1">
                {[1, 2, 5, 10].map((minutes) => (
                  <Button
                    key={minutes}
                    size="sm"
                    variant={timeRangeMinutes === minutes ? 'default' : 'outline'}
                    onClick={() => setTimeRangeMinutes(minutes)}
                    className="h-6 px-2 text-xs"
                  >
                    {minutes}m
                  </Button>
                ))}
              </div>
              {/* Graph */}
              <div className="flex-1">
                <TimeSeriesGraph
                  boats={boats}
                  currentTime={currentTime}
                  timeRangeMinutes={timeRangeMinutes}
                  height={widgetSizes.timeSeries - 30} // Account for buttons
                />
              </div>
            </div>

            {/* Polar Chart */}
            <div key="polarChart" className="bg-transparent">
              <PolarChart boats={boats} currentTime={currentTime} size={widgetSizes.polarChart} />
            </div>
          </GridLayout>
        )}
      </div>
    </div>
  );
}

