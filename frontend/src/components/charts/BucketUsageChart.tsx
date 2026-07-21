import {useEffect, useState} from 'react';
import {Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip} from 'recharts';
import type {BucketUsage} from '@/types';
import {formatBytes} from '@/lib/file-utils';
import {chartColorPalette, getTextColor, getTooltipStyle} from '@/lib/chart-colors';

interface BucketUsageChartProps {
  data: BucketUsage[];
}

export function BucketUsageChart({ data }: BucketUsageChartProps) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check if dark mode is enabled
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    // Listen for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  const colors = isDark ? chartColorPalette.dark : chartColorPalette.light;
  const textColor = getTextColor(isDark);
  const tooltipStyle = getTooltipStyle(isDark);

  const chartData = data.map(item => ({
    name: item.bucketName,
    value: item.size,
    displaySize: formatBytes(item.size),
  }));

  return (
    <div className="h-[300px] w-full select-none">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart accessibilityLayer={false}>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name }) => `${name}`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
            rootTabIndex={-1}
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatBytes(value as number)}
            contentStyle={tooltipStyle as React.CSSProperties}
            labelStyle={{ color: textColor }}
            itemStyle={{ color: textColor }}
          />
          <Legend wrapperStyle={{ color: textColor }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
