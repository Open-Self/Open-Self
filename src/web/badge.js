/**
 * Shareable Clone Score Badge — SVG Generator
 */

/**
 * Generate an SVG badge for Clone Score
 */
export function generateBadge(name, score, options = {}) {
    const grade = getGrade(score);
    const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';
    const bgColor = options.dark ? '#1a1a2e' : '#0f172a';
    const width = 280;
    const height = 32;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
      <stop offset="100%" style="stop-color:#16213e;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="score" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${color};stop-opacity:0.8" />
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="6" fill="url(#bg)"/>
  <rect x="${width - 90}" width="90" height="${height}" rx="0" fill="url(#score)"/>
  <rect x="${width - 90}" width="1" height="${height}" fill="${color}" opacity="0.3"/>
  <rect x="${width - 90 + 89}" width="1" height="${height}" rx="6" fill="${color}"/>
  <text x="10" y="21" fill="#a5b4fc" font-family="sans-serif" font-size="12" font-weight="600">🧑 OpenSelf</text>
  <text x="100" y="21" fill="#94a3b8" font-family="sans-serif" font-size="11">${name}</text>
  <text x="${width - 80}" y="21" fill="white" font-family="sans-serif" font-size="13" font-weight="700">${score}% ${grade}</text>
</svg>`;
}

function getGrade(score) {
    if (score >= 95) return 'A+';
    if (score >= 90) return 'A';
    if (score >= 85) return 'A-';
    if (score >= 80) return 'B+';
    if (score >= 75) return 'B';
    if (score >= 70) return 'B-';
    return 'C';
}
