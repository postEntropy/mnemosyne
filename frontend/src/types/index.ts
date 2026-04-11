export interface Screenshot {
  id: number
  filename: string
  file_path: string
  description: string
  application: string
  tags: string | string[]
  summary: string
  timestamp: string
  processed_at: string | null
  status: 'pending' | 'processing' | 'processed' | 'error' | 'ignored'
  thumbnail_path: string | null
  error_message: string | null
}

export interface Stats {
  total: number
  processed: number
  pending: number
  processing: number
  errors: number
  top_apps: { app: string; count: number }[]
  db_total_tokens_estimate?: number
  token_count_updated_at?: string
  tokenizer_name?: string
}

export interface Settings {
  ai_provider: string
  ask_provider: string
  ask_openrouter_model: string
  ask_default_mode: string
  ask_quick_limit: string
  ask_balanced_limit: string
  ask_deep_limit: string
  ollama_base_url: string
  ollama_model: string
  openrouter_api_key: string
  openrouter_model: string
  gemini_api_key: string
  gemini_model: string
  gemini_requests_per_minute: string
  ui_scale: string
}

export interface ScanProgress {
  queued: number
  total: number
  done: number
  current_file: string | null
}

export interface OnboardingInfo {
  unregistered: number
}

export interface AskEntry {
  id: number
  question: string
  answer: string
  matches: Screenshot[]
  provider: string
  contextItems: number
  retrievedItems: number
  createdAt: string
}

export interface AskSuggestion {
  title: string
  prompt: string
  kind: string
}

export interface AiDisplay {
  summary: string
  description: string
  tags: string[]
}

export interface HealthCheck {
  status: string
  database: string
  watcher_dir: string
  thumbnails_dir: string
}

export interface StatusInfo {
  is_paused: boolean
  watcher_paused: boolean
  queue_size: number
  dead_letter_count: number
}
