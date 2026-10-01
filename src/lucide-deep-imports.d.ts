/**
 * Ambient types for lucide-react's per-icon ESM entry points.
 *
 * The app imports individual icons via `lucide-react/dist/esm/icons/<name>`
 * rather than the package barrel so tree-shaking can drop unused icons
 * (see #173). Those deep entry points ship no declaration files, so without
 * this declaration TypeScript reports TS7016 for every one of them.
 */
declare module 'lucide-react/dist/esm/icons/*' {
  import type { LucideIcon } from 'lucide-react'
  const icon: LucideIcon
  export default icon
}
