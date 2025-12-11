import { useEffect, useRef } from 'react';
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from 'lightweight-charts';
import type { OHLCData } from '@/lib/indicators';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  formatLineData,
  formatHistogramData,
} from '@/lib/indicators';
import type { IndicatorSettings } from './ChartToolbar';

interface TradingChartProps {
  data: OHLCData[];
  indicators: IndicatorSettings;
}

export function TradingChart({ data, indicators }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const indicatorSeriesRef = useRef<Map<string, ISeriesApi<any>>>(new Map());

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#00FF88',
          width: 1,
          style: 2,
          labelBackgroundColor: '#00FF88',
        },
        horzLine: {
          color: '#00FF88',
          width: 1,
          style: 2,
          labelBackgroundColor: '#00FF88',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
    });

    chartRef.current = chart;

    // Candlestick series (v5 API)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#00FF88',
      downColor: '#FF4444',
      borderUpColor: '#00FF88',
      borderDownColor: '#FF4444',
      wickUpColor: '#00FF88',
      wickDownColor: '#FF4444',
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Volume series (v5 API)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#00FF88',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      indicatorSeriesRef.current.clear();
    };
  }, []);

  // Update data
  useEffect(() => {
    if (!candlestickSeriesRef.current || !volumeSeriesRef.current || data.length === 0) return;

    const candleData = data.map(d => ({
      time: d.time as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumeData = data.map(d => ({
      time: d.time as any,
      value: d.volume || 0,
      color: d.close >= d.open ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 68, 68, 0.3)',
    }));

    candlestickSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Fit content after data update
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  // Update indicators
  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const chart = chartRef.current;
    const closes = data.map(d => d.close);
    const times = data.map(d => d.time);

    // Clear old indicator series
    indicatorSeriesRef.current.forEach((series) => {
      chart.removeSeries(series);
    });
    indicatorSeriesRef.current.clear();

    // SMA 20
    if (indicators.sma20) {
      const smaValues = calculateSMA(closes, 20);
      const series = chart.addSeries(LineSeries, {
        color: '#FFD700',
        lineWidth: 1,
        title: 'SMA 20',
      });
      series.setData(formatLineData(times, smaValues) as any);
      indicatorSeriesRef.current.set('sma20', series);
    }

    // SMA 50
    if (indicators.sma50) {
      const smaValues = calculateSMA(closes, 50);
      const series = chart.addSeries(LineSeries, {
        color: '#FF6B6B',
        lineWidth: 1,
        title: 'SMA 50',
      });
      series.setData(formatLineData(times, smaValues) as any);
      indicatorSeriesRef.current.set('sma50', series);
    }

    // EMA 20
    if (indicators.ema20) {
      const emaValues = calculateEMA(closes, 20);
      const series = chart.addSeries(LineSeries, {
        color: '#4ECDC4',
        lineWidth: 1,
        title: 'EMA 20',
      });
      series.setData(formatLineData(times, emaValues) as any);
      indicatorSeriesRef.current.set('ema20', series);
    }

    // Bollinger Bands
    if (indicators.bollingerBands) {
      const bb = calculateBollingerBands(closes, 20, 2);
      
      const upperSeries = chart.addSeries(LineSeries, {
        color: 'rgba(156, 39, 176, 0.8)',
        lineWidth: 1,
        title: 'BB Upper',
      });
      upperSeries.setData(formatLineData(times, bb.upper) as any);
      indicatorSeriesRef.current.set('bbUpper', upperSeries);

      const middleSeries = chart.addSeries(LineSeries, {
        color: 'rgba(156, 39, 176, 0.5)',
        lineWidth: 1,
        lineStyle: 2,
        title: 'BB Middle',
      });
      middleSeries.setData(formatLineData(times, bb.middle) as any);
      indicatorSeriesRef.current.set('bbMiddle', middleSeries);

      const lowerSeries = chart.addSeries(LineSeries, {
        color: 'rgba(156, 39, 176, 0.8)',
        lineWidth: 1,
        title: 'BB Lower',
      });
      lowerSeries.setData(formatLineData(times, bb.lower) as any);
      indicatorSeriesRef.current.set('bbLower', lowerSeries);
    }
  }, [data, indicators.sma20, indicators.sma50, indicators.ema20, indicators.bollingerBands]);

  return (
    <div className="flex-1 flex flex-col">
      {/* Main Chart */}
      <div ref={chartContainerRef} className="flex-1 min-h-0" />
      
      {/* RSI Pane */}
      {indicators.rsi && <RSIPane data={data} />}
      
      {/* MACD Pane */}
      {indicators.macd && <MACDPane data={data} />}
    </div>
  );
}

// RSI Separate Pane
function RSIPane({ data }: { data: OHLCData[] }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      height: 100,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        visible: false,
      },
      crosshair: {
        horzLine: { visible: false },
        vertLine: { visible: false },
      },
    });

    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const closes = data.map(d => d.close);
    const times = data.map(d => d.time);
    const rsiValues = calculateRSI(closes, 14);

    const chart = chartRef.current;
    
    const series = chart.addSeries(LineSeries, {
      color: '#9C27B0',
      lineWidth: 1,
      priceScaleId: 'right',
    });
    series.setData(formatLineData(times, rsiValues) as any);

    // Add overbought/oversold lines
    series.createPriceLine({ price: 70, color: 'rgba(255, 68, 68, 0.5)', lineWidth: 1, lineStyle: 2 });
    series.createPriceLine({ price: 30, color: 'rgba(0, 255, 136, 0.5)', lineWidth: 1, lineStyle: 2 });

    chart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.05 },
    });

    return () => {
      chart.removeSeries(series);
    };
  }, [data]);

  return (
    <div className="border-t border-border">
      <div className="px-2 py-1 text-xs text-muted-foreground bg-secondary/30">RSI (14)</div>
      <div ref={chartContainerRef} />
    </div>
  );
}

// MACD Separate Pane
function MACDPane({ data }: { data: OHLCData[] }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      height: 100,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        visible: false,
      },
      crosshair: {
        horzLine: { visible: false },
        vertLine: { visible: false },
      },
    });

    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const closes = data.map(d => d.close);
    const times = data.map(d => d.time);
    const macdResult = calculateMACD(closes, 12, 26, 9);

    const chart = chartRef.current;

    // MACD Line
    const macdSeries = chart.addSeries(LineSeries, {
      color: '#2196F3',
      lineWidth: 1,
    });
    macdSeries.setData(formatLineData(times, macdResult.macd) as any);

    // Signal Line
    const signalSeries = chart.addSeries(LineSeries, {
      color: '#FF9800',
      lineWidth: 1,
    });
    signalSeries.setData(formatLineData(times, macdResult.signal) as any);

    // Histogram
    const histogramSeries = chart.addSeries(HistogramSeries, {
      color: '#00FF88',
    });
    histogramSeries.setData(formatHistogramData(times, macdResult.histogram) as any);

    return () => {
      chart.removeSeries(macdSeries);
      chart.removeSeries(signalSeries);
      chart.removeSeries(histogramSeries);
    };
  }, [data]);

  return (
    <div className="border-t border-border">
      <div className="px-2 py-1 text-xs text-muted-foreground bg-secondary/30">MACD (12, 26, 9)</div>
      <div ref={chartContainerRef} />
    </div>
  );
}
