import type { Stats } from '../types/index.ts'

interface StatsProps {
  stats: Stats | null
  isCompact?: boolean
}

interface StatItem {
  label: string
  value: number
  color: string
  icon: string
}

export default function Stats({ stats, isCompact = false }: StatsProps) {
  if (!stats) return (
    <div className="px-4 space-y-3 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-12 bg-white rounded-xl border border-[#f1f2f6]" />
      ))}
    </div>
  )

  const items: StatItem[] = [
    { label: 'Total', value: stats.total || 0, color: 'text-[#2d3436]', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { label: 'Processed', value: stats.processed || 0, color: 'text-green-600', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Queue', value: (stats.processing || 0) + (stats.pending || 0), color: 'text-amber-500', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Failed', value: stats.errors || 0, color: 'text-rose-500', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  ]

  if (isCompact) {
    return (
      <div className="px-2 space-y-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between px-4 py-2 hover:bg-white rounded-xl transition group">
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 flex-shrink-0 text-[#b2bec3] group-hover:text-[#2d3436] transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              <span className="text-xs font-medium text-[#636e72] group-hover:text-[#2d3436] transition">{item.label}</span>
            </div>
            <span className={`text-xs font-bold font-serif ${item.color}`}>
              {item.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {items.map((item) => (
        <div key={item.label} className="card p-6 bg-white/50">
          <p className="text-xs uppercase tracking-widest font-bold text-[#b2bec3] mb-1">
            {item.label}
          </p>
          <p className={`text-4xl font-serif font-bold ${item.color}`}>
            {item.value.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  )
}
