import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface WeeklyTrendProps {
  data: {
    week: string
    hours: number
    entries: number
  }[]
}

export function WeeklyTrendChart({ data }: WeeklyTrendProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No trend data
      </div>
    )
  }

  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formatted} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(221, 83%, 53%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="entriesGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(262, 83%, 58%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <YAxis
            yAxisId="hours"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v) => `${v}h`}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="entries"
            orientation="right"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '13px',
            }}
            formatter={(value: number, name: string) => {
              if (name === 'hours') return [`${value}h`, 'Hours']
              return [value, 'Entries']
            }}
            labelFormatter={(label) => `Week of ${label}`}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '12px' }}
            formatter={(value) => (value === 'hours' ? 'Hours' : 'Entries')}
          />
          <Area
            yAxisId="hours"
            type="monotone"
            dataKey="hours"
            stroke="hsl(221, 83%, 53%)"
            fill="url(#hoursGrad)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'hsl(221, 83%, 53%)' }}
            activeDot={{ r: 5 }}
          />
          <Area
            yAxisId="entries"
            type="monotone"
            dataKey="entries"
            stroke="hsl(262, 83%, 58%)"
            fill="url(#entriesGrad)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'hsl(262, 83%, 58%)' }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
