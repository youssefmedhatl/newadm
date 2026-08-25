/**
 * Upload validation that does not trust the browser.
 *
 * `File.type` is whatever the client says it is — renaming `payload.html` to
 * `photo.png` sets it to `image/png`. Because `product-images` is a public
 * bucket, anything stored there is served back with its stored content type, so
 * an SVG or HTML file uploaded that way becomes stored XSS on the storage
 * origin. The bucket now enforces a MIME whitelist server-side (migration
 * 0018); this is the matching client-side check so the user gets a clear
 * message instead of an opaque storage error.
 *
 * SVG is refused outright: it is a script-bearing document, not a safe image.
 */

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
] as const

export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type FileCheckFailure =
  | 'invalid_type'
  | 'too_large'
  | 'content_mismatch'
  | 'empty'

/** Sniff the real format from the leading bytes. Returns null if unrecognised. */
async function sniffType(file: File): Promise<string | null> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const at = (offset: number, bytes: number[]) =>
    bytes.every((b, i) => header[offset + i] === b)
  const ascii = (offset: number, text: string) =>
    [...text].every((ch, i) => header[offset + i] === ch.charCodeAt(0))

  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (ascii(0, 'GIF8')) return 'image/gif'
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp'
  if (ascii(4, 'ftypavif')) return 'image/avif'
  if (at(0, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'
  // MP4 and friends all carry an `ftyp` box at offset 4.
  if (ascii(4, 'ftyp')) return 'video/mp4'

  return null
}

/**
 * Validates size, declared type and actual byte signature.
 * Returns null when the file is acceptable, otherwise a failure reason.
 */
export async function validateUpload(
  file: File,
  opts?: { allowVideo?: boolean; maxBytes?: number }
): Promise<FileCheckFailure | null> {
  const { allowVideo = false, maxBytes = MAX_UPLOAD_BYTES } = opts || {}

  if (file.size === 0) return 'empty'
  if (file.size > maxBytes) return 'too_large'

  const allowed: string[] = [
    ...ALLOWED_IMAGE_TYPES,
    ...(allowVideo ? ALLOWED_VIDEO_TYPES : []),
  ]

  // Declared type must be on the whitelist. This rejects image/svg+xml even
  // though it starts with "image/".
  if (!allowed.includes(file.type)) return 'invalid_type'

  // …and the bytes must actually agree with the declaration.
  const sniffed = await sniffType(file)
  if (!sniffed || !allowed.includes(sniffed)) return 'content_mismatch'

  // Treat the MP4 family as interchangeable; browsers label these
  // inconsistently and the container really is the same.
  const family = (t: string) => (t === 'video/mp4' ? 'video/mp4' : t)
  if (family(sniffed) !== family(file.type)) return 'content_mismatch'

  return null
}
