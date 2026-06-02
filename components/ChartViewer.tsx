import React, { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter
} from 'recharts';
import { Settings2, BarChart3, LineChart as LineIcon, Activity, ScatterChart as ScatterIcon } from 'lucide-react';

interface ChartViewerProps {
  data: any[];
  columns: string[];
}

type ChartType = 'bar' | 'line' | 'area' | 'scatter';

export const ChartViewer: React.FC<ChartViewerProps> = ({ data, columns }) => {
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xAxisKey, setXAxisKey] = useState<string>(columns[0] || '');
  
  // Default Y axis to the first numeric column found, else second column, else first
  const [yAxisKey, setYAxisKey] = useState<string>(() => {
    const numCol = columns.find(col => data.length > 0 && typeof data[0][col] === 'number');
    return numCol || columns[1] || columns[0] || '';
  });

  const chartData = data;

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 10, right: 30, left: 10, bottom: 0 }
    };

    const axisStyle = {
      stroke: "#94a3b8",
      fontSize: 12,
      tickLine: false,
      axisLine: false
    };

    const tooltipStyle = {
      contentStyle: { backgroundColor: '#1e293b', borderColor: '#475569', color: '#f1f5f9', borderRadius: '8px' },
      itemStyle: { color: '#f1f5f9' },
      cursor: { fill: 'rgba(255,255,255,0.05)' }
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey={xAxisKey} {...axisStyle} />
            <YAxis {...axisStyle} />
            <Tooltip {...tooltipStyle} />
            <Legend />
            <Line type="monotone" dataKey={yAxisKey} stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 4 }} activeDot={{ r: 6 }} />
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey={xAxisKey} {...axisStyle} />
            <YAxis {...axisStyle} />
            <Tooltip {...tooltipStyle} />
            <Legend />
            <Area type="monotone" dataKey={yAxisKey} stroke="#06b6d4" fill="#06b6d4" fillOpacity={0.3} />
          </AreaChart>
        );
      case 'scatter':
        return (
          <ScatterChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis type="category" dataKey={xAxisKey} name={xAxisKey} {...axisStyle} />
            <YAxis type="number" dataKey={yAxisKey} name={yAxisKey} {...axisStyle} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} {...tooltipStyle} />
            <Legend />
            <Scatter name={yAxisKey} data={chartData} fill="#f59e0b" />
          </ScatterChart>
        );
      case 'bar':
      default:
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey={xAxisKey} {...axisStyle} />
            <YAxis {...axisStyle} />
            <Tooltip {...tooltipStyle} />
            <Legend />
            <Bar dataKey={yAxisKey} fill="#d946ef" radius={[4, 4, 0, 0]} />
          </BarChart>
        );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 p-3 mb-3 bg-martian-surface/50 rounded-lg border border-martian-border/50">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-martian-muted" />
          <span className="text-xs font-bold text-martian-muted uppercase">Config</span>
        </div>

        <div className="flex bg-martian-bg rounded-md p-1 border border-martian-border">
          <button
            onClick={() => setChartType('bar')}
            className={`p-1.5 rounded transition-all ${chartType === 'bar' ? 'bg-martian-surface text-omop-magenta shadow-sm' : 'text-martian-muted hover:text-martian-text'}`}
            title="Bar Chart"
          >
            <BarChart3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`p-1.5 rounded transition-all ${chartType === 'line' ? 'bg-martian-surface text-omop-indigo shadow-sm' : 'text-martian-muted hover:text-martian-text'}`}
            title="Line Chart"
          >
            <LineIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setChartType('area')}
            className={`p-1.5 rounded transition-all ${chartType === 'area' ? 'bg-martian-surface text-omop-cyan shadow-sm' : 'text-martian-muted hover:text-martian-text'}`}
            title="Area Chart"
          >
            <Activity className="w-4 h-4" />
          </button>
           <button
            onClick={() => setChartType('scatter')}
            className={`p-1.5 rounded transition-all ${chartType === 'scatter' ? 'bg-martian-surface text-omop-amber shadow-sm' : 'text-martian-muted hover:text-martian-text'}`}
            title="Scatter Chart"
          >
            <ScatterIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
            <label className="text-xs text-martian-muted">X-Axis:</label>
            <select
                className="bg-martian-bg border border-martian-border rounded px-2 py-1 text-xs text-martian-text focus:outline-none focus:border-martian-primary max-w-[120px]"
                value={xAxisKey}
                onChange={(e) => setXAxisKey(e.target.value)}
            >
                {columns.map(col => <option key={col} value={col}>{col}</option>)}
            </select>
        </div>

        <div className="flex items-center gap-2">
            <label className="text-xs text-martian-muted">Y-Axis:</label>
             <select
                className="bg-martian-bg border border-martian-border rounded px-2 py-1 text-xs text-martian-text focus:outline-none focus:border-martian-primary max-w-[120px]"
                value={yAxisKey}
                onChange={(e) => setYAxisKey(e.target.value)}
            >
                {columns.map(col => <option key={col} value={col}>{col}</option>)}
            </select>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[300px] w-full bg-martian-bg/50 border border-martian-border rounded-lg p-2">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
