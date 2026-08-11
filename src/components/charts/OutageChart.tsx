import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function OutageChart({ data }: { data: { label: string; outages: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="outageFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" />
        <YAxis tick={{ fontSize: 12 }} stroke="currentColor" className="text-slate-500" allowDecimals={false} />
        <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }} />
        <Area type="monotone" dataKey="outages" stroke="#f59e0b" strokeWidth={2.5} fill="url(#outageFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
