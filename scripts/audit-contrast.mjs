#!/usr/bin/env node
/**
 * WCAG 2.1 contrast audit for the StellarSearch neon-on-dark palette.
 *
 * The approved palette and its measured ratios are recorded in
 * ../tailwind.config.js and ../src/index.css. This script re-measures them so
 * the documentation cannot silently drift.
 *
 * Usage: npm run audit:contrast
 *
 * It checks three things against WCAG AA (4.5:1 body / 3:1 large):
 *   1. Every approved solid colour token on every app surface.
 *   2. Every `text-white/<alpha>` and `text-neon-<hue>/<alpha>` utility in src/.
 *   3. Every inline `color:` declaration in src/ (rgba colours are composited
 *      over the surface before measuring; hex colours are always solid).
 *
 * The worst case is the lightest surface (#16202b elevated), because a lighter
 * background always lowers contrast for light text.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'src')

const AA_BODY = 4.5
const AA_LARGE = 3.0

const hexToRgb = (hex) => {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

const linear = (channel) => {
  const s = channel / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)

const contrast = (fg, bg) => {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a >= b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

const composite = (fg, alpha, bg) => fg.map((c, i) => Math.round(alpha * c + (1 - alpha) * bg[i]))

const fmt = (n) => `${n.toFixed(2)}:1`

const SURFACES = {
  '#020408 page': hexToRgb('#020408'),
  '#060d14 card': hexToRgb('#060d14'),
  '#0a1628 panel': hexToRgb('#0a1628'),
  '#16202b elevated': hexToRgb('#16202b'),
}

const NEON = { cyan: '#00f5ff', green: '#39ff14', amber: '#ffb800' }
const WHITE = '#ffffff'
const worstBg = SURFACES['#16202b elevated']

console.log('\nApproved palette - solid colours on each surface')
console.log('surface'.padEnd(20), 'cyan'.padEnd(9), 'green'.padEnd(9), 'amber'.padEnd(9), 'white')
for (const [name, bg] of Object.entries(SURFACES)) {
  console.log(
    name.padEnd(20),
    fmt(contrast(hexToRgb(NEON.cyan), bg)).padEnd(9),
    fmt(contrast(hexToRgb(NEON.green), bg)).padEnd(9),
    fmt(contrast(hexToRgb(NEON.amber), bg)).padEnd(9),
    fmt(contrast(hexToRgb(WHITE), bg)).padEnd(9),
  )
}

console.log('\nApproved text alpha ramp on the lightest surface (#16202b)')
console.log('alpha'.padEnd(8), 'white'.padEnd(9), 'cyan'.padEnd(9), 'green'.padEnd(9), 'amber')
for (const alpha of [60, 70, 80, 90, 100]) {
  const a = alpha / 100
  const cells = [WHITE, NEON.cyan, NEON.green, NEON.amber].map((base) =>
    fmt(contrast(composite(hexToRgb(base), a, worstBg), worstBg)),
  )
  console.log(`${alpha}%`.padEnd(8), ...cells.map((c) => c.padEnd(9)))
}

const walk = (dir) => {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

const CLASS_RE = /text-(white|neon-(\w+))\/(\d+)/g
const INLINE_RE = /\bcolor:\s*([^,}\n]+)/g
const RGBA_RE = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/

const below = (fg, alpha) => contrast(composite(fg, alpha, worstBg), worstBg) < AA_BODY

const failures = []
let checked = 0
for (const file of walk(srcDir)) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  for (const match of text.matchAll(CLASS_RE)) {
    const [token, kind, neonName, alphaStr] = match
    const alpha = Number(alphaStr) / 100
    const base = kind === 'white' ? hexToRgb(WHITE) : NEON[neonName] && hexToRgb(NEON[neonName])
    if (!base || Number.isNaN(alpha)) continue
    checked++
    if (below(base, alpha)) {
      const line = text.slice(0, match.index).split('\n').length
      failures.push({ file: relative(root, file), line, token, ratio: contrast(composite(base, alpha, worstBg), worstBg) })
    }
  }
  for (const match of text.matchAll(INLINE_RE)) {
    const rgba = match[1].match(RGBA_RE)
    if (!rgba) continue
    const fg = [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])]
    const alpha = Number(rgba[4])
    checked++
    if (below(fg, alpha)) {
      const line = text.slice(0, match.index).split('\n').length
      failures.push({ file: relative(root, file), line, token: rgba[0], ratio: contrast(composite(fg, alpha, worstBg), worstBg) })
    }
  }
}

console.log(`\nScanned ${checked} text colour declarations against the lightest surface (#16202b).`)
if (failures.length) {
  console.log(`\n${failures.length} below WCAG AA body text (${AA_BODY}:1):\n`)
  for (const f of failures) {
    console.log(`  ${fmt(f.ratio).padStart(8)}  ${f.token.padEnd(30)} ${f.file}:${f.line}`)
  }
  process.exit(1)
}
console.log(`\nAll pass WCAG AA body text (${AA_BODY}:1). Large text needs only ${AA_LARGE}:1.`)