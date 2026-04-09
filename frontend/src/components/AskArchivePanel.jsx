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
  onAsk, loading, answer, matches, onOpenMatch, provider 
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
    <div
      className={`w-full flex flex-col items-center relative transition-all duration-1000 bg-[#fcfaf7] ${
        showResults ? 'min-h-full justify-start p-10 md:p-16 pt-16 pb-32' : 'min-h-[100vh] justify-center p-10 md:p-16 py-16'
      }`}
    >
      {/* Subtle Background Paper Depth */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/natural-paper.png')]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(15,23,42,0.02)_100%)] pointer-events-none" />

      <div className={`w-full max-w-5xl transition-all duration-1000 transform ${showResults ? 'scale-95 opacity-0 pointer-events-none absolute' : 'scale-100 opacity-100'}`}>
        <div className="text-center space-y-6 mb-16 relative animate-in fade-in slide-in-from-top-4 duration-1000">
          <p className="text-[#b45309] text-[9px] font-bold tracking-[0.55em] uppercase glow-amber-text">The Archive Oracle</p>
          <h1 className="text-5xl md:text-6xl font-serif font-bold text-[#1a1c1d] tracking-tighter leading-tight">
            How <span className="italic font-normal serif text-[#5e6472]">can</span> I assist?
          </h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => handleSuggestion(s.prompt)}
              className="group relative transition-all duration-700 text-left animate-in fade-in slide-in-from-bottom-8 duration-1000"
              style={{ animationDelay: `${i * 150}ms` }}
            >
              <div className="relative card-premium p-10 h-64 flex flex-col justify-between group-hover:bg-white transition-all duration-700 overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#b45309]/5 rounded-full -translate-y-16 translate-x-16 blur-2xl group-hover:scale-150 transition-transform duration-1000" />
                <div className="text-[#b45309] opacity-30 group-hover:opacity-100 transition-all duration-700 group-hover:scale-110 origin-left">
                  {s.icon}
                </div>
                <div className="space-y-4">
                    <span className="text-xl font-serif italic font-bold text-[#1a1c1d] leading-tight block group-hover:text-[#5e6472] transition-colors">
                    {s.title}
                    </span>
                    <p className="text-[9px] text-[#94a3b8] font-bold uppercase tracking-[0.2em] opacity-40 group-hover:text-[#b45309] group-hover:opacity-100 transition-all">Consult Archive</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={`w-full max-w-3xl transition-all duration-1000 z-20 ${showResults ? 'mb-14 mt-0' : 'mt-2'}`}>
        <form onSubmit={submit} className="relative group">
          <div className="absolute inset-0 bg-[#1a1c1d] rounded-3xl blur-[80px] opacity-[0.025] group-focus-within:opacity-[0.06] transition-opacity" />
          <div className="relative bg-white/80 backdrop-blur-xl rounded-3xl border border-[#e8e2d9] p-3 pl-10 flex items-center gap-6 shadow-[0_22px_50px_-18px_rgba(15,23,42,0.08)] group-focus-within:border-[#1a1c1d]/30 transition-all duration-700">
            <svg className="w-5 h-5 text-[#5e6472]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Inquire of the archive..."
              className="flex-grow bg-transparent border-none text-[#1a1c1d] placeholder-[#94999e] focus:ring-0 py-4 text-lg font-serif italic"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="btn-ink-soft h-12 px-10 rounded-2xl flex items-center justify-center disabled:opacity-20 text-[10px] font-bold uppercase tracking-[0.3em]"
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

      {showResults && (
        <div className="w-full max-w-5xl mt-24 animate-in fade-in slide-in-from-bottom-16 duration-1000 flex flex-col gap-32">
          <div className="flex justify-between items-center border-b border-[#e8e2d9] pb-16">
             <button 
               onClick={() => { setShowResults(false); setQuestion(''); }} 
               className="group text-[#94a3b8] hover:text-[#0f172a] transition text-[9px] font-bold tracking-[0.5em] uppercase flex items-center gap-6"
             >
                <div className="w-14 h-14 rounded-2xl bg-white border border-[#e8e2d9] flex items-center justify-center group-hover:border-[#1a1c1d] group-hover:bg-[#1a1c1d]/5 transition-all shadow-sm">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7 7-7" />
                    </svg>
                </div>
                Return to Inquiry
             </button>
             {provider && (
               <div className="flex flex-col items-end opacity-60">
                   <span className="text-[9px] text-[#b45309] font-bold uppercase tracking-[0.5em] mb-1">Archive Synthesis</span>
                   <span className="text-[10px] text-[#0f172a] font-serif italic">Source: {provider}</span>
               </div>
             )}
          </div>

          <div className="space-y-32">
             <div className="relative">
               <div className="relative max-w-4xl mx-auto paper-illuminated p-24 md:p-32 transform -rotate-1 group hover:rotate-0 transition-all duration-1000">
                  <p className="text-4xl md:text-5xl text-[#0f172a] font-serif italic leading-[1.7] whitespace-pre-wrap tracking-tight animate-type">
                    {answer}
                  </p>
                  <div className="absolute bottom-16 right-16 w-24 h-24 border-4 border-[#b45309]/20 rounded-full flex items-center justify-center -rotate-12">
                     <div className="text-[10px] font-bold text-[#b45309]/30 uppercase tracking-tighter text-center leading-none">
                       Archive<br/>Verified
                     </div>
                  </div>
               </div>
             </div>

             {matches?.length > 0 && (
               <div className="space-y-20 pb-48">
                 <div className="flex items-center justify-center gap-12 opacity-30">
                    <div className="h-px flex-grow bg-gradient-to-r from-transparent to-[#1a1c1d]" />
                    <p className="text-[#1a1c1d] text-[10px] font-bold uppercase tracking-[1.5em] whitespace-nowrap ml-[1.5em]">Evidence Folios</p>
                    <div className="h-px flex-grow bg-gradient-to-l from-transparent to-[#1a1c1d]" />
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-16">
                   {matches.map((m) => (
                     <button
                       key={m.id}
                       onClick={() => onOpenMatch(m)}
                       className="group flex flex-col space-y-8 text-left"
                     >
                        <div className="relative aspect-[16/10] bg-white p-3 border border-[#e8e2d9] shadow-[0_15px_40px_-15px_rgba(15,23,42,0.06)] group-hover:shadow-[0_50px_100px_-25px_rgba(15,23,42,0.12)] group-hover:-translate-y-6 group-hover:rotate-2 transition-all duration-700 overflow-hidden rounded-3xl group-hover:border-[#1a1c1d]/20">
                         {m.thumbnail_path ? (
                           <img 
                             src={`/thumbnails/${m.thumbnail_path.split('/').pop()}`} 
                             className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition duration-1000" 
                           />
                         ) : (
                           <div className="w-full h-full flex items-center justify-center text-[#94a3b8] italic text-[10px]">Unrecorded</div>
                         )}
                       </div>
                       <div className="px-2 border-l-2 border-[#e8e2d9] pl-8 group-hover:border-[#b45309] transition-colors duration-700">
                         <p className="text-[8px] text-[#b45309] font-bold mb-3 uppercase tracking-[0.4em]">Folio No. {m.id}</p>
                        <p className="text-lg text-[#1a1c1d] font-serif font-bold italic leading-tight truncate group-hover:text-[#5e6472] transition-colors">{m.summary || m.filename}</p>
                       </div>
                     </button>
                   ))}
                 </div>
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  )
}
