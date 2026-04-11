interface SearchBarProps {
  onSearch: (query: string) => void
  query: string
}

export default function SearchBar({ onSearch, query }: SearchBarProps) {
  return (
    <div className="relative w-full max-w-2xl">
      <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
        <svg className="h-4 w-4 text-[#b2bec3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        type="text"
        placeholder="Recall a specific moment..."
        value={query}
        onChange={(e) => onSearch(e.target.value)}
        className="w-full bg-white border border-[#f1f2f6] rounded-full pl-14 pr-6 py-4 text-sm text-[#2d3436] placeholder-[#b2bec3] shadow-sm hover:shadow-md focus:shadow-lg focus:outline-none focus:border-[#dcdde1] transition-all duration-300 font-serif italic"
      />
      {query && (
        <button
          onClick={() => onSearch('')}
          className="absolute inset-y-0 right-0 pr-6 flex items-center text-[#b2bec3] hover:text-[#2d3436] transition"
          aria-label="Clear search"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
