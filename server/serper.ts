/**
 * serper.ts — mapping and validation helpers for Serper.dev responses.
 * The tests spy on console.warn, so all missing-field diagnostics go through it.
 */
export interface OrganicResult {
  title: string
  link: string
  snippet: string
}

export interface ImageResult {
  title: string
  imageUrl: string
  imageWidth: number
  imageHeight: number
}

export interface NewsResult {
  title: string
  link: string
  snippet: string
}

function warnMissing(label: string, field: string): void {
  console.warn(`[serper] missing field "${field}" in ${label}; using a default`)
}

export function mapOrganicResults(items: any[]): OrganicResult[] {
  return (items || []).map((r: any) => ({
    title: typeof r?.title === 'string' ? r.title : (warnMissing('organic', 'title'), 'No title'),
    link: typeof r?.link === 'string' ? r.link : (warnMissing('organic', 'link'), ''),
    snippet: typeof r?.snippet === 'string' ? r.snippet : (warnMissing('organic', 'snippet'), ''),
  }))
}

export function mapImageResults(items: any[]): ImageResult[] {
  return (items || []).map((r: any) => ({
    title: typeof r?.title === 'string' ? r.title : (warnMissing('images', 'title'), 'No title'),
    imageUrl: typeof r?.imageUrl === 'string' ? r.imageUrl : (warnMissing('images', 'imageUrl'), ''),
    imageWidth: typeof r?.imageWidth === 'number' ? r.imageWidth : (warnMissing('images', 'imageWidth'), 0),
    imageHeight: typeof r?.imageHeight === 'number' ? r.imageHeight : (warnMissing('images', 'imageHeight'), 0),
  }))
}

export function mapNewsResults(items: any[]): NewsResult[] {
  return (items || []).map((r: any) => ({
    title: typeof r?.title === 'string' ? r.title : (warnMissing('news', 'title'), 'No title'),
    link: typeof r?.link === 'string' ? r.link : (warnMissing('news', 'link'), ''),
    snippet: typeof r?.snippet === 'string' ? r.snippet : (warnMissing('news', 'snippet'), ''),
  }))
}

const REQUIRED_FIELDS: Record<'organic' | 'images' | 'news', Array<{ list: string; fields: string[] }>> = {
  organic: [{ list: 'organic', fields: ['title', 'link', 'snippet'] }],
  images: [{ list: 'images', fields: ['title', 'imageUrl', 'imageWidth', 'imageHeight'] }],
  news: [{ list: 'news', fields: ['title', 'link', 'snippet'] }],
}

export function validateSerperResponse(payload: any, kind: 'organic' | 'images' | 'news'): string[] {
  const warnings: string[] = []
  for (const { list, fields } of REQUIRED_FIELDS[kind] ?? []) {
    const items = payload?.[list]
    if (!Array.isArray(items)) {
      warnings.push(`missing list "${list}" in response`)
      continue
    }
    items.forEach((item: any, index: number) => {
      for (const field of fields) {
        if (item === null || typeof item !== 'object' || !(field in item)) {
          warnings.push(`${list}[${index}] missing field "${field}"`)
        }
      }
    })
  }
  return warnings
}
