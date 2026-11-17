import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const axis = { stroke: 'var(--muted)', fontSize: 11, tickLine: false, axisLine: false } as const
const tip = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)' } }

export default function Charts({ weight, volume }: { weight: { d: string; w: number; avg: number }[]; volume: { d: string; v: number }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="h-56" aria-hidden>
        <ResponsiveContainer>
          <AreaChart data={weight}>
            <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="d" {...axis} /><YAxis domain={['dataMin - 1', 'dataMax + 1']} width={36} {...axis} />
            <Tooltip {...tip} />
            <Area type="monotone" dataKey="avg" name="7-day avg" stroke="var(--accent)" strokeWidth={3} fill="url(#g)" isAnimationActive />
            <Area type="monotone" dataKey="w" name="Weight" stroke="var(--muted)" strokeWidth={1} fill="none" dot={{ r: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="h-56" aria-hidden>
        <ResponsiveContainer>
          <BarChart data={volume}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="d" {...axis} /><YAxis width={40} {...axis} />
            <Tooltip {...tip} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="v" name="Volume" fill="var(--accent)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
