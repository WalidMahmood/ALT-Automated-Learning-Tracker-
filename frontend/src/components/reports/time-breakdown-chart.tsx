import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

interface TimeBreakdownProps {
  data: { lnd_hours: number; sbu_hours: number }
}

const COLORS = ['hsl(221, 83%, 53%)', 'hsl(25, 95%, 53%)']

export function TimeBreakdownChart({ data }: TimeBreakdownProps) {
  const chartData = [
    { name: 'L&D Tasks', value: data.lnd_hours },
    { name: 'SBU Projects', value: data.sbu_hours },
  ].filter((d) => d.value > 0)

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No data for this period
      </div>
    )
  }

  const total = data.lnd_hours + data.sbu_hours

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={4}
            dataKey="value"
            strokeWidth={2}
            stroke="hsl(var(--background))"
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`${value}h`, '']}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          />
          <Legend
            formatter={(value, entry: any) => {
              const hours = entry?.payload?.value || 0
              const pct = total > 0 ? Math.round((hours / total) * 100) : 0
              return `${value} (${hours}h · ${pct}%)`
            }}
            wrapperStyle={{ fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
