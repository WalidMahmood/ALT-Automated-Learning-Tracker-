import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

interface ApprovalDonutProps {
  data: {
    approved: number
    pending: number
    rejected: number
    flagged: number
  }
}

const COLORS: Record<string, string> = {
  approved: 'hsl(142, 71%, 45%)',
  pending: 'hsl(38, 92%, 50%)',
  rejected: 'hsl(0, 84%, 60%)',
  flagged: 'hsl(0, 72%, 50%)',
}

const LABELS: Record<string, string> = {
  approved: 'Approved',
  pending: 'Pending',
  rejected: 'Rejected',
  flagged: 'Flagged',
}

export function ApprovalDonutChart({ data }: ApprovalDonutProps) {
  // Combine rejected + flagged into one category
  const combined = {
    approved: data.approved,
    pending: data.pending,
    rejected: data.rejected + data.flagged,
  }

  const chartData = Object.entries(combined)
    .filter(([_, value]) => value > 0)
    .map(([key, value]) => ({
      name: LABELS[key] || key,
      value,
      color: COLORS[key] || 'hsl(var(--muted-foreground))',
    }))

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
        No entries in this period
      </div>
    )
  }

  const total = chartData.reduce((sum, d) => sum + d.value, 0)

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
            paddingAngle={3}
            dataKey="value"
            strokeWidth={2}
            stroke="hsl(var(--background))"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value} entries (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
              name,
            ]}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          />
          <Legend
            formatter={(value, entry: any) => {
              const count = entry?.payload?.value || 0
              return `${value} (${count})`
            }}
            wrapperStyle={{ fontSize: '12px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
