import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts'

interface ProjectProgressProps {
  data: {
    name: string
    hours: number
    entries: number
    features_done: number
    features_total: number
  }[]
}

export function ProjectProgressChart({ data }: ProjectProgressProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No project work data
      </div>
    )
  }

  const formatted = data.map((d) => ({
    ...d,
    shortName: d.name.length > 20 ? d.name.slice(0, 18) + '…' : d.name,
    progress: d.features_total > 0 ? Math.round((d.features_done / d.features_total) * 100) : 0,
  }))

  const getBarColor = (progress: number) => {
    if (progress >= 80) return 'hsl(142, 71%, 45%)'
    if (progress >= 50) return 'hsl(262, 83%, 58%)'
    if (progress >= 25) return 'hsl(38, 92%, 50%)'
    return 'hsl(221, 83%, 53%)'
  }

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formatted}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            tickFormatter={(v) => `${v}h`}
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
            formatter={(value: number, _: string, props: any) => {
              const item = props.payload
              const feat = item.features_total > 0
                ? `${item.features_done}/${item.features_total} features`
                : 'No features tracked'
              return [`${value}h · ${item.entries} entries · ${feat}`, item.name]
            }}
            labelFormatter={() => ''}
          />
          <Bar dataKey="hours" radius={[0, 4, 4, 0]} barSize={20}>
            {formatted.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.progress)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
