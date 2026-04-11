/**
 * Preload critical assets (Google Fonts, paper texture) and cache them.
 * If the network is unavailable, CSS fallbacks will be used.
 * Call this once during app initialization.
 */
export function preloadCriticalAssets() {
  // Preload Google Fonts
  const fontLink = document.createElement('link')
  fontLink.rel = 'stylesheet'
  fontLink.href =
    'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&display=swap'
  fontLink.onerror = () => {
    console.warn('[assets] Google Fonts failed to load. Using system fallbacks.')
    document.documentElement.classList.add('fonts-failed')
  }
  document.head.appendChild(fontLink)

  // Preload paper texture
  const textureLink = document.createElement('link')
  textureLink.rel = 'preload'
  textureLink.as = 'image'
  textureLink.href = 'https://www.transparenttextures.com/patterns/natural-paper.png'
  textureLink.onerror = () => {
    console.warn('[assets] Paper texture failed to load. Using solid color fallback.')
    document.documentElement.classList.add('texture-failed')
  }
  document.head.appendChild(textureLink)
}
