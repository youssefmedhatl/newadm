import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, type Tables } from '@/lib/supabase'
import { useT, useLocalized } from '@/lib/i18n'
import { useErrorText } from '@/lib/errors'
import { toast } from 'sonner'
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  Badge,
  Button,
  Input,
  Select,
  Modal,
  EmptyState,
  Skeleton,
} from '@/components/ui'
import { FolderTree, Tags, Plus, Edit2 } from 'lucide-react'

type Category = Tables<'categories'>
type Brand = Tables<'brands'>

interface CategoriesBrandsTabProps {
  canWrite: boolean
}

export function CategoriesBrandsTab({ canWrite }: CategoriesBrandsTabProps) {
  return (
    <div className="space-y-6">
      <CategoriesSection canWrite={canWrite} />
      <BrandsSection canWrite={canWrite} />
    </div>
  )
}

function CategoriesSection({ canWrite }: { canWrite: boolean }) {
  const t = useT()
  const getLocalized = useLocalized()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories', 'settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('position')
      if (error) throw error
      return (data as Category[]) || []
    },
  })

  const parentName = (parentId: string | null) => {
    if (!parentId) return '—'
    const parent = categories.find((c) => c.id === parentId)
    return parent ? getLocalized(parent, 'name') : '—'
  }

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <FolderTree className="h-4 w-4" /> {t('settings.categories')}
        </CardTitle>
        {canWrite && (
          <Button
            size="sm"
            icon={Plus}
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            {t('settings.addCategory')}
          </Button>
        )}
      </CardHeader>
      <CardBody className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={FolderTree} title={t('settings.noCategories')} />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('products.category')}</TH>
                <TH dir="ltr">{t('cms.slug')}</TH>
                <TH>{t('settings.parentCategory')}</TH>
                <TH>{t('common.status')}</TH>
                {canWrite && <TH>{t('common.actions')}</TH>}
              </TR>
            </THead>
            <TBody>
              {categories.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{getLocalized(c, 'name')}</TD>
                  <TD dir="ltr" className="font-mono text-sm">
                    {c.slug}
                  </TD>
                  <TD className="text-sm text-moss">{parentName(c.parent_id)}</TD>
                  <TD>
                    <Badge tone={c.is_active ? 'success' : 'neutral'}>
                      {c.is_active ? t('discounts.active') : t('discounts.inactive')}
                    </Badge>
                  </TD>
                  {canWrite && (
                    <TD>
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
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>

      {formOpen && (
        <CategoryFormModal
          category={editing}
          categories={categories}
          onClose={() => setFormOpen(false)}
        />
      )}
    </Card>
  )
}

function CategoryFormModal({
  category,
  categories,
  onClose,
}: {
  category: Category | null
  categories: Category[]
  onClose: () => void
}) {
  const t = useT()
  const errorText = useErrorText()
  const getLocalized = useLocalized()
  const queryClient = useQueryClient()

  const [nameEn, setNameEn] = useState(category?.name_en ?? '')
  const [nameAr, setNameAr] = useState(category?.name_ar ?? '')
  const [slug, setSlug] = useState(category?.slug ?? '')
  const [parentId, setParentId] = useState(category?.parent_id ?? '')
  const [isActive, setIsActive] = useState(category?.is_active ?? true)

  const save = useMutation({
    mutationFn: async () => {
      if (!nameEn.trim() || !nameAr.trim() || !slug.trim()) {
        throw new Error(t('cms.errorTitleRequired'))
      }
      const payload = {
        name_en: nameEn.trim(),
        name_ar: nameAr.trim(),
        slug: slug.trim(),
        parent_id: parentId || null,
        is_active: isActive,
      }
      const { error } = category
        ? await supabase.from('categories').update(payload).eq('id', category.id)
        : await supabase.from('categories').insert(payload)
      if (error) {
        if (error.code === '23505') throw new Error(t('cms.errorSlugExists'))
        throw new Error(error.message)
      }
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      onClose()
    },
    onError: (e) => toast.error(errorText(e)),
  })

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={category ? t('settings.editCategory') : t('settings.addCategory')}
    >
      <div className="space-y-4">
        <Input label={`${t('products.category')} (EN)`} required value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        <Input label={`${t('products.category')} (AR)`} required dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
        <Input label={t('cms.slug')} dir="ltr" required value={slug} onChange={(e) => setSlug(e.target.value)} />
        <Select label={t('settings.parentCategory')} value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">{t('common.none')}</option>
          {categories
            .filter((c) => c.id !== category?.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {getLocalized(c, 'name')}
              </option>
            ))}
        </Select>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
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

function BrandsSection({ canWrite }: { canWrite: boolean }) {
  const t = useT()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Brand | null>(null)

  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['brands', 'settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('brands').select('*').order('name')
      if (error) throw error
      return (data as Brand[]) || []
    },
  })

  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2">
          <Tags className="h-4 w-4" /> {t('settings.brands')}
        </CardTitle>
        {canWrite && (
          <Button
            size="sm"
            icon={Plus}
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            {t('settings.addBrand')}
          </Button>
        )}
      </CardHeader>
      <CardBody className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : brands.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={Tags} title={t('settings.noBrands')} />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t('productEditor.brand')}</TH>
                <TH dir="ltr">{t('cms.slug')}</TH>
                <TH>{t('common.status')}</TH>
                {canWrite && <TH>{t('common.actions')}</TH>}
              </TR>
            </THead>
            <TBody>
              {brands.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium">{b.name}</TD>
                  <TD dir="ltr" className="font-mono text-sm">
                    {b.slug}
                  </TD>
                  <TD>
                    <Badge tone={b.is_active ? 'success' : 'neutral'}>
                      {b.is_active ? t('discounts.active') : t('discounts.inactive')}
                    </Badge>
                  </TD>
                  {canWrite && (
                    <TD>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t('common.edit')}
                        onClick={() => {
                          setEditing(b)
                          setFormOpen(true)
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardBody>

      {formOpen && <BrandFormModal brand={editing} onClose={() => setFormOpen(false)} />}
    </Card>
  )
}

function BrandFormModal({ brand, onClose }: { brand: Brand | null; onClose: () => void }) {
  const t = useT()
  const errorText = useErrorText()
  const queryClient = useQueryClient()

  const [name, setName] = useState(brand?.name ?? '')
  const [slug, setSlug] = useState(brand?.slug ?? '')
  const [logoUrl, setLogoUrl] = useState(brand?.logo_url ?? '')
  const [isActive, setIsActive] = useState(brand?.is_active ?? true)

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !slug.trim()) throw new Error(t('cms.errorTitleRequired'))
      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        logo_url: logoUrl.trim() || null,
        is_active: isActive,
      }
      const { error } = brand
        ? await supabase.from('brands').update(payload).eq('id', brand.id)
        : await supabase.from('brands').insert(payload)
      if (error) {
        if (error.code === '23505') throw new Error(t('cms.errorSlugExists'))
        throw new Error(error.message)
      }
    },
    onSuccess: () => {
      toast.success(t('common.saved'))
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      onClose()
    },
    onError: (e) => toast.error(errorText(e)),
  })

  return (
    <Modal open onClose={onClose} size="sm" title={brand ? t('settings.editBrand') : t('settings.addBrand')}>
      <div className="space-y-4">
        <Input label={t('productEditor.brand')} required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label={t('cms.slug')} dir="ltr" required value={slug} onChange={(e) => setSlug(e.target.value)} />
        <Input label={t('cms.imageUrl')} dir="ltr" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded" />
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
