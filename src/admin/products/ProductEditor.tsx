import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, Tables, Enums } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { useDocumentTitle } from '@/lib/useDocumentTitle'
import { useErrorText } from '@/lib/errors'
import { useAuth, useCan } from '@/lib/auth'
import { formatMoney, num } from '@/lib/money'
import { slugify, cn } from '@/lib/utils'
import { validateUpload } from '@/lib/fileValidation'
import { toast } from 'sonner'
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
  Select,
  Button,
  Badge,
  Tabs,
  ConfirmDialog,
  Spinner,
} from '@/components/ui'
import { ChevronDown, Upload, Trash2, ArrowUp, ArrowDown, Copy, Check, X, Image as ImageIcon } from 'lucide-react'

type Product = Tables<'products'>
type ProductVariant = Tables<'product_variants'>
type ProductImage = Tables<'product_images'>
type ProductStatus = Enums<'product_status'>

// cost_price is no longer readable on products / product_variants — it lives in
// the staff-only product_costs / variant_costs tables. These column lists are
// explicit because SELECT * fails outright once a column grant is revoked.
//
// IMPORTANT: this must stay a single string literal with `as const`. Splitting
// it across several pieces joined with `+` (even with `as const` on each piece)
// widens the result to plain `string` — the `+` operator does not preserve
// literal string types in TypeScript. supabase-js's `.select()` parses its
// argument's *type* (not its runtime value) to infer the returned row shape,
// so a widened `string` here makes every field below type as `GenericStringError`.
const PRODUCT_COLUMNS = 'id, slug, name_en, name_ar, description_en, description_ar, category_id, brand_id, status, price, compare_at_price, is_featured, is_new, tags, material_en, material_ar, care_en, care_ar, seo_title, seo_description, rating_avg, rating_count, total_sold, published_at, created_by, created_at, updated_at' as const

const VARIANT_COLUMNS = 'id, product_id, sku, barcode, size, color_name, color_hex, price, weight_grams, position, is_active, created_at, updated_at' as const

// Shallow-compares a dependency list, the same way React compares a
// useEffect deps array. Used below to run "sync state from these inputs"
// logic during render (converging in one extra render at most) instead of
// in a useEffect (which costs a full extra commit + repaint every time).
function depsChanged(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))
}

interface FormState {
  // Details
  name_en: string
  name_ar: string
  description_en: string
  description_ar: string
  slug: string
  category_id: string | null
  brand_id: string | null
  /** Free-text name typed by staff. Resolved to category_id / brand_id on save
   *  by matching (or creating) a row in categories/brands — see resolveNamedRef. */
  category_name: string
  brand_name: string
  status: ProductStatus
  tags: string[]
  material_en: string
  material_ar: string
  care_en: string
  care_ar: string
  is_featured: boolean
  is_new: boolean

  // Pricing
  price: string
  compare_at_price: string
  cost_price: string

  // SEO
  seo_title: string
  seo_description: string
}

interface VariantFormState {
  sizes: string[]
  colors: Array<{ name: string; hex: string }>
  variants: Array<
    ProductVariant & {
      _isNew?: boolean
      _isDeleted?: boolean
      /** Stock on hand at the shop's single location. Simplified single-branch
       *  stand-in for the full Inventory page's multi-location tracking. */
      stock?: number
      _stockEdited?: boolean
    }
  >
}

