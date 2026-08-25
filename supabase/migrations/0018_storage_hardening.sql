-- ===========================================================================
-- 0018_storage_hardening.sql
--
-- Security review 2026-07-29, phase 4.
--
-- SEC-13  Bucket `product-images` was public with file_size_limit = none and
--         allowed_mime_types = ANY. The only validation was client-side, so a
--         staff account (or a stolen staff token) could upload a file of any
--         size — storage-cost abuse — and of any type. `image/svg+xml` and
--         HTML are the dangerous ones: a public bucket serves them back with
--         their stored content type, which is stored XSS on the storage origin.
-- SEC-07  The SELECT policy allowed listing every object in the bucket. Public
--         object URLs do not need it, and nothing in the app calls .list().
--
-- Safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- SEC-13 — enforce size and type at the storage layer, where the client
-- cannot argue with it. SVG is deliberately excluded: it is a script-bearing
-- document, not a safe image format, and nothing in the app needs it.
-- ---------------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 10485760,          -- 10 MB
       allowed_mime_types = array[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/avif',
         'image/gif',
         'video/mp4',
         'video/webm'
       ]
 where id = 'product-images';

-- ---------------------------------------------------------------------------
-- SEC-07 — objects stay publicly downloadable by URL (a public bucket serves
-- those without consulting RLS), but the bucket is no longer enumerable.
-- Staff keep an explicit read path for any future admin tooling.
-- ---------------------------------------------------------------------------
drop policy if exists "product images are public" on storage.objects;

create policy "staff can list product images"
  on storage.objects
  for select
  using (bucket_id = 'product-images' and public.is_staff());
