import { supabase } from '@/lib/supabase'
import { validateUpload, MAX_UPLOAD_BYTES } from '@/lib/fileValidation'

export interface MediaUploadResult {
  url: string
  error?: string
}

/**
 * Uploads a CMS media file (image or video) to the shared `product-images`
 * bucket, same pattern as the product image uploader.
 */
export async function uploadCmsMedia(
  file: File,
  folder: string
): Promise<MediaUploadResult> {
  // file.type is client-supplied; validateUpload also checks the real bytes
  // and refuses SVG. The bucket enforces the same whitelist server-side.
  const failure = await validateUpload(file, {
    allowVideo: true,
    maxBytes: MAX_UPLOAD_BYTES,
  })
  if (failure) {
    return { url: '', error: failure }
  }

  const path = `${folder}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`
  const { error: upErr } = await supabase.storage
    .from('product-images')
    .upload(path, file, { upsert: false, contentType: file.type })

  if (upErr) {
    return { url: '', error: upErr.message }
  }

  const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path)
  return { url: pub.publicUrl }
}
