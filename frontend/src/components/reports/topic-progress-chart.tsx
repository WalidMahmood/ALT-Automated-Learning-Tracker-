import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

interface TopicProgressProps {
  data: {
    name: string
    coverage_pct: number
    hours: number
    benchmark_hours: number
  }[]
}

export function TopicProgressChart({ data }: TopicProgressProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-muted-foreground text-sm">
        No topic progress data
      </div>
    )
  }

  // Truncate long topic names
  const formatted = data.map((d) => ({
    ...d,
    shortName: d.name.length > 20 ? d.name.slice(0, 18) + '…' : d.name,
  }))

  // Color based on coverage
  const getBarColor = (coverage: number) => {
    if (coverage >= 80) return 'hsl(142, 71%, 45%)'  // green
    if (coverage >= 50) return 'hsl(221, 83%, 53%)'  // blue
    if (coverage >= 25) return 'hsl(38, 92%, 50%)'   // amber
    return 'hsl(var(--muted-foreground))'             // gray
  }

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formatted}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v) => `${v}%`}
            axisLine={{ stroke: 'hsl(var(--border))' }}
          />
          <YAxis
            type="category"
            dataKey="shortName"
            width={120}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '13px',
            }}
            formatter={(value: number, _: string, props: any) => [
              `${value}% coverage`,
              props.payload.name,
            ]}
            labelFormatter={() => ''}
          />
          <Bar dataKey="coverage_pct" radius={[0, 4, 4, 0]} barSize={20}>
            {formatted.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.coverage_pct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
