import { useState, useEffect } from 'react'
import { getSettings, updateSettings, testConnection } from '../api'

export default function Settings({ onBack }) {
  const [settings, setSettings] = useState({
    ai_provider: 'ollama',
    ollama_base_url: 'http://localhost:11434',
    ollama_model: 'llava',
    openrouter_api_key: '',
    openrouter_model: 'openai/gpt-4o',
    gemini_api_key: '',
    gemini_model: 'gemini-2.0-flash',
    gemini_requests_per_minute: '8',
    ui_scale: '1.0',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    getSettings().then((res) => {
      setSettings((prev) => ({ ...prev, ...res.data }))
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings(settings)
      document.documentElement.style.fontSize = `${parseFloat(settings.ui_scale) * 16}px`
      onBack()
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testConnection(settings)
      setTestResult({ success: res.data.success, message: res.data.message })
    } catch (e) {
      setTestResult({ success: false, message: 'Connection failed' })
    } finally {
      setTesting(false)
    }
  }

  const scaleOptions = [
    { label: 'Small', value: '0.85' },
    { label: 'Standard', value: '1.0' },
    { label: 'Large', value: '1.15' },
    { label: 'Extra Large', value: '1.3' },
  ]

  const visionModels = ['llava', 'bakllava', 'moondream', 'llama3.2-vision', 'minicpm-v', 'vision']
  const isVisionModel = visionModels.some((m) => settings.ollama_model?.toLowerCase().includes(m))

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#fcfaf7]">
        <div className="w-8 h-8 border-2 border-[#2d3436] border-t-transparent rounded-full animate-spin"></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#fcfaf7] pb-32 overflow-y-auto">
      <header className="glass border-b border-[#f1f2f6] px-8 py-6 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[#636e72] hover:text-[#2d3436] transition font-medium text-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Archive
          </button>
          <h2 className="text-2xl font-serif font-bold text-[#2d3436]">Configuration</h2>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary px-10 py-3"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 space-y-16">
        <section className="space-y-8">
          <div className="space-y-2">
            <h3 className="text-xl font-serif font-bold text-[#2d3436]">Visual Comfort</h3>
            <p className="text-sm text-[#636e72]">Adjust the scale of the interface to suit your sight.</p>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {scaleOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSettings({ ...settings, ui_scale: opt.value })}
                className={`py-4 px-2 rounded-2xl border-2 transition-all duration-300 ${
                  settings.ui_scale === opt.value
                    ? 'border-[#2d3436] bg-white shadow-md font-bold'
                    : 'border-[#f1f2f6] bg-white/50 hover:border-[#dcdde1] text-[#636e72]'
                }`}
              >
                <div className="text-center">
                  <span className="text-sm">{opt.label}</span>
                  <p className="text-[10px] mt-1 opacity-50">{Math.round(parseFloat(opt.value)*100)}%</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-8">
          <div className="space-y-2">
            <h3 className="text-xl font-serif font-bold text-[#2d3436]">Oracle Selection</h3>
            <p className="text-sm text-[#636e72]">Choose the intelligence that will interpret your memories.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['ollama', 'openrouter', 'gemini'].map((provider) => (
              <button
                key={provider}
                onClick={() => setSettings({ ...settings, ai_provider: provider })}
                className={`p-8 rounded-3xl border-2 transition-all duration-300 text-left space-y-3 ${
                  settings.ai_provider === provider
                    ? 'border-[#2d3436] bg-white shadow-lg'
                    : 'border-[#f1f2f6] bg-white/50 hover:border-[#dcdde1]'
                }`}
              >
                <div className="flex items-center justify-between">
                    <span className="text-lg font-bold capitalize text-[#2d3436]">{provider}</span>
                    {settings.ai_provider === provider && (
                        <div className="w-3 h-3 rounded-full bg-[#2d3436]" />
                    )}
                </div>
                <p className="text-sm text-[#636e72] leading-relaxed italic font-serif">
                  {provider === 'ollama' 
                    ? 'Private and local. Your data never leaves this machine.' 
                    : provider === 'openrouter'
                      ? 'Cloud-powered excellence. Bring your own model.'
                      : 'Google Gemini API with modest free tier limits.'}
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="card p-10 space-y-10">
          {settings.ai_provider === 'ollama' ? (
            <div className="space-y-8">
              {!isVisionModel && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 space-y-2">
                  <p className="text-sm font-bold text-amber-800">Warning: Model may not support vision</p>
                  <p className="text-sm text-amber-700">
                    The model "<span className="font-mono font-bold">{settings.ollama_model}</span>" does not appear to support image input.
                    Use a vision-capable model like <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">llava</code>, <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">bakllava</code>, or <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">moondream</code>.
                  </p>
                  <p className="text-sm text-amber-700">
                    Run: <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">ollama pull llava</code>
                  </p>
                </div>
              )}
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Ollama Base URL</label>
                <input
                  type="text"
                  value={settings.ollama_base_url}
                  onChange={(e) => setSettings({ ...settings, ollama_base_url: e.target.value })}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="http://localhost:11434"
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Model Name</label>
                <input
                  type="text"
                  value={settings.ollama_model}
                  onChange={(e) => setSettings({ ...settings, ollama_model: e.target.value })}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="llava"
                />
              </div>
            </div>
          ) : settings.ai_provider === 'openrouter' ? (
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">OpenRouter API Key</label>
                <input
                  type="password"
                  value={settings.openrouter_api_key}
                  onChange={(e) => setSettings({ ...settings, openrouter_api_key: e.target.value })}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="sk-or-v1-..."
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Vision Model</label>
                <input
                  type="text"
                  value={settings.openrouter_model}
                  onChange={(e) => setSettings({ ...settings, openrouter_model: e.target.value })}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="openai/gpt-4o"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Gemini API Key</label>
                <input
                  type="password"
                  value={settings.gemini_api_key}
                  onChange={(e) => setSettings({ ...settings, gemini_api_key: e.target.value })}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="AIza..."
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Vision Model</label>
                <input
                  type="text"
                  value={settings.gemini_model}
                  onChange={(e) => setSettings({ ...settings, gemini_model: e.target.value })}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="gemini-2.0-flash"
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Requests Per Minute</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={settings.gemini_requests_per_minute}
                  onChange={(e) => setSettings({ ...settings, gemini_requests_per_minute: e.target.value })}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="8"
                />
              </div>
              <p className="text-xs text-[#8a9499] leading-relaxed px-1">
                Free tier has stricter request limits. The backend applies a per-minute guard for Gemini calls.
              </p>
            </div>
          )}

          <div className="pt-8 border-t border-[#f1f2f6] flex items-center justify-between">
            <button
              onClick={handleTest}
              disabled={testing}
              className="btn-secondary px-8"
            >
              {testing ? 'Testing Connection...' : 'Test Connection'}
            </button>
            
            {testResult && (
              <div
                className={`max-w-[60%] rounded-2xl border px-4 py-3 shadow-sm transition-all duration-300 ${
                  testResult.success
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-700'
                    : 'bg-rose-50/70 border-rose-200 text-rose-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${testResult.success ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em]">
                    {settings.ai_provider === 'openrouter' ? 'OpenRouter' : settings.ai_provider === 'gemini' ? 'Gemini' : 'Ollama'} Test
                  </p>
                </div>
                <p className="mt-2 text-sm leading-relaxed break-words">{testResult.message}</p>
              </div>
            )}
          </div>
        </section>

        <footer className="text-center pt-10">
            <p className="text-xs text-[#dfe6e9] uppercase tracking-[0.4em] font-bold">Mnemosyne Artifact v1.0.0</p>
        </footer>
      </main>

      <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-8 z-30">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full md:w-auto md:min-w-[220px] px-10 py-4 shadow-xl"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
