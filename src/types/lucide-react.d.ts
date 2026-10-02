// lucide-react ships per-icon ESM entry points without declaration files.
// Several components deep-import icons from 'lucide-react/dist/esm/icons/*'
// (bundle-size choice made in #173); this keeps those imports type-checked
// as modules instead of failing with TS7016.
declare module 'lucide-react/dist/esm/icons/*'
