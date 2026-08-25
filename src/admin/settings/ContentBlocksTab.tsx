import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocale } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { toast } from 'sonner'
import { Card, CardBody, CardHeader, CardTitle, Button, Input, Textarea, Skeleton } from '@/components/ui'
import { Upload, Image as ImageIcon } from 'lucide-react'
import { uploadCmsMedia } from './mediaUpload'

type ContentBlock = Tables<'content_blocks'>

const HERO_FALLBACK = '/vitality-hero.mp4'

export function ContentBlocksTab() {
  const t = useT()

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ['content_blocks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_blocks')
        .select('*')
        .order('position')
      if (error) throw error
      return (data as ContentBlock[]) || []
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const hero = blocks.find((b) => b.key === 'hero')
  const rewards = blocks.find((b) => b.key === 'rewards')

  return (
    <div className="space-y-6">
      <ContentBlockEditor block={hero} blockKey="hero" title={t('cms.heroBlock')} />
      <ContentBlockEditor block={rewards} blockKey="rewards" title={t('cms.rewardsBlock')} />
    </div>
  )
}

function ContentBlockEditor({
  block,
  blockKey,
  title,
}: {
  block: ContentBlock | undefined
  blockKey: string
  title: string
}) {
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const [titleEn, setTitleEn] = useState(block?.title_en ?? '')
  const [titleAr, setTitleAr] = useState(block?.title_ar ?? '')
  const [subtitleEn, setSubtitleEn] = useState(block?.subtitle_en ?? '')
  const [subtitleAr, setSubtitleAr] = useState(block?.subtitle_ar ?? '')
  const [bodyEn, setBodyEn] = useState(block?.body_en ?? '')
  const [bodyAr, setBodyAr] = useState(block?.body_ar ?? '')
  const [ctaLabelEn, setCtaLabelEn] = useState(block?.cta_label_en ?? '')
  const [ctaLabelAr, setCtaLabelAr] = useState(block?.cta_label_ar ?? '')
  const [ctaHref, setCtaHref] = useState(block?.cta_href ?? '')
  const [mediaUrl, setMediaUrl] = useState(block?.media_url ?? '')
  const [mediaType, setMediaType] = useState<'image' | 'video'>(
    (block?.media_type as 'image' | 'video') ?? 'video'
  )
  const [isActive, setIsActive] = useState(block?.is_active ?? true)

  const displayTitle = locale === 'ar' ? titleAr : titleEn
  const displaySubtitle = locale === 'ar' ? subtitleAr : subtitleEn
  const displayCtaLabel = locale === 'ar' ? ctaLabelAr : ctaLabelEn
  const effectiveMediaUrl = mediaUrl.trim() || (blockKey === 'hero' ? HERO_FALLBACK : '')

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title_en: titleEn.trim() || null,
        title_ar: titleAr.trim() || null,
        subtitle_en: subtitleEn.trim() || null,
        subtitle_ar: subtitleAr.trim() || null,
        body_en: bodyEn.trim() || null,
        body_ar: bodyAr.trim() || null,
        cta_label_en: ctaLabelEn.trim() || null,
        cta_label_ar: ctaLabelAr.trim() || null,
        cta_href: ctaHref.trim() || null,
        media_url: mediaUrl.trim() || null,
        media_type: mediaType,
        is_active: isActive,
      }

      if (block) {
        const { error } = await supabase
          .from('content_blocks')
          .update(payload)
          .eq('id', block.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('content_blocks')
          .insert({ key: blockKey, kind: 'block', ...payload })
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['content_blocks'] })
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    const result = await uploadCmsMedia(file, `content/${blockKey}`)
    setUploading(false)
    if (result.error) {
      toast.error(
        result.error === 'invalid_type'
          ? t('cms.errorInvalidMediaType')
          : result.error === 'too_large'
            ? t('cms.errorMediaTooLarge')
            : result.error
      )
      return
    }
    setMediaUrl(result.url)
    setMediaType(file.type.startsWith('video/') ? 'video' : 'image')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label={`${t('cms.title')} (EN)`} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
              <Input label={`${t('cms.title')} (AR)`} value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" />
              <Input label={`${t('cms.subtitle')} (EN)`} value={subtitleEn} onChange={(e) => setSubtitleEn(e.target.value)} />
              <Input label={`${t('cms.subtitle')} (AR)`} value={subtitleAr} onChange={(e) => setSubtitleAr(e.target.value)} dir="rtl" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Textarea label={`${t('cms.body')} (EN)`} value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} rows={3} />
              <Textarea label={`${t('cms.body')} (AR)`} value={bodyAr} onChange={(e) => setBodyAr(e.target.value)} rows={3} dir="rtl" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label={`${t('cms.ctaLabel')} (EN)`} value={ctaLabelEn} onChange={(e) => setCtaLabelEn(e.target.value)} />
              <Input label={`${t('cms.ctaLabel')} (AR)`} value={ctaLabelAr} onChange={(e) => setCtaLabelAr(e.target.value)} dir="rtl" />
            </div>
            <Input label={t('cms.ctaHref')} dir="ltr" value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} placeholder="/shop" />

            <div className="space-y-2 rounded-xl border border-sand p-3">
              <label className="block text-sm font-medium text-ink">{t('cms.media')}</label>
              <Input
                dir="ltr"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder={blockKey === 'hero' ? HERO_FALLBACK : 'https://…'}
                hint={blockKey === 'hero' ? t('cms.heroMediaHint') : undefined}
              />
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Upload}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? t('common.loading') : t('cms.uploadMedia')}
                </Button>
                <span className="text-xs text-moss">{t('cms.mediaValidation')}</span>
              </div>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-ink">{t('cms.isActive')}</span>
            </label>

            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </div>

          {/* Live preview */}
          <div>
            <p className="mb-2 text-sm font-medium text-ink">{t('cms.livePreview')}</p>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border border-sand bg-ink">
              {effectiveMediaUrl ? (
                mediaType === 'video' ? (
                  <video
                    src={effectiveMediaUrl}
                    className="h-full w-full object-cover grayscale"
                    muted
                    loop
                    autoPlay
                    playsInline
                  />
                ) : (
                  <img
                    src={effectiveMediaUrl}
                    alt=""
                    className="h-full w-full object-cover grayscale"
                  />
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center text-moss">
                  <ImageIcon className="h-10 w-10" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
              <div className="absolute bottom-0 start-0 end-0 p-6 text-bone" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
                {displaySubtitle && <p className="mb-1 text-xs uppercase tracking-wide opacity-80">{displaySubtitle}</p>}
                <h3 className="display text-3xl">{displayTitle || title}</h3>
                {displayCtaLabel && (
                  <span className="mt-3 inline-block rounded-full bg-bone px-4 py-2 text-xs font-medium text-ink">
                    {displayCtaLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
