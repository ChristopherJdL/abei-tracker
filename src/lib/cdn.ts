/**
 * CloudFront CDN base URL for Abei scene art.
 * Can be overridden by the environment variable VITE_CDN_BASE_URL.
 */
export const CDN_BASE_URL =
  import.meta.env.VITE_CDN_BASE_URL || 'https://d2p4em4ijmahza.cloudfront.net'

/**
 * Resolves a scene image URI to a full URL.
 * If already an absolute URL (e.g. http:// or https://), returns it as-is.
 * Otherwise, prepends the CDN base URL.
 */
export function resolveSceneUrl(uri: string): string {
  if (!uri) return ''
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri
  }
  const cleanUri = uri.startsWith('/') ? uri : `/${uri}`
  return `${CDN_BASE_URL.replace(/\/+$/, '')}${cleanUri}`
}
