import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TechIntelligenceEvent } from '../types/intelligence';

interface TrendsDashboardProps {
  events: TechIntelligenceEvent[];
}

export const TrendsDashboard: React.FC<TrendsDashboardProps> = ({ events }) => {
  const trendData = useMemo(() => {
    const sectors = [
      'AI & Frontier Models',
      'Semiconductors & Compute',
      'Cybersecurity & Privacy',
      'Enterprise Cloud & Infra',
      'Big Tech & Regulation',
      'Open Source & Dev Tools',
    ];

    const counts = sectors.reduce((acc, sector) => {
      acc[sector] = 0;
      return acc;
    }, {} as Record<string, number>);

    events.forEach((event) => {
      if (counts[event.category] !== undefined) {
        counts[event.category]++;
      }
    });

    return sectors.map((sector) => ({
      name: sector.split(' & ')[0], // Shorter name for X-axis
      fullName: sector,
      count: counts[sector],
    }));
  }, [events]);

  const COLORS = ['#06b6d4', '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-lg font-bold text-white font-mono uppercase tracking-wider">
            24-Hour Sector Intelligence Trends
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-1">
            Claim frequency across major technological domains (Last 24 Hours)
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[10px] font-mono text-cyan-300 uppercase font-bold">Live Metrics</span>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={trendData}
            margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis
              dataKey="name"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#f1f5f9',
              }}
              itemStyle={{ color: '#22d3ee' }}
              formatter={(value: number) => [`${value} Claims`, 'Volume']}
              labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#fff' }}
            />
            <Bar
              dataKey="count"
              radius={[4, 4, 0, 0]}
              isAnimationActive={true}
              animationDuration={1500}
              animationBegin={200}
              animationEasing="ease-out"
            >
              {trendData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-6">
        {trendData.map((item, index) => (
          <div key={item.fullName} className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/50">
            <span className="text-[10px] text-slate-500 uppercase block font-mono truncate" title={item.fullName}>
              {item.name}
            </span>
            <div className="flex items-end justify-between mt-1">
              <span className="text-xl font-bold text-white tabular-nums">{item.count}</span>
              <div className="h-1.5 w-8 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length], opacity: 0.5 }} />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
