import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase, type Views } from '@/lib/supabase'
import { useT, useLocale, useLocalized } from '@/lib/i18n'
import { formatMoney, formatNumber, num } from '@/lib/money'
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
  EmptyState,
  Skeleton,
  Button,
} from '@/components/ui'
import { Warehouse, AlertTriangle, Download, Info } from 'lucide-react'
import { buildCsv, downloadCsv } from './csv'

type Valuation = Views<'v_inventory_valuation'>
type ProductPerf = Views<'v_product_performance'>

interface StockRow {
  product_id: string
  variant_id: string
  location_id: string
  quantity: number
  cost_price: number | null
  product_cost_price: number
}

interface InventoryTabProps {
  locationId: string
}

export function InventoryTab({ locationId }: InventoryTabProps) {
  const t = useT()
  const { locale } = useLocale()
  const getLocalized = useLocalized()

  const { data: valuation = [], isLoading: valuationLoading } = useQuery({
    queryKey: ['reports', 'inventory_valuation', locationId],
    queryFn: async () => {
      let query = supabase.from('v_inventory_valuation').select('*')
      if (locationId) query = query.eq('location_id', locationId)
      const { data, error } = await query
      if (error) throw error
      return (data as Valuation[]) || []
    },
  })

  const { data: locationNames = new Map<string, { name_en: string; name_ar: string }>() } = useQuery({
    queryKey: ['locations', 'names'],
    queryFn: async () => {
      const { data, error } = await supabase.from('locations').select('id, name_en, name_ar')
      if (error) throw error
      const map = new Map<string, { name_en: string; name_ar: string }>()
      for (const loc of data || []) map.set(loc.id, { name_en: loc.name_en, name_ar: loc.name_ar })
      return map
    },
  })

  const { data: performance = [] } = useQuery({
    queryKey: ['reports', 'products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('v_product_performance').select('*')
      if (error) throw error
      return (data as ProductPerf[]) || []
    },
  })

  const { data: stockRows = [], isLoading: stockLoading } = useQuery({
    queryKey: ['reports', 'stock_value', locationId],
    queryFn: async (): Promise<StockRow[]> => {
      let levelsQuery = supabase
        .from('inventory_levels')
        .select('variant_id, location_id, quantity')
      if (locationId) levelsQuery = levelsQuery.eq('location_id', locationId)

      const [{ data: levels, error: levelsError }, { data: variants, error: variantsError }] =
        await Promise.all([
          levelsQuery,
          supabase.from('product_variants').select('id, product_id'),
        ])

      if (levelsError) throw levelsError
      if (variantsError) throw variantsError

      // Cost lives in the staff-only cost tables, not on the product rows.
      const [
        { data: variantCosts, error: variantCostsError },
        { data: productCosts, error: productCostsError },
      ] = await Promise.all([
        supabase.from('variant_costs').select('variant_id, cost_price'),
        supabase.from('product_costs').select('product_id, cost_price'),
      ])
      if (variantCostsError) throw variantCostsError
      if (productCostsError) throw productCostsError

      const variantById = new Map((variants || []).map((v) => [v.id, v]))
      const costByVariant = new Map((variantCosts || []).map((c) => [c.variant_id, c.cost_price]))
      const costByProduct = new Map((productCosts || []).map((c) => [c.product_id, c.cost_price]))

      return (levels || []).flatMap((level): StockRow[] => {
        const variant = variantById.get(level.variant_id)
        if (!variant) return []
        return [
          {
            product_id: variant.product_id,
            variant_id: variant.id,
            location_id: level.location_id,
            quantity: level.quantity,
            cost_price: costByVariant.get(variant.id) ?? null,
            product_cost_price: costByProduct.get(variant.product_id) ?? 0,
          },
        ]
      })
    },
  })

  const slowMovers = useMemo(() => {
    const stockByProduct = new Map<string, number>()
    for (const row of stockRows) {
      const unitCost = row.cost_price ?? row.product_cost_price
      const value = row.quantity * unitCost
      stockByProduct.set(row.product_id, (stockByProduct.get(row.product_id) || 0) + value)
    }

    return performance
      .filter((p) => (p.units_sold || 0) === 0)
      .map((p) => ({
        ...p,
        tiedUpValue: stockByProduct.get(p.product_id || '') || 0,
      }))
      .filter((p) => p.tiedUpValue > 0)
      .sort((a, b) => b.tiedUpValue - a.tiedUpValue)
  }, [performance, stockRows])

  const handleExportValuation = () => {
    const headers = [t('reports.branch'), t('reports.units'), t('reports.costValue'), t('reports.retailValue')]
    const rows = valuation.map((v) => {
      const names = v.location_id ? locationNames.get(v.location_id) : null
      const name = names ? (locale === 'ar' ? names.name_ar : names.name_en) : v.location_name_en || ''
      return [name, v.units || 0, num(v.cost_value), num(v.retail_value)]
    })
    downloadCsv('inventory-valuation.csv', buildCsv(headers, rows))
  }

  const handleExportSlowMovers = () => {
    const headers = [t('orderDetail.product'), t('reports.tiedUpValue')]
    const rows = slowMovers.map((p) => [getLocalized(p, 'name'), p.tiedUpValue])
    downloadCsv('slow-movers.csv', buildCsv(headers, rows))
  }

  const isLoading = valuationLoading || stockLoading

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <CardTitle>{t('reports.valuation')}</CardTitle>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportValuation}>
            {t('reports.exportCsv')}
          </Button>
        </CardHeader>
        <CardBody className="p-0">
          {valuation.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Warehouse} title={t('reports.noData')} />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('reports.branch')}</TH>
                  <TH className="text-end">{t('reports.units')}</TH>
                  <TH className="text-end">{t('reports.costValue')}</TH>
                  <TH className="text-end">{t('reports.retailValue')}</TH>
                </TR>
              </THead>
              <TBody>
                {valuation.map((v) => {
                  const names = v.location_id ? locationNames.get(v.location_id) : null
                  const name = names
                    ? locale === 'ar'
                      ? names.name_ar
                      : names.name_en
                    : v.location_name_en || '—'
                  return (
                    <TR key={v.location_id}>
                      <TD className="font-medium">{name}</TD>
                      <TD className="text-end" dir="ltr">
                        {formatNumber(v.units, locale)}
                      </TD>
                      <TD className="text-end" dir="ltr">
                        {formatMoney(v.cost_value, locale)}
                      </TD>
                      <TD className="text-end" dir="ltr">
                        {formatMoney(v.retail_value, locale)}
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" /> {t('reports.slowMovers')}
          </CardTitle>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportSlowMovers}>
            {t('reports.exportCsv')}
          </Button>
        </CardHeader>
        <CardBody className="p-0">
          <p className="flex items-center gap-2 border-b border-sand p-3 text-xs text-moss">
            <Info className="h-4 w-4 shrink-0" />
            {t('reports.slowMoversHint')}
          </p>
          {slowMovers.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Warehouse} title={t('reports.noSlowMovers')} />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('orderDetail.product')}</TH>
                  <TH className="text-end">{t('reports.tiedUpValue')}</TH>
                </TR>
              </THead>
              <TBody>
                {slowMovers.map((p) => (
                  <TR key={p.product_id}>
                    <TD className="font-medium">{getLocalized(p, 'name')}</TD>
                    <TD className="text-end" dir="ltr">
                      {formatMoney(p.tiedUpValue, locale)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
