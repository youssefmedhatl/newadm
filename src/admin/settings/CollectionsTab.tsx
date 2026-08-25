import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { toast } from 'sonner'
import {
  Card,
  CardBody,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
  Button,
  Input,
  Modal,
  Drawer,
  SearchInput,
  EmptyState,
  Skeleton,
  ConfirmDialog,
} from '@/components/ui'
import { Layers, Plus, Edit2, Trash2, Package, ArrowUp, ArrowDown, X } from 'lucide-react'

type Collection = Tables<'collections'>
type ProductName = Pick<Tables<'products'>, 'id' | 'name_en' | 'name_ar' | 'slug'>

export function CollectionsTab() {
  const t = useT()
  const errorText = useErrorText()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Collection | null>(null)
  const [deleting, setDeleting] = useState<Collection | null>(null)
  const [managingProducts, setManagingProducts] = useState<Collection | null>(null)

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['collections', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('collections').select('*').order('position')
      if (error) throw error
      return (data as Collection[]) || []
    },
  })

  const remove = useMutation({
    mutationFn: async (c: Collection) => {
      const { error } = await supabase.from('collections').delete().eq('id', c.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey: ['collections'] })
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const toggleActive = useMutation({
    mutationFn: async (c: Collection) => {
      const { error } = await supabase
        .from('collections')
        .update({ is_active: !c.is_active })
        .eq('id', c.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['collections'] }),
    onError: (e) => toast.error(errorText(e)),
  })

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          icon={Plus}
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          {t('cms.createCollection')}
        </Button>
      </div>

      {collections.length === 0 ? (
        <EmptyState icon={Layers} title={t('cms.noCollections')} />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>{t('cms.collectionTitle')}</TH>
                <TH dir="ltr">{t('cms.slug')}</TH>
                <TH>{t('common.status')}</TH>
                <TH>{t('common.actions')}</TH>
              </TR>
            </THead>
            <TBody>
              {collections.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{getLocalized(c, 'title')}</TD>
                  <TD dir="ltr" className="font-mono text-sm">
                    {c.slug}
                  </TD>
                  <TD>
                    <Badge tone={c.is_active ? 'success' : 'neutral'}>
                      {c.is_active ? t('discounts.active') : t('discounts.inactive')}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => setManagingProducts(c)}>
                        <Package className="h-4 w-4" />
                        {t('cms.manageProducts')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActive.mutate(c)}
                      >
                        {c.is_active ? t('discounts.deactivate') : t('discounts.activate')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t('common.edit')}
                        onClick={() => {
                          setEditing(c)
                          setFormOpen(true)
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t('common.delete')}
                        onClick={() => setDeleting(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {formOpen && (
        <CollectionFormModal collection={editing} onClose={() => setFormOpen(false)} />
      )}

      {managingProducts && (
        <ManageProductsDrawer
          collection={managingProducts}
          onClose={() => setManagingProducts(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        tone="danger"
        title={t('cms.deleteCollectionTitle')}
        message={t('cms.deleteCollectionWarning')}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  )
}

function CollectionFormModal({
  collection,
  onClose,
}: {
  collection: Collection | null
  onClose: () => void
}) {
  const t = useT()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const [slug, setSlug] = useState(collection?.slug ?? '')
  const [titleEn, setTitleEn] = useState(collection?.title_en ?? '')
  const [titleAr, setTitleAr] = useState(collection?.title_ar ?? '')
  const [subtitleEn, setSubtitleEn] = useState(collection?.subtitle_en ?? '')
  const [subtitleAr, setSubtitleAr] = useState(collection?.subtitle_ar ?? '')
  const [imageUrl, setImageUrl] = useState(collection?.image_url ?? '')
  const [isActive, setIsActive] = useState(collection?.is_active ?? true)

  const save = useMutation({
    mutationFn: async () => {
      if (!slug.trim()) throw new Error(t('cms.errorSlugRequired'))
      if (!titleEn.trim() || !titleAr.trim()) throw new Error(t('cms.errorTitleRequired'))

      const payload = {
        slug: slug.trim(),
        title_en: titleEn.trim(),
        title_ar: titleAr.trim(),
        subtitle_en: subtitleEn.trim() || null,
        subtitle_ar: subtitleAr.trim() || null,
        image_url: imageUrl.trim() || null,
        is_active: isActive,
      }

      const { error } = collection
        ? await supabase.from('collections').update(payload).eq('id', collection.id)
        : await supabase.from('collections').insert(payload)

      if (error) {
        if (error.code === '23505') throw new Error(t('cms.errorSlugExists'))
        throw new Error(error.message)
      }
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['collections'] })
      onClose()
    },
    onError: (e) => toast.error(errorText(e)),
  })

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={collection ? t('cms.editCollection') : t('cms.createCollection')}
    >
      <div className="space-y-4">
        <Input label={t('cms.slug')} dir="ltr" required value={slug} onChange={(e) => setSlug(e.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label={`${t('cms.title')} (EN)`} required value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          <Input label={`${t('cms.title')} (AR)`} required dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
          <Input label={`${t('cms.subtitle')} (EN)`} value={subtitleEn} onChange={(e) => setSubtitleEn(e.target.value)} />
          <Input label={`${t('cms.subtitle')} (AR)`} dir="rtl" value={subtitleAr} onChange={(e) => setSubtitleAr(e.target.value)} />
        </div>
        <Input label={t('cms.imageUrl')} dir="ltr" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-ink">{t('cms.isActive')}</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function ManageProductsDrawer({
  collection,
  onClose,
}: {
  collection: Collection
  onClose: () => void
}) {
  const t = useT()
  const errorText = useErrorText()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['collection_products', collection.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('collection_products')
        .select('position, product_id, products(id, name_en, name_ar, slug)')
        .eq('collection_id', collection.id)
        .order('position')
      if (error) throw error
      return (data || []) as unknown as Array<{
        position: number
        product_id: string
        products: ProductName | null
      }>
    },
  })

  const sanitizedSearch = useMemo(() => search.replace(/[,()."\\%_*]/g, '').trim(), [search])

  const { data: searchResults = [] } = useQuery({
    queryKey: ['products', 'picker', sanitizedSearch],
    enabled: sanitizedSearch.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name_en, name_ar, slug')
        .or(`name_en.ilike.%${sanitizedSearch}%,name_ar.ilike.%${sanitizedSearch}%`)
        .limit(10)
      if (error) return []
      return (data as ProductName[]) || []
    },
  })

  const memberIds = new Set(members.map((m) => m.product_id))

  const addProduct = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase.from('collection_products').insert({
        collection_id: collection.id,
        product_id: productId,
        position: members.length,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      setSearch('')
      queryClient.invalidateQueries({ queryKey: ['collection_products', collection.id] })
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const removeProduct = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from('collection_products')
        .delete()
        .eq('collection_id', collection.id)
        .eq('product_id', productId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['collection_products', collection.id] }),
    onError: (e) => toast.error(errorText(e)),
  })

  const move = async (idx: number, delta: number) => {
    const newIdx = idx + delta
    if (newIdx < 0 || newIdx >= members.length) return
    const a = members[idx]
    const b = members[newIdx]
    await Promise.all([
      supabase
        .from('collection_products')
        .update({ position: b.position })
        .eq('collection_id', collection.id)
        .eq('product_id', a.product_id),
      supabase
        .from('collection_products')
        .update({ position: a.position })
        .eq('collection_id', collection.id)
        .eq('product_id', b.product_id),
    ])
    queryClient.invalidateQueries({ queryKey: ['collection_products', collection.id] })
  }

  return (
    <Drawer open onClose={onClose} size="lg" title={t('cms.manageProducts')}>
      <div className="space-y-4">
        <div>
          <SearchInput
            value={search}
            onValueChange={setSearch}
            placeholder={t('cms.searchProducts')}
          />
          {searchResults.length > 0 && (
            <div className="mt-2 divide-y divide-sand rounded-xl border border-sand">
              {searchResults.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm text-ink">{getLocalized(p, 'name')}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={memberIds.has(p.id) || addProduct.isPending}
                    onClick={() => addProduct.mutate(p.id)}
                  >
                    {memberIds.has(p.id) ? t('cms.alreadyAdded') : t('common.add')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">
            {t('cms.membersCount', { count: members.length })}
          </p>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : members.length === 0 ? (
            <p className="text-sm text-moss">{t('cms.noMembers')}</p>
          ) : (
            <div className="divide-y divide-sand rounded-xl border border-sand">
              {members.map((m, idx) => (
                <div key={m.product_id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label={t('cms.moveUp')}
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="rounded p-0.5 hover:bg-sand/50 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('cms.moveDown')}
                      onClick={() => move(idx, 1)}
                      disabled={idx === members.length - 1}
                      className="rounded p-0.5 hover:bg-sand/50 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="flex-1 text-sm text-ink">
                    {m.products ? getLocalized(m.products, 'name') : m.product_id}
                  </span>
                  <button
                    type="button"
                    aria-label={t('common.delete')}
                    onClick={() => removeProduct.mutate(m.product_id)}
                    className="rounded p-1 hover:bg-sand/50"
                  >
                    <X className="h-4 w-4 text-moss" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  )
}
