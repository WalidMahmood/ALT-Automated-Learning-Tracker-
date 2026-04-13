import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

interface DailyActivityProps {
  data: {
    date: string
    hours: number
    lnd_hours: number
    sbu_hours: number
    entries: number
  }[]
}

export function DailyActivityChart({ data }: DailyActivityProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
        No daily activity data
      </div>
    )
  }

  // Format dates for display
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  }))

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formatted} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}h`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '13px',
            }}
            formatter={(value: number, name: string) => [
              `${value}h`,
              name === 'lnd_hours' ? 'L&D' : name === 'sbu_hours' ? 'SBU' : name,
            ]}
            labelFormatter={(label) => label}
          />
          <Legend
            formatter={(value) =>
              value === 'lnd_hours' ? 'L&D Hours' : value === 'sbu_hours' ? 'SBU Hours' : value
            }
            wrapperStyle={{ fontSize: '12px' }}
          />
          <Bar
            dataKey="lnd_hours"
            fill="hsl(221, 83%, 53%)"
            radius={[4, 4, 0, 0]}
            stackId="hours"
          />
          <Bar
            dataKey="sbu_hours"
            fill="hsl(25, 95%, 53%)"
            radius={[4, 4, 0, 0]}
            stackId="hours"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
