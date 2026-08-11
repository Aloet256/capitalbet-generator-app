import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function GeneratorTimeChart({ data }: { data: { label: string; hours: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" />
        <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" unit="h" />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}
          formatter={(v: number) => [`${v.toFixed(1)}h`, 'Generator time']}
        />
        <Bar dataKey="hours" fill="#2563eb" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
