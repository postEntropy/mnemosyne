import { useState, useEffect, type ChangeEvent } from 'react'
import { getSettings, updateSettings, testConnection } from '../api.ts'
import type { Settings as SettingsType } from '../types/index.ts'

interface SettingsProps {
  onBack: () => void
}

interface TestResult {
  success: boolean
  message: string
}

interface ScaleOption {
  label: string
  value: string
}

type AiProvider = 'ollama' | 'openrouter' | 'gemini'
type AskProvider = 'openrouter' | 'ollama' | 'gemini'
type AiConfigView = 'analysis' | 'ask'
type AskMode = 'quick' | 'balanced' | 'deep'

export default function Settings({ onBack }: SettingsProps) {
  const [settings, setSettings] = useState<SettingsType>({
    ai_provider: 'ollama',
    ask_provider: 'openrouter',
    ask_openrouter_model: 'qwen/qwen3.6-plus',
    ask_default_mode: 'balanced',
    ask_quick_limit: '400',
    ask_balanced_limit: '2000',
    ask_deep_limit: '10000',
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
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [aiConfigView, setAiConfigView] = useState<AiConfigView>('analysis')

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
      const res = await testConnection(settings as unknown as Record<string, unknown>)
      setTestResult({ success: res.data.success, message: res.data.message })
    } catch (e) {
      setTestResult({ success: false, message: 'Connection failed' })
    } finally {
      setTesting(false)
    }
  }

  const scaleOptions: ScaleOption[] = [
    { label: 'Small', value: '0.85' },
    { label: 'Standard', value: '1.0' },
    { label: 'Large', value: '1.15' },
    { label: 'Extra Large', value: '1.3' },
  ]

  const visionModels = ['llava', 'bakllava', 'moondream', 'llama3.2-vision', 'minicpm-v', 'vision']
  const isVisionModel = visionModels.some((m) => settings.ollama_model?.toLowerCase().includes(m))
  const askProviders: AskProvider[] = ['openrouter', 'ollama', 'gemini']

  const updateSetting = <K extends keyof SettingsType>(key: K, value: SettingsType[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

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
                onClick={() => updateSetting('ui_scale', opt.value)}
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

        <section className="card p-10 space-y-10">
          <div className="space-y-2">
            <h3 className="text-xl font-serif font-bold text-[#2d3436]">AI Configuration</h3>
            <p className="text-sm text-[#636e72]">Use one workspace and switch between Analysis AI and Ask Mnemosyne.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-[#ece7dd] bg-white/70 p-2">
            <button
              type="button"
              onClick={() => setAiConfigView('analysis')}
              className={`rounded-xl py-3 text-[11px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${
                aiConfigView === 'analysis'
                  ? 'bg-[#1a1c1d] text-white shadow'
                  : 'text-[#7f868d] hover:text-[#1a1c1d]'
              }`}
            >
              Analysis AI
            </button>
            <button
              type="button"
              onClick={() => setAiConfigView('ask')}
              className={`rounded-xl py-3 text-[11px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${
                aiConfigView === 'ask'
                  ? 'bg-[#1a1c1d] text-white shadow'
                  : 'text-[#7f868d] hover:text-[#1a1c1d]'
              }`}
            >
              Ask Mnemosyne
            </button>
          </div>

          {aiConfigView === 'analysis' ? (
            <>
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.25em]">Provider</p>
                <p className="text-sm text-[#636e72]">Choose which provider powers screenshot analysis.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(['ollama', 'openrouter', 'gemini'] as AiProvider[]).map((provider) => (
                  <button
                    key={provider}
                    onClick={() => updateSetting('ai_provider', provider)}
                    className={`min-h-[172px] p-8 rounded-3xl border-2 transition-all duration-300 text-left space-y-3 ${
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

              {settings.ai_provider === 'ollama' ? (
            <div className="space-y-8">
              {!isVisionModel && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-6 space-y-2">
                  <p className="text-sm font-bold text-amber-800">Warning: Model may not support vision</p>
                  <p className="text-sm text-amber-700">
                    The model <code className="font-mono font-bold">&ldquo;{settings.ollama_model}&rdquo;</code> does not appear to support image input.
                    Use a vision-capable model like <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">llava</code>, <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">bakllava</code>, or <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">moondream</code>.
                  </p>
                  <p className="text-sm text-amber-700">
                    Run: <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">ollama pull llava</code>
                  </p>
                </div>
              )}
              <div className="space-y-3">
                <label htmlFor="ollama-base-url" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Ollama Base URL</label>
                <input
                  id="ollama-base-url"
                  type="text"
                  value={settings.ollama_base_url}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('ollama_base_url', e.target.value)}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="http://localhost:11434"
                />
              </div>
              <div className="space-y-3">
                <label htmlFor="ollama-model" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Model Name</label>
                <input
                  id="ollama-model"
                  type="text"
                  value={settings.ollama_model}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('ollama_model', e.target.value)}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="llava"
                />
              </div>
            </div>
          ) : settings.ai_provider === 'openrouter' ? (
            <div className="space-y-8">
              <div className="space-y-3">
                <label htmlFor="openrouter-api-key" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">OpenRouter API Key</label>
                <input
                  id="openrouter-api-key"
                  type="password"
                  value={settings.openrouter_api_key}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('openrouter_api_key', e.target.value)}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="sk-or-v1-..."
                />
              </div>
              <div className="space-y-3">
                <label htmlFor="openrouter-model" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Vision Model</label>
                <input
                  id="openrouter-model"
                  type="text"
                  value={settings.openrouter_model}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('openrouter_model', e.target.value)}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="openai/gpt-4o"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="space-y-3">
                <label htmlFor="gemini-api-key" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Gemini API Key</label>
                <input
                  id="gemini-api-key"
                  type="password"
                  value={settings.gemini_api_key}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('gemini_api_key', e.target.value)}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="AIza..."
                />
              </div>
              <div className="space-y-3">
                <label htmlFor="gemini-model" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Vision Model</label>
                <input
                  id="gemini-model"
                  type="text"
                  value={settings.gemini_model}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('gemini_model', e.target.value)}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="gemini-2.0-flash"
                />
              </div>
              <div className="space-y-3">
                <label htmlFor="gemini-rpm" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Requests Per Minute</label>
                <input
                  id="gemini-rpm"
                  type="number"
                  min="1"
                  max="60"
                  value={settings.gemini_requests_per_minute}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('gemini_requests_per_minute', e.target.value)}
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
            </>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-[#b2bec3] uppercase tracking-[0.25em]">Provider</p>
                <p className="text-sm text-[#636e72]">Select the Ask runtime provider and context strategy.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {askProviders.map((provider) => {
                  const isSelected = settings.ask_provider === provider
                  const isEnabled = provider === 'openrouter'
                  return (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => isEnabled && updateSetting('ask_provider', provider)}
                      disabled={!isEnabled}
                      className={`min-h-[172px] p-8 rounded-3xl border-2 transition-all duration-300 text-left space-y-3 ${
                        isSelected
                          ? 'border-[#2d3436] bg-white shadow-md'
                          : isEnabled
                            ? 'border-[#f1f2f6] bg-white/60 hover:border-[#dcdde1]'
                            : 'border-[#f1f2f6] bg-[#f7f7f7] text-[#a3abb2] cursor-not-allowed opacity-70'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold capitalize text-[#2d3436]">{provider}</span>
                        {isSelected && <div className="w-3 h-3 rounded-full bg-[#2d3436]" />}
                      </div>
                      <p className="text-sm text-[#636e72] leading-relaxed italic font-serif">
                        {provider === 'openrouter'
                          ? 'Primary Ask runtime with large context support.'
                          : 'Reserved for future Ask fallback.'}
                      </p>
                    </button>
                  )
                })}
              </div>

              <div className="space-y-3">
                <label htmlFor="ask-openrouter-model" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Ask Model (OpenRouter)</label>
                <input
                  id="ask-openrouter-model"
                  type="text"
                  value={settings.ask_openrouter_model}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('ask_openrouter_model', e.target.value)}
                  className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  placeholder="qwen/qwen3.6-plus"
                />
              </div>

              <div className="space-y-3">
                <label htmlFor="ask-default-mode" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Default Ask Mode</label>
                <div id="ask-default-mode" className="grid grid-cols-3 gap-3">
                  {(['quick', 'balanced', 'deep'] as AskMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => updateSetting('ask_default_mode', mode)}
                      className={`py-3 px-4 rounded-2xl border-2 transition-all duration-300 text-xs font-bold uppercase tracking-[0.15em] ${
                        settings.ask_default_mode === mode
                          ? 'border-[#2d3436] bg-white shadow-md text-[#2d3436]'
                          : 'border-[#f1f2f6] bg-white/50 hover:border-[#dcdde1] text-[#636e72]'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label htmlFor="ask-quick-limit" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Quick Limit</label>
                  <input
                    id="ask-quick-limit"
                    type="number"
                    min="50"
                    step="50"
                    value={settings.ask_quick_limit}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('ask_quick_limit', e.target.value)}
                    className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="ask-balanced-limit" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Balanced Limit</label>
                  <input
                    id="ask-balanced-limit"
                    type="number"
                    min="100"
                    step="100"
                    value={settings.ask_balanced_limit}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('ask_balanced_limit', e.target.value)}
                    className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="ask-deep-limit" className="text-xs font-bold text-[#b2bec3] uppercase tracking-widest px-1">Deep Limit</label>
                  <input
                    id="ask-deep-limit"
                    type="number"
                    min="100"
                    step="100"
                    value={settings.ask_deep_limit}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => updateSetting('ask_deep_limit', e.target.value)}
                    className="w-full bg-[#fcfaf7] border border-[#f1f2f6] rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-[#dcdde1] transition shadow-inner"
                  />
                </div>
              </div>

              <p className="text-xs text-[#8a9499] leading-relaxed px-1">
                These limits control how many processed screenshots are considered before Ask Mnemosyne synthesizes an answer.
              </p>
            </>
          )}
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
