import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

interface UserBreakdownProps {
  data: {
    name: string
    hours: number
    entries: number
    approval_rate: number
  }[]
}

export function UserBreakdownChart({ data }: UserBreakdownProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No user data
      </div>
    )
  }

  const formatted = data.map((d) => ({
    ...d,
    shortName: d.name.length > 15 ? d.name.slice(0, 13) + '…' : d.name,
  }))

  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formatted}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
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
            width={110}
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
              return [
                `${value}h · ${item.entries} entries · ${item.approval_rate}% approved`,
                item.name,
              ]
            }}
            labelFormatter={() => ''}
          />
          <Bar dataKey="hours" fill="hsl(221, 83%, 53%)" radius={[0, 4, 4, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