export function ProductEditor() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const t = useT()
  const errorText = useErrorText()
  const { locale } = useLocale()
  const { user } = useAuth()
  const can = useCan()
  const queryClient = useQueryClient()
  const getLocalized = useLocalized()
  const isNew = !id || id === 'new'

  const canEditProducts = can('products')
  const canEditCosts = can('settings')

  const [activeTab, setActiveTab] = useState('details')
  const [form, setForm] = useState<FormState>({
    name_en: '',
    name_ar: '',
    description_en: '',
    description_ar: '',
    slug: '',
    category_id: null,
    brand_id: null,
    category_name: '',
    brand_name: '',
    status: 'draft',
    tags: [],
    material_en: '',
    material_ar: '',
    care_en: '',
    care_ar: '',
    is_featured: false,
    is_new: false,
    price: '',
    compare_at_price: '',
    cost_price: '',
    seo_title: '',
    seo_description: '',
  })

  const [variantForm, setVariantForm] = useState<VariantFormState>({
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [],
    variants: [],
  })

  const [tagInput, setTagInput] = useState('')
  const [sizeInput, setSizeInput] = useState('')
  const [colorInput, setColorInput] = useState('')
  const [colorHex, setColorHex] = useState('#000000')
  const [hasChanges, setHasChanges] = useState(false)
  const [uploadingImages, setUploadingImages] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ variantId: string } | null>(null)
  const [imageToDelete, setImageToDelete] = useState<{ id: string; url: string } | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [imageFormState, setImageFormState] = useState<Record<string, { alt: string; color_name: string | null }>>({})

  // Fetch product if editing
  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      if (isNew) return null
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !isNew,
  })

  // Fetch variants
  const { data: variants = [] } = useQuery({
    queryKey: ['productVariants', id],
    queryFn: async () => {
      if (isNew) return []
      const { data, error } = await supabase
        .from('product_variants')
        .select(VARIANT_COLUMNS)
        .eq('product_id', id)
      if (error) throw error
      return data || []
    },
    enabled: !isNew,
  })

  // Cost comes from the staff-only cost tables.
  const { data: productCost = null } = useQuery({
    queryKey: ['productCost', id],
    queryFn: async () => {
      if (isNew) return null
      const { data, error } = await supabase
        .from('product_costs')
        .select('cost_price')
        .eq('product_id', id)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !isNew && canEditCosts,
  })

  const { data: variantCosts = [] } = useQuery({
    queryKey: ['variantCosts', id],
    queryFn: async () => {
      if (isNew) return []
      const { data, error } = await supabase
        .from('variant_costs')
        .select('variant_id, cost_price, product_variants!inner(product_id)')
        .eq('product_variants.product_id', id)
      if (error) throw error
      return data || []
    },
    enabled: !isNew && canEditCosts,
  })

  // The shop runs a single location — stock lives here instead of on a
  // separate Inventory page. Grabs whichever active location sorts first.
  const { data: primaryLocation = null } = useQuery({
    queryKey: ['locations', 'primary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('locations')
        .select('id')
        .eq('is_active', true)
        .order('position')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const { data: stockLevels = [] } = useQuery({
    queryKey: ['productStock', id, primaryLocation?.id],
    queryFn: async () => {
      if (isNew || !primaryLocation?.id) return []
      const { data, error } = await supabase
        .from('inventory_levels')
        .select('variant_id, quantity, product_variants!inner(product_id)')
        .eq('location_id', primaryLocation.id)
        .eq('product_variants.product_id', id)
      if (error) throw error
      return data || []
    },
    enabled: !isNew && !!primaryLocation?.id,
  })

  useDocumentTitle(
    isNew
      ? t('productEditor.createTitle')
      : product
        ? getLocalized(product, 'name')
        : t('nav.products')
  )

  // Fetch images
  const { data: images = [] } = useQuery({
    queryKey: ['productImages', id],
    queryFn: async () => {
      if (isNew) return []
      const { data, error } = await supabase
        .from('product_images')
        .select('*')
        .eq('product_id', id)
        .order('position')
      if (error) throw error
      return data || []
    },
    enabled: !isNew,
  })

  // Fetch categories and brands
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name_en, name_ar')
        .eq('is_active', true)
      if (error) throw error
      return data || []
    },
  })

  const { data: brands = [] } = useQuery({
    queryKey: ['brands'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name')
        .eq('is_active', true)
      if (error) throw error
      return data || []
    },
  })

  // Initialize form from product
  const initFormDeps = [product, productCost, categories, brands, getLocalized] as const
  const [prevInitFormDeps, setPrevInitFormDeps] = useState<readonly unknown[]>(initFormDeps)
  if (depsChanged(initFormDeps, prevInitFormDeps)) {
    setPrevInitFormDeps(initFormDeps)
    if (product) {
      setForm({
        name_en: product.name_en || '',
        name_ar: product.name_ar || '',
        description_en: product.description_en || '',
        description_ar: product.description_ar || '',
        slug: product.slug || '',
        category_id: product.category_id || null,
        brand_id: product.brand_id || null,
        category_name: categories.find(c => c.id === product.category_id)
          ? getLocalized(categories.find(c => c.id === product.category_id)!, 'name')
          : '',
        brand_name: brands.find(b => b.id === product.brand_id)?.name || '',
        status: product.status || 'draft',
        tags: product.tags || [],
        material_en: product.material_en || '',
        material_ar: product.material_ar || '',
        care_en: product.care_en || '',
        care_ar: product.care_ar || '',
        is_featured: product.is_featured || false,
        is_new: product.is_new || false,
        price: String(product.price || ''),
        compare_at_price: String(product.compare_at_price || ''),
        cost_price: String(productCost?.cost_price || ''),
        seo_title: product.seo_title || '',
        seo_description: product.seo_description || '',
      })
    }
  }

  // Initialize variants
  const initVariantDeps = [variants, variantCosts, stockLevels] as const
  const [prevInitVariantDeps, setPrevInitVariantDeps] = useState<readonly unknown[]>(initVariantDeps)
  if (depsChanged(initVariantDeps, prevInitVariantDeps)) {
    setPrevInitVariantDeps(initVariantDeps)
    if (variants.length > 0) {
      const sizes = [...new Set(variants.map(v => v.size).filter(Boolean))] as string[]
      const colors = [...new Set(variants.map(v => v.color_name).filter(Boolean))]
        .map(name => ({
          name: name as string,
          hex: variants.find(v => v.color_name === name)?.color_hex || '#000000',
        }))
      const costByVariant = new Map(variantCosts.map(c => [c.variant_id, c.cost_price]))
      const stockByVariant = new Map(stockLevels.map(s => [s.variant_id, s.quantity]))
      setVariantForm({
        sizes,
        colors,
        variants: variants.map(v => ({
          ...v,
          cost_price: costByVariant.get(v.id) ?? null,
          stock: stockByVariant.get(v.id) ?? 0,
          _isNew: false,
        })),
      })
    }
  }

  // Track changes
  const handleFormChange = useCallback((updates: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...updates }))
    setHasChanges(true)
  }, [])

  // Auto-slugify on name change. Guarded during render (via depsChanged)
  // instead of a useEffect, for the same reason as the two blocks above.
  const autoSlugDeps = [form.name_en, isNew] as const
  const [prevAutoSlugDeps, setPrevAutoSlugDeps] = useState<readonly unknown[]>(autoSlugDeps)
  if (depsChanged(autoSlugDeps, prevAutoSlugDeps)) {
    setPrevAutoSlugDeps(autoSlugDeps)
    if (form.name_en && !isNew) {
      // Only auto-update if slug is based on name
      const autoSlug = slugify(form.name_en)
      if (!form.slug || form.slug === slugify(form.name_en)) {
        handleFormChange({ slug: autoSlug })
      }
    }
  }

  // Calculate margin
  const margin = useMemo(() => {
    const price = num(form.price)
    const cost = num(form.cost_price)
    if (price === 0) return 0
    return ((price - cost) / price) * 100
  }, [form.price, form.cost_price])

  // Free-text staff typed into the Category/Brand fields is matched against an
  // existing row (case-insensitively) or, if nothing matches, a new row is
  // created on the fly. This lets staff just type a name instead of having to
  // manage categories/brands as a separate list first.
  const resolveNamedRef = useCallback(
    async (kind: 'category' | 'brand', typed: string): Promise<string | null> => {
      const name = typed.trim()
      if (!name) return null

      if (kind === 'category') {
        const existing = categories.find(
          c => c.name_en.trim().toLowerCase() === name.toLowerCase()
        )
        if (existing) return existing.id

        const { data, error } = await supabase
          .from('categories')
          .insert([{ name_en: name, name_ar: name, slug: slugify(name), is_active: true }])
          .select('id')
          .single()
        if (error) throw error
        return data.id
      }

      const existing = brands.find(
        b => b.name.trim().toLowerCase() === name.toLowerCase()
      )
      if (existing) return existing.id

      const { data, error } = await supabase
        .from('brands')
        .insert([{ name, slug: slugify(name), is_active: true }])
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    [categories, brands]
  )

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name_en || !form.name_ar) {
        throw new Error(t('productEditor.nameRequired') || 'Name in both languages is required')
      }

      const [resolvedCategoryId, resolvedBrandId] = await Promise.all([
        resolveNamedRef('category', form.category_name),
        resolveNamedRef('brand', form.brand_name),
      ])

      const productData = {
        name_en: form.name_en,
        name_ar: form.name_ar,
        description_en: form.description_en,
        description_ar: form.description_ar,
        slug: form.slug || slugify(form.name_en),
        category_id: resolvedCategoryId,
        brand_id: resolvedBrandId,
        status: form.status,
        tags: form.tags,
        material_en: form.material_en,
        material_ar: form.material_ar,
        care_en: form.care_en,
        care_ar: form.care_ar,
        is_featured: form.is_featured,
        is_new: form.is_new,
        price: num(form.price),
        compare_at_price: form.compare_at_price ? num(form.compare_at_price) : null,
        // cost_price is written to product_costs below, not to products.
        seo_title: form.seo_title,
        seo_description: form.seo_description,
        updated_at: new Date().toISOString(),
      }

      let productId = id && id !== 'new' ? id : null

      if (isNew) {
        const { data, error } = await supabase
          .from('products')
          .insert([{
            ...productData,
            created_by: user?.id,
            created_at: new Date().toISOString(),
          }])
          .select('id')
          .single()

        if (error) throw error
        productId = data.id
      } else {
        if (!productId) throw new Error(t('products.errorProductIdRequired'))

        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', productId)

        if (error) throw error
      }

      // Cost is stored separately, in the staff-only cost table.
      if (productId && canEditCosts) {
        const { error } = await supabase
          .from('product_costs')
          .upsert({
            product_id: productId,
            cost_price: num(form.cost_price),
            updated_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          })
        if (error) throw error
      }

      // Handle variant updates
      if (variantForm.variants.length > 0) {
        // Insert new variants
        const newVariants = variantForm.variants.filter(v => v._isNew && !v._isDeleted)
        if (newVariants.length > 0 && productId) {
          const { data: inserted, error } = await supabase
            .from('product_variants')
            .insert(newVariants.map(v => ({
              product_id: productId as string,
              size: v.size,
              color_name: v.color_name,
              color_hex: v.color_hex,
              sku: v.sku,
              barcode: v.barcode,
              price: v.price,
              is_active: v.is_active,
            })))
            .select('id')

          if (!error && inserted) {
            // PostgREST returns inserted rows in the order they were supplied,
            // so the costs pair up with newVariants by index.
            const costRows = inserted
              .map((row, i) => ({
                variant_id: row.id,
                cost_price: newVariants[i]?.cost_price ?? null,
                updated_by: user?.id ?? null,
                updated_at: new Date().toISOString(),
              }))
              .filter(r => r.cost_price !== null)
            if (canEditCosts && costRows.length > 0) {
              const { error: costError } = await supabase
                .from('variant_costs')
                .upsert(costRows)
              if (costError) throw costError
            }

            // Stock uses the audited set_stock RPC rather than writing
            // inventory_levels directly, same as the (hidden) Inventory page.
            if (primaryLocation?.id) {
              for (const [i, row] of inserted.entries()) {
                const stockValue = newVariants[i]?.stock
                if (stockValue !== undefined && stockValue !== null) {
                  const { error: stockError } = await supabase.rpc('set_stock', {
                    p_variant_id: row.id,
                    p_location_id: primaryLocation.id,
                    p_counted: stockValue,
                    p_note: 'Set from Product Editor',
                  })
                  if (stockError) throw stockError
                }
              }
            }
          }

          if (error) {
            if (error.code === '23505') {
              // Unique constraint violation
              const match = error.message.match(/Key \((.*?)\)/)
              const field = match ? match[1] : 'entry'
              throw new Error(t('productEditor.duplicateField', { field }))
            }
            throw error
          }
        }

        // Update existing variants
        const existingVariants = variantForm.variants.filter(v => !v._isNew && !v._isDeleted)
        for (const v of existingVariants) {
          const { error } = await supabase
            .from('product_variants')
            .update({
              size: v.size,
              color_name: v.color_name,
              color_hex: v.color_hex,
              sku: v.sku,
              barcode: v.barcode,
              price: v.price,
              is_active: v.is_active,
            })
            .eq('id', v.id)

          if (error) {
            if (error.code === '23505') {
              throw new Error(t('productEditor.duplicateField', { field: 'SKU or barcode' }))
            }
            throw error
          }

          if (canEditCosts) {
            const { error: costError } = await supabase
              .from('variant_costs')
              .upsert({
                variant_id: v.id,
                cost_price: v.cost_price,
                updated_by: user?.id ?? null,
                updated_at: new Date().toISOString(),
              })
            if (costError) throw costError
          }

          if (v._stockEdited && primaryLocation?.id && v.stock !== undefined) {
            const { error: stockError } = await supabase.rpc('set_stock', {
              p_variant_id: v.id,
              p_location_id: primaryLocation.id,
              p_counted: v.stock,
              p_note: 'Set from Product Editor',
            })
            if (stockError) throw stockError
          }
        }

        // Delete marked variants
        const deletedVariants = variantForm.variants.filter(v => v._isDeleted && !v._isNew)
        if (deletedVariants.length > 0) {
          const { error } = await supabase
            .from('product_variants')
            .delete()
            .in('id', deletedVariants.map(v => v.id))

          if (error) throw error
        }
      }

      return { productId, isNew }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product', result.productId] })
      queryClient.invalidateQueries({ queryKey: ['productCost', result.productId] })
      queryClient.invalidateQueries({ queryKey: ['variantCosts', result.productId] })
      queryClient.invalidateQueries({ queryKey: ['productStock', result.productId] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['brands'] })
      toast.success(t(result.isNew ? 'common.created' : 'common.saved'))
      setHasChanges(false)
      if (result.isNew) {
        navigate(`/admin/products/${result.productId}`)
      }
    },
    onError: (error) => {
      toast.error(errorText(error))
    },
  })

  // Warn on unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasChanges])

  // Warns (but doesn't block) when a photo is too small to look sharp once
  // it's displayed full-size on the product page — this is what actually
  // causes "blurry after upload" complaints, since nothing here compresses
  // images at all; they're stored exactly as picked.
  const MIN_DIMENSION = 1000
  const checkImageResolution = useCallback(async (file: File): Promise<{ width: number; height: number } | null> => {
    try {
      const bitmap = await createImageBitmap(file)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return size
    } catch {
      return null
    }
  }, [])

  // Handle image file selection and upload
  const handleImageFiles = useCallback(async (files: File[]) => {
    if (!id || id === 'new') {
      toast.error(t('productEditor.saveProductFirst'))
      return
    }

    // Validate files
    const validFiles: File[] = []
    for (const file of files) {
      // Checks the declared type, the size, and the actual byte signature —
      // a renamed HTML or SVG file no longer slips through into a public bucket.
      const failure = await validateUpload(file)
      if (failure === 'too_large') {
        toast.error(t('productEditor.imageTooLarge', { name: file.name }))
        continue
      }
      if (failure) {
        toast.error(t('productEditor.invalidImageType', { name: file.name }))
        continue
      }
      const dims = await checkImageResolution(file)
      if (dims && (dims.width < MIN_DIMENSION && dims.height < MIN_DIMENSION)) {
        toast.warning(
          t('productEditor.imageLowResolution', {
            width: dims.width,
            height: dims.height,
          })
        )
      }
      validFiles.push(file)
    }

    if (validFiles.length === 0) return

    setUploadingImages(true)
    let uploadedCount = 0

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      try {
        // Upload to Storage
        const path = `${id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`
        const { error: upErr } = await supabase.storage
          .from('product-images')
          .upload(path, file, { upsert: false, contentType: file.type })

        if (upErr) throw upErr

        // Get public URL
        const { data: pub } = supabase.storage.from('product-images').getPublicUrl(path)

        // Record in database
        const { error: rowErr } = await supabase.from('product_images').insert({
          product_id: id as string,
          url: pub.publicUrl,
          alt: '',
          position: images.length + uploadedCount,
        })

        if (rowErr) throw rowErr

        uploadedCount++
      } catch (error) {
        toast.error(
          t('productEditor.uploadFailed', {
            name: file.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        )
      }
    }

    if (uploadedCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['productImages', id] })
      setFileInputKey(prev => prev + 1)
    }

    setUploadingImages(false)
  }, [id, images.length, t, queryClient, checkImageResolution])

  // Update image field (alt text or color)
  const updateImageField = useCallback(async (imageId: string, field: 'alt' | 'color_name', value: string | null) => {
    const updateData = field === 'alt'
      ? { alt: value }
      : { color_name: value }

    const { error } = await supabase
      .from('product_images')
      .update(updateData)
      .eq('id', imageId)

    if (error) {
      toast.error(t('common.error'))
    } else {
      queryClient.invalidateQueries({ queryKey: ['productImages', id] })
    }
  }, [id, t, queryClient])

  // Move image up or down
  const moveImage = useCallback(async (idx: number, delta: number) => {
    const newImages = [...images]
    const newIdx = idx + delta
    if (newIdx < 0 || newIdx >= newImages.length) return

    const temp = newImages[idx]
    newImages[idx] = newImages[newIdx]
    newImages[newIdx] = temp

    // Update positions
    for (let i = 0; i < newImages.length; i++) {
      await supabase
        .from('product_images')
        .update({ position: i })
        .eq('id', newImages[i].id)
    }

    queryClient.invalidateQueries({ queryKey: ['productImages', id] })
  }, [images, id, queryClient])

  // Delete image
  const deleteImage = useCallback(async () => {
    if (!imageToDelete) return

    // Extract path from URL
    const urlParts = imageToDelete.url.split('/product-images/')
    if (urlParts.length !== 2) {
      toast.error(t('common.error'))
      return
    }
    const storagePath = urlParts[1]

    try {
      // Delete from Storage
      const { error: storageErr } = await supabase.storage
        .from('product-images')
        .remove([storagePath])

      if (storageErr) {
        // Continue even if storage delete fails, but warn the user
        toast.error(
          t('productEditor.deleteImageFailed', {
            error: storageErr.message,
          })
        )
      }
    } catch (error) {
      toast.error(
        t('productEditor.deleteImageFailed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      )
    }

    // Delete from database
    const { error: rowErr } = await supabase
      .from('product_images')
      .delete()
      .eq('id', imageToDelete.id)

    if (rowErr) {
      toast.error(t('common.error'))
    } else {
      toast.success(t('productEditor.imageDeleted'))
      queryClient.invalidateQueries({ queryKey: ['productImages', id] })
      setImageToDelete(null)
    }
  }, [imageToDelete, id, t, queryClient])

  // Permission guard lives below every hook. It used to sit at the top of the
  // component, above ~20 hooks — because can() returns false until the profile
  // has loaded, a permission resolving after mount changed the hook count
  // between renders and blanked the page (the same failure OrderDetailPage hit).
  if (!canEditProducts) {
    return null
  }

  if (productLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-sand border-t-ink"></div>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'details', label: t('productEditor.details') },
    { id: 'variants', label: t('productEditor.variants') },
    { id: 'images', label: t('productEditor.images') },
    { id: 'pricing', label: t('productEditor.pricing') },
    { id: 'seo', label: t('productEditor.seo') },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display text-ink mb-2">
            {isNew ? t('productEditor.createTitle') : t('productEditor.title')}
          </h1>
          {!isNew && form.name_en && (
            <p className="text-moss">{form.name_en}</p>
          )}
        </div>
        <button
          onClick={() => navigate('/admin/products')}
          className="text-moss hover:text-ink transition-colors"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Details Tab */}
      {activeTab === 'details' && (
        <Card>
          <CardBody className="space-y-6">
            {/* Bilingual Names */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.nameEn')} *
                </label>
                <Input
                  value={form.name_en}
                  onChange={(e) => handleFormChange({ name_en: e.target.value })}
                  placeholder="Product Name"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.nameAr')} *
                </label>
                <Input
                  value={form.name_ar}
                  onChange={(e) => handleFormChange({ name_ar: e.target.value })}
                  placeholder="اسم المنتج"
                  dir="rtl"
                />
              </div>
            </div>

            {/* Bilingual Descriptions */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.descriptionEn')}
                </label>
                <Textarea
                  value={form.description_en}
                  onChange={(e) => handleFormChange({ description_en: e.target.value })}
                  placeholder="Product description..."
                  dir="ltr"
                  rows={4}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.descriptionAr')}
                </label>
                <Textarea
                  value={form.description_ar}
                  onChange={(e) => handleFormChange({ description_ar: e.target.value })}
                  placeholder="وصف المنتج..."
                  dir="rtl"
                  rows={4}
                />
              </div>
            </div>

            {/* Slug */}
            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                {t('productEditor.slug')}
              </label>
              <Input
                value={form.slug}
                onChange={(e) => handleFormChange({ slug: e.target.value })}
                placeholder="product-name"
                dir="ltr"
              />
            </div>

            {/* Category, Brand, Status */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.category')}
                </label>
                <Input
                  list="category-suggestions"
                  value={form.category_name}
                  onChange={(e) => handleFormChange({ category_name: e.target.value })}
                  placeholder={t('productEditor.categoryPlaceholder')}
                  dir="ltr"
                />
                <datalist id="category-suggestions">
                  {categories.map(cat => (
                    <option key={cat.id} value={getLocalized(cat, 'name')} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.brand')}
                </label>
                <Input
                  list="brand-suggestions"
                  value={form.brand_name}
                  onChange={(e) => handleFormChange({ brand_name: e.target.value })}
                  placeholder={t('productEditor.brandPlaceholder')}
                  dir="ltr"
                />
                <datalist id="brand-suggestions">
                  {brands.map(brand => (
                    <option key={brand.id} value={brand.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.status')}
                </label>
                <Select
                  value={form.status}
                  onChange={(e) => handleFormChange({ status: e.target.value as ProductStatus })}
                >
                  <option value="draft">{t('productStatus.draft')}</option>
                  <option value="active">{t('productStatus.active')}</option>
                  <option value="archived">{t('productStatus.archived')}</option>
                </Select>
                <p className="mt-1 text-xs text-moss">
                  {t('productEditor.statusHint')}
                </p>
              </div>
            </div>

            {/* Material & Care (Bilingual) */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.materialEn')}
                </label>
                <Input
                  value={form.material_en}
                  onChange={(e) => handleFormChange({ material_en: e.target.value })}
                  placeholder="e.g., Cotton blend"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.materialAr')}
                </label>
                <Input
                  value={form.material_ar}
                  onChange={(e) => handleFormChange({ material_ar: e.target.value })}
                  placeholder="مثلا: خليط قطن"
                  dir="rtl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.careEn')}
                </label>
                <Textarea
                  value={form.care_en}
                  onChange={(e) => handleFormChange({ care_en: e.target.value })}
                  placeholder="Wash cold, tumble dry low"
                  dir="ltr"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.careAr')}
                </label>
                <Textarea
                  value={form.care_ar}
                  onChange={(e) => handleFormChange({ care_ar: e.target.value })}
                  placeholder="غسل بماء بارد، تجفيف برفق"
                  dir="rtl"
                  rows={3}
                />
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-ink mb-2">
                {t('productEditor.tags')}
              </label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (tagInput.trim()) {
                          handleFormChange({
                            tags: [...form.tags, tagInput.trim()],
                          })
                          setTagInput('')
                        }
                      }
                    }}
                    placeholder={t('productEditor.tags')}
                  />
                  <Button
                    onClick={() => {
                      if (tagInput.trim()) {
                        handleFormChange({
                          tags: [...form.tags, tagInput.trim()],
                        })
                        setTagInput('')
                      }
                    }}
                  >
                    {t('common.add')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.tags.map((tag, idx) => (
                    <Badge key={idx} tone="neutral">
                      {tag}
                      <button
                        onClick={() => handleFormChange({
                          tags: form.tags.filter((_, i) => i !== idx),
                        })}
                        className="ms-1 hover:opacity-75"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => handleFormChange({ is_featured: e.target.checked })}
                  className="rounded border-sand"
                />
                <span className="text-sm font-medium text-ink">
                  {t('productEditor.isFeatured')}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_new}
                  onChange={(e) => handleFormChange({ is_new: e.target.checked })}
                  className="rounded border-sand"
                />
                <span className="text-sm font-medium text-ink">
                  {t('productEditor.isNew')}
                </span>
              </label>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Variants Tab */}
      {activeTab === 'variants' && (
        <div className="space-y-6">
          {/* Matrix Generator */}
          <Card>
            <CardHeader>
              <CardTitle>{t('productEditor.generateMatrix')}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.variantSize')}
                </label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={sizeInput}
                    onChange={(e) => setSizeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (sizeInput.trim() && !variantForm.sizes.includes(sizeInput.trim())) {
                          setVariantForm(prev => ({
                            ...prev,
                            sizes: [...prev.sizes, sizeInput.trim()],
                          }))
                          setSizeInput('')
                        }
                      }
                    }}
                    placeholder="e.g., XS, S, M, L, XL"
                  />
                  <Button
                    onClick={() => {
                      if (sizeInput.trim() && !variantForm.sizes.includes(sizeInput.trim())) {
                        setVariantForm(prev => ({
                          ...prev,
                          sizes: [...prev.sizes, sizeInput.trim()],
                        }))
                        setSizeInput('')
                      }
                    }}
                  >
                    {t('common.add')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {variantForm.sizes.map((size, idx) => (
                    <Badge key={idx} tone="neutral">
                      {size}
                      <button
                        onClick={() => setVariantForm(prev => ({
                          ...prev,
                          sizes: prev.sizes.filter((_, i) => i !== idx),
                        }))}
                        className="ms-1 hover:opacity-75"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.variantColor')}
                </label>
                <div className="space-y-2 mb-2">
                  <div className="flex gap-2">
                    <Input
                      value={colorInput}
                      onChange={(e) => setColorInput(e.target.value)}
                      placeholder="e.g., Black, White"
                    />
                    <input
                      type="color"
                      value={colorHex}
                      onChange={(e) => setColorHex(e.target.value)}
                      className="w-12 h-10 rounded border border-sand cursor-pointer"
                    />
                    <Button
                      onClick={() => {
                        if (colorInput.trim() && !variantForm.colors.some(c => c.name === colorInput.trim())) {
                          setVariantForm(prev => ({
                            ...prev,
                            colors: [...prev.colors, { name: colorInput.trim(), hex: colorHex }],
                          }))
                          setColorInput('')
                          setColorHex('#000000')
                        }
                      }}
                    >
                      {t('common.add')}
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {variantForm.colors.map((color, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-sand/30 rounded-lg px-3 py-2"
                    >
                      <div
                        className="w-4 h-4 rounded border border-sand"
                        style={{ backgroundColor: color.hex }}
                      />
                      <span className="text-sm font-medium text-ink">{color.name}</span>
                      <button
                        onClick={() => setVariantForm(prev => ({
                          ...prev,
                          colors: prev.colors.filter((_, i) => i !== idx),
                        }))}
                        className="hover:opacity-75 ms-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Variants Table */}
          {variantForm.variants.filter(v => !v._isDeleted).length > 0 && (
            <Card>
              <CardBody className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand">
                      <th className="text-start py-2 px-3 font-medium text-ink">{t('productEditor.variantSize')}</th>
                      <th className="text-start py-2 px-3 font-medium text-ink">{t('productEditor.variantColor')}</th>
                      <th className="text-start py-2 px-3 font-medium text-ink">{t('productEditor.variantSKU')}</th>
                      <th className="text-start py-2 px-3 font-medium text-ink">{t('productEditor.variantBarcode')}</th>
                      <th className="text-start py-2 px-3 font-medium text-ink">{t('productEditor.variantStock')}</th>
                      <th className="text-start py-2 px-3 font-medium text-ink">{t('productEditor.variantActive')}</th>
                      <th className="text-start py-2 px-3 font-medium text-ink">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantForm.variants
                      .filter(v => !v._isDeleted)
                      .map((variant, idx) => (
                        <tr key={variant.id} className="border-b border-sand hover:bg-sand/30">
                          <td className="py-3 px-3">{variant.size}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-4 h-4 rounded border border-sand"
                                style={{ backgroundColor: variant.color_hex || '#000000' }}
                              />
                              {variant.color_name}
                            </div>
                          </td>
                          <td className="py-3 px-3 font-mono text-xs" dir="ltr">
                            {variant.sku}
                          </td>
                          <td className="py-3 px-3 font-mono text-xs" dir="ltr">
                            {variant.barcode || '—'}
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={variant.stock ?? 0}
                              dir="ltr"
                              onChange={(e) => {
                                const newVariants = [...variantForm.variants]
                                newVariants[idx] = {
                                  ...variant,
                                  stock: e.target.value === '' ? 0 : parseInt(e.target.value, 10),
                                  _stockEdited: true,
                                }
                                setVariantForm(prev => ({
                                  ...prev,
                                  variants: newVariants,
                                }))
                                setHasChanges(true)
                              }}
                              className="w-20 rounded border border-sand px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="py-3 px-3">
                            <input
                              type="checkbox"
                              checked={variant.is_active}
                              onChange={(e) => {
                                const newVariants = [...variantForm.variants]
                                newVariants[idx] = { ...variant, is_active: e.target.checked }
                                setVariantForm(prev => ({
                                  ...prev,
                                  variants: newVariants,
                                }))
                                setHasChanges(true)
                              }}
                              className="rounded border-sand"
                            />
                          </td>
                          <td className="py-3 px-3">
                            <button
                              onClick={() => setConfirmDelete({ variantId: variant.id })}
                              className="text-danger hover:opacity-75"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* Pricing Tab */}
      {activeTab === 'pricing' && (
        <Card>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.price')} *
                </label>
                <Input
                  type="number"
                  value={form.price}
                  onChange={(e) => handleFormChange({ price: e.target.value })}
                  placeholder="0.00"
                  dir="ltr"
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.comparePrice')}
                </label>
                <Input
                  type="number"
                  value={form.compare_at_price}
                  onChange={(e) => handleFormChange({ compare_at_price: e.target.value })}
                  placeholder="0.00"
                  dir="ltr"
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-2">
                  {t('productEditor.costPrice')} *
                </label>
                <Input
                  type="number"
                  value={form.cost_price}
                  onChange={(e) => handleFormChange({ cost_price: e.target.value })}
                  placeholder="0.00"
                  dir="ltr"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>

            {/* Margin */}
            <div className={cn(
              'p-4 rounded-lg',
              num(form.cost_price) >= num(form.price)
                ? 'bg-danger/10 border border-danger'
                : 'bg-success/10 border border-success'
            )}>
              <p className="text-sm font-medium text-ink">
                {t('productEditor.margin')}: <span dir="ltr">{margin.toFixed(1)}%</span>
              </p>
              {num(form.cost_price) >= num(form.price) && (
                <p className="text-xs text-danger mt-1">
                  {t('productEditor.marginWarning')}
                </p>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Images Tab */}
      {activeTab === 'images' && (
        <div className="space-y-6">
          {/* Upload Zone - disabled for new products */}
          {isNew ? (
            <Card>
              <CardBody className="py-12 text-center">
                <ImageIcon className="h-12 w-12 text-moss mx-auto mb-4 opacity-50" />
                <p className="text-sm font-medium text-ink mb-1">
                  {t('productEditor.saveProductFirst')}
                </p>
                <p className="text-xs text-moss">
                  {t('productEditor.uploadDragDrop')}
                </p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <input
                  key={fileInputKey}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleImageFiles(Array.from(e.target.files || []))}
                  className="hidden"
                  id="image-file-input"
                />
                <label
                  htmlFor="image-file-input"
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver(true)
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    handleImageFiles(Array.from(e.dataTransfer.files))
                  }}
                  className={cn(
                    'block cursor-pointer py-8 px-4 text-center border-2 border-dashed rounded-lg transition-colors',
                    uploadingImages
                      ? 'bg-sand/20 border-sand cursor-not-allowed opacity-50'
                      : dragOver
                        ? 'bg-sand/30 border-ink'
                        : 'border-sand hover:bg-sand/10'
                  )}
                >
                  {uploadingImages ? (
                    <>
                      <div className="flex justify-center mb-2">
                        <Spinner size="md" />
                      </div>
                      <p className="text-sm text-ink">{t('common.loading')}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-moss mx-auto mb-2" />
                      <p className="text-sm text-ink">{t('productEditor.uploadDragDrop')}</p>
                      <p className="text-xs text-moss mt-1">{t('productEditor.imageValidation')}</p>
                    </>
                  )}
                </label>
              </CardBody>
            </Card>
          )}

          {/* Image Grid */}
          {images.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('productEditor.uploadImages')} ({images.length})</CardTitle>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {images.map((img, idx) => (
                    <div
                      key={img.id}
                      className="border border-sand rounded-lg overflow-hidden bg-sand/10 group"
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-square bg-sand/30 overflow-hidden">
                        <img
                          src={img.url}
                          alt={img.alt || t('productEditor.imageAlt')}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {idx === 0 && (
                          <div className="absolute inset-0 bg-black/10 flex items-center justify-center">
                            <Badge tone="success">{t('productEditor.imagePrimary')}</Badge>
                          </div>
                        )}
                      </div>

                      {/* Controls */}
                      <div className="p-3 space-y-3">
                        {/* Alt Text */}
                        <div>
                          <label className="block text-xs font-medium text-moss mb-1">
                            {t('productEditor.imageAlt')}
                          </label>
                          <Input
                            value={imageFormState[img.id]?.alt || img.alt || ''}
                            onChange={(e) => {
                              setImageFormState(prev => ({
                                ...prev,
                                [img.id]: {
                                  ...prev[img.id],
                                  alt: e.target.value,
                                },
                              }))
                            }}
                            onBlur={() => updateImageField(img.id, 'alt', imageFormState[img.id]?.alt || '')}
                            placeholder={t('productEditor.imageAlt')}
                            className="text-xs"
                          />
                        </div>

                        {/* Color Tag */}
                        <div>
                          <label className="block text-xs font-medium text-moss mb-1">
                            {t('productEditor.imageColor')}
                          </label>
                          <Select
                            value={imageFormState[img.id]?.color_name || img.color_name || ''}
                            onChange={(e) => {
                              const newColor = e.target.value || null
                              setImageFormState(prev => ({
                                ...prev,
                                [img.id]: {
                                  ...prev[img.id],
                                  color_name: newColor,
                                },
                              }))
                              updateImageField(img.id, 'color_name', newColor)
                            }}
                          >
                            <option value="">{t('common.none')}</option>
                            {variantForm.colors.map(color => (
                              <option key={color.name} value={color.name}>
                                {color.name}
                              </option>
                            ))}
                          </Select>
                        </div>

                        {/* Reorder Buttons */}
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => moveImage(idx, -1)}
                            disabled={idx === 0}
                            className="flex-1"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => moveImage(idx, 1)}
                            disabled={idx === images.length - 1}
                            className="flex-1"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Delete Button */}
                        <Button
                          variant="secondary"
                          onClick={() => setImageToDelete({ id: img.id, url: img.url })}
                          className="w-full text-danger"
                        >
                          <Trash2 className="h-4 w-4 me-1" />
                          {t('productEditor.imageDelete')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {/* SEO Tab */}
      {activeTab === 'seo' && (
        <Card>
          <CardBody className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-ink">
                  {t('productEditor.seoTitle')}
                </label>
                <span className="text-xs text-moss">
                  {t('productEditor.charCount', {
                    count: form.seo_title.length,
                    max: 60,
                  })}
                </span>
              </div>
              <Input
                value={form.seo_title}
                onChange={(e) => handleFormChange({
                  seo_title: e.target.value.slice(0, 60),
                })}
                placeholder="Product title for search engines"
                maxLength={60}
                dir="ltr"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-ink">
                  {t('productEditor.seoDescription')}
                </label>
                <span className="text-xs text-moss">
                  {t('productEditor.charCount', {
                    count: form.seo_description.length,
                    max: 160,
                  })}
                </span>
              </div>
              <Textarea
                value={form.seo_description}
                onChange={(e) => handleFormChange({
                  seo_description: e.target.value.slice(0, 160),
                })}
                placeholder="Product description for search engines..."
                maxLength={160}
                rows={3}
                dir="ltr"
              />
            </div>

            {/* Google Preview */}
            <div className="p-4 bg-sand/30 rounded-lg border border-sand">
              <p className="text-xs font-medium text-moss mb-2">{t('productEditor.googlePreview')}</p>
              <p className="text-sm font-medium text-ink mb-1">
                {form.seo_title || form.name_en || 'Product title'}
              </p>
              <p className="text-xs text-moss mb-1">example.com › product</p>
              <p className="text-xs text-moss line-clamp-2">
                {form.seo_description || form.description_en || 'Product description appears here'}
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => navigate('/admin/products')}
        >
          {t('common.cancel')}
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
        >
          {t('productEditor.save')}
        </Button>
      </div>

      {/* Confirm Delete Image Dialog */}
      <ConfirmDialog
        open={imageToDelete !== null}
        title={t('common.confirm')}
        message={t('productEditor.deleteImageConfirm')}
        confirmLabel={t('common.delete')}
        tone="danger"
        onConfirm={deleteImage}
        onCancel={() => setImageToDelete(null)}
      />

      {/* Confirm Delete Variant Dialog */}
      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('common.confirm')}
        message={t('productEditor.deleteVariantConfirm', {
          variant: confirmDelete ? variantForm.variants.find(v => v.id === confirmDelete.variantId)?.sku || '' : '',
        })}
        confirmLabel={t('common.delete')}
        tone="danger"
        onConfirm={() => {
          if (confirmDelete) {
            setVariantForm(prev => ({
              ...prev,
              variants: prev.variants.map(v =>
                v.id === confirmDelete.variantId ? { ...v, _isDeleted: true } : v
              ),
            }))
            setConfirmDelete(null)
            setHasChanges(true)
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
