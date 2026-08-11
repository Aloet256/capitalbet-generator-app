import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function FuelCostChart({ data }: { data: { label: string; cost: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" />
        <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
          formatter={(v: number) => [`UGX ${v.toLocaleString()}`, 'Fuel cost']}
        />
        <Line type="monotone" dataKey="cost" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
