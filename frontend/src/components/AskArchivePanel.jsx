import { useState, useEffect } from 'react'

const SUGGESTIONS = [
  { 
    title: 'Notas de instalação de RPC', 
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ), 
    prompt: 'Onde estao os passos de instalacao de RPC no Linux?'
  },
  { 
    title: 'Recentes sessões de código', 
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ), 
    prompt: 'O que eu andei codando ultimamente?'
  },
  { 
    title: 'Referências de trabalho', 
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ), 
    prompt: 'Mostre-me sites ou emails relacionados a trabalho.'
  }
]

export default function AskArchivePanel({ 
  onAsk, loading, answer, matches, onOpenMatch, provider,
  dateFrom, setDateFrom, dateTo, setDateTo 
}) {
  const [question, setQuestion] = useState('')
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    if (answer || matches?.length > 0) {
      setShowResults(true)
    }
  }, [answer, matches])

  const submit = (e) => {
    e.preventDefault()
    if (!question.trim() || loading) return
    onAsk(question.trim())
  }

  const handleSuggestion = (prompt) => {
    setQuestion(prompt)
    onAsk(prompt)
  }

  return (
    <div className="min-h-full w-full flex flex-col items-center p-8 md:p-20 pt-24 pb-40 relative transition-all duration-1000 bg-[#fcfaf7]">
      {/* Background Depth Layers */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(0,0,0,0.04)_100%)] pointer-events-none" />

      <div className={`w-full max-w-5xl transition-all duration-1000 transform ${showResults ? 'scale-95 opacity-0 pointer-events-none absolute' : 'scale-100 opacity-100'}`}>
        <div className="text-center space-y-6 mb-20 relative">
          <p className="text-[#b2bec3] text-[10px] font-bold tracking-[0.6em] uppercase opacity-80">The Archive Oracle</p>
          <h1 className="text-6xl md:text-8xl font-serif font-bold text-[#2d3436] tracking-tighter leading-tight">
            How <span className="italic font-normal serif text-[#dfe6e9]">can</span> I assist?
          </h1>
        </div>

        {/* Suggestion Cards with Depth */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSuggestion(s.prompt)}
              className="group relative transition-all duration-500 text-left"
            >
              <div className="absolute inset-0 bg-[#2d3436]/5 translate-x-2 translate-y-2 rounded-[2rem] blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500" />
              <div className="relative bg-white border border-[#f1f2f6] rounded-[2rem] p-10 h-64 flex flex-col justify-between shadow-[0_10px_30px_-10px_rgba(0,0,0,0.04)] group-hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.08)] group-hover:-translate-y-2 transition-all duration-500">
                <div className="text-[#2d3436] opacity-20 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110 origin-left">
                  {s.icon}
                </div>
                <div className="space-y-3">
                    <span className="text-2xl font-serif italic font-bold text-[#2d3436] leading-tight block">
                    {s.title}
                    </span>
                    <p className="text-[10px] text-[#b2bec3] font-bold uppercase tracking-widest opacity-60">Consult Archive</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Input Section - RESTORED PROMINENCE */}
      <div className={`w-full max-w-3xl transition-all duration-1000 z-20 ${showResults ? 'mb-12 mt-0' : 'mt-4'}`}>
        <form onSubmit={submit} className="relative group">
          <div className="absolute inset-0 bg-[#2d3436] rounded-[2.5rem] blur-3xl opacity-[0.04] group-hover:opacity-[0.08] transition-opacity" />
          
          <div className="relative bg-white rounded-[2.5rem] border border-[#f1f2f6] p-3 pl-10 flex items-center gap-4 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] group-focus-within:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.12)] transition-all duration-700">
            <svg className="w-6 h-6 text-[#b2bec3] opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Inquire of the archive..."
              className="flex-grow bg-transparent border-none text-[#2d3436] placeholder-[#dfe6e9] focus:ring-0 py-5 text-2xl font-serif italic"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="bg-[#2d3436] text-white h-16 px-12 rounded-[1.8rem] flex items-center justify-center hover:bg-black transition-all duration-500 disabled:opacity-30 shadow-xl shadow-[#2d3436]/20 text-xs font-bold uppercase tracking-[0.3em]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                "Inquire"
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      {showResults && (
        <div className="w-full max-w-5xl mt-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 flex flex-col gap-20">
          <div className="flex justify-between items-center border-b border-[#f1f2f6] pb-10">
             <button 
               onClick={() => { setShowResults(false); setQuestion(''); }} 
               className="group text-[#b2bec3] hover:text-[#2d3436] transition text-[10px] font-bold tracking-[0.4em] uppercase flex items-center gap-4"
             >
                <div className="w-12 h-12 rounded-full bg-white border border-[#f1f2f6] flex items-center justify-center group-hover:border-[#2d3436] transition-all shadow-sm group-hover:shadow-md">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7 7-7" />
                    </svg>
                </div>
                Return to Inquiry
             </button>
             {provider && (
               <div className="flex flex-col items-end">
                   <span className="text-[9px] text-[#b2bec3] font-bold uppercase tracking-[0.4em] mb-1">Archive Synthesis</span>
                   <span className="text-[10px] text-[#2d3436] font-serif italic opacity-60">Source: {provider}</span>
               </div>
             )}
          </div>

          <div className="space-y-24">
             <div className="space-y-10 relative text-center">
               <div className="relative max-w-4xl mx-auto bg-white/60 backdrop-blur-sm p-16 rounded-[4rem] border border-white/80 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.05)]">
                  <p className="text-3xl md:text-5xl text-[#2d3436] font-serif italic leading-[1.5] whitespace-pre-wrap tracking-tight">
                    {answer}
                  </p>
               </div>
             </div>

             {matches?.length > 0 && (
               <div className="space-y-12 pb-32">
                 <div className="flex items-center justify-center gap-8 opacity-40">
                    <div className="h-[1px] flex-grow bg-gradient-to-r from-transparent to-[#2d3436]" />
                    <p className="text-[#2d3436] text-[10px] font-bold uppercase tracking-[0.8em] whitespace-nowrap">Evidence Folios</p>
                    <div className="h-[1px] flex-grow bg-gradient-to-l from-transparent to-[#2d3436]" />
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                   {matches.map((m) => (
                     <button
                       key={m.id}
                       onClick={() => onOpenMatch(m)}
                       className="group flex flex-col space-y-6 text-left"
                     >
                       <div className="relative aspect-[16/10] bg-white p-3 border border-[#f1f2f6] shadow-[0_15px_35px_-15px_rgba(0,0,0,0.08)] group-hover:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.15)] group-hover:-translate-y-3 group-hover:rotate-1 transition-all duration-700 overflow-hidden">
                         {m.thumbnail_path ? (
                           <img 
                             src={`/thumbnails/${m.thumbnail_path.split('/').pop()}`} 
                             className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition duration-1000" 
                           />
                         ) : (
                           <div className="w-full h-full flex items-center justify-center text-[#dfe6e9] italic text-[10px]">Unrecorded</div>
                         )}
                       </div>
                       <div className="px-2 border-l-2 border-[#f1f2f6] pl-5 group-hover:border-[#2d3436] transition-colors">
                         <p className="text-[9px] text-[#b2bec3] font-bold mb-2 uppercase tracking-[0.3em]">Folio No. {m.id}</p>
                         <p className="text-sm text-[#2d3436] font-serif font-bold italic leading-tight truncate">{m.summary || m.filename}</p>
                       </div>
                     </button>
                   ))}
                 </div>
               </div>
             )}
          </div>
        </div>
      )}

      {/* Date Pill - Improved as a heavy physical seal */}
      <div className="fixed bottom-12 left-[22rem] right-0 flex justify-center items-center pointer-events-none z-40">
         <div className="flex items-center gap-8 bg-white border border-[#f1f2f6] px-10 py-4 rounded-full shadow-[0_15px_40px_-10px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_50px_-12px_rgba(0,0,0,0.12)] transition-all duration-500 pointer-events-auto group border-black/[0.03]">
            <span className="text-[10px] font-bold text-[#b2bec3] group-hover:text-[#2d3436] uppercase tracking-[0.5em] transition-colors">Archive Range</span>
            <div className="flex items-center gap-4">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-transparent border-none text-xs text-[#2d3436] focus:ring-0 p-0 w-28 font-serif italic font-bold"
                />
                <div className="w-px h-4 bg-[#f1f2f6]" />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent border-none text-xs text-[#2d3436] focus:ring-0 p-0 w-28 font-serif italic font-bold"
                />
            </div>
         </div>
      </div>
    </div>
  )
}
