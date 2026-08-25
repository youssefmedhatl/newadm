export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          order_id: string | null
          reason: string | null
          shift_id: string
          type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          reason?: string | null
          shift_id: string
          type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          order_id?: string | null
          reason?: string | null
          shift_id?: string
          type?: Database["public"]["Enums"]["cash_movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name_ar: string
          name_en: string
          parent_id: string | null
          position: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_ar: string
          name_en: string
          parent_id?: string | null
          position?: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_ar?: string
          name_en?: string
          parent_id?: string | null
          position?: number
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_products: {
        Row: {
          collection_id: string
          position: number
          product_id: string
        }
        Insert: {
          collection_id: string
          position?: number
          product_id: string
        }
        Update: {
          collection_id?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          position: number
          slug: string
          subtitle_ar: string | null
          subtitle_en: string | null
          title_ar: string
          title_en: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          position?: number
          slug: string
          subtitle_ar?: string | null
          subtitle_en?: string | null
          title_ar: string
          title_en: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          position?: number
          slug?: string
          subtitle_ar?: string | null
          subtitle_en?: string | null
          title_ar?: string
          title_en?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_blocks: {
        Row: {
          body_ar: string | null
          body_en: string | null
          cta_href: string | null
          cta_label_ar: string | null
          cta_label_en: string | null
          id: string
          is_active: boolean
          key: string
          kind: string
          media_type: string | null
          media_url: string | null
          position: number
          subtitle_ar: string | null
          subtitle_en: string | null
          title_ar: string | null
          title_en: string | null
          updated_at: string
        }
        Insert: {
          body_ar?: string | null
          body_en?: string | null
          cta_href?: string | null
          cta_label_ar?: string | null
          cta_label_en?: string | null
          id?: string
          is_active?: boolean
          key: string
          kind?: string
          media_type?: string | null
          media_url?: string | null
          position?: number
          subtitle_ar?: string | null
          subtitle_en?: string | null
          title_ar?: string | null
          title_en?: string | null
          updated_at?: string
        }
        Update: {
          body_ar?: string | null
          body_en?: string | null
          cta_href?: string | null
          cta_label_ar?: string | null
          cta_label_en?: string | null
          id?: string
          is_active?: boolean
          key?: string
          kind?: string
          media_type?: string | null
          media_url?: string | null
          position?: number
          subtitle_ar?: string | null
          subtitle_en?: string | null
          title_ar?: string | null
          title_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          city: string
          created_at: string
          customer_id: string
          full_name: string | null
          governorate: string | null
          id: string
          is_default: boolean
          label: string | null
          landmark: string | null
          line1: string
          line2: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          customer_id: string
          full_name?: string | null
          governorate?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          landmark?: string | null
          line1: string
          line2?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          customer_id?: string
          full_name?: string | null
          governorate?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          landmark?: string | null
          line1?: string
          line2?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          birthday: string | null
          city: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_blocked: boolean
          last_order_at: string | null
          loyalty_points: number
          notes: string | null
          orders_count: number
          phone: string | null
          tags: string[]
          total_spent: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          birthday?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_blocked?: boolean
          last_order_at?: string | null
          loyalty_points?: number
          notes?: string | null
          orders_count?: number
          phone?: string | null
          tags?: string[]
          total_spent?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          birthday?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_blocked?: boolean
          last_order_at?: string | null
          loyalty_points?: number
          notes?: string | null
          orders_count?: number
          phone?: string | null
          tags?: string[]
          total_spent?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      discounts: {
        Row: {
          applies_to_category_id: string | null
          applies_to_product_id: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          max_discount: number | null
          min_subtotal: number
          per_customer_limit: number | null
          starts_at: string
          type: Database["public"]["Enums"]["discount_type"]
          updated_at: string
          usage_limit: number | null
          used_count: number
          value: number
        }
        Insert: {
          applies_to_category_id?: string | null
          applies_to_product_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_subtotal?: number
          per_customer_limit?: number | null
          starts_at?: string
          type?: Database["public"]["Enums"]["discount_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value: number
        }
        Update: {
          applies_to_category_id?: string | null
          applies_to_product_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_subtotal?: number
          per_customer_limit?: number | null
          starts_at?: string
          type?: Database["public"]["Enums"]["discount_type"]
          updated_at?: string
          usage_limit?: number | null
          used_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "discounts_applies_to_category_id_fkey"
            columns: ["applies_to_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discounts_applies_to_product_id_fkey"
            columns: ["applies_to_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discounts_applies_to_product_id_fkey"
            columns: ["applies_to_product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "discounts_applies_to_product_id_fkey"
            columns: ["applies_to_product_id"]
            isOneToOne: false
            referencedRelation: "v_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "discounts_applies_to_product_id_fkey"
            columns: ["applies_to_product_id"]
            isOneToOne: false
            referencedRelation: "v_storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string | null
          note: string | null
          paid_from_drawer: boolean
          shift_id: string | null
          spent_on: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          note?: string | null
          paid_from_drawer?: boolean
          shift_id?: string | null
          spent_on?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string | null
          note?: string | null
          paid_from_drawer?: boolean
          shift_id?: string | null
          spent_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_levels: {
        Row: {
          id: string
          location_id: string
          quantity: number
          reorder_point: number
          reorder_qty: number
          reserved: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          id?: string
          location_id: string
          quantity?: number
          reorder_point?: number
          reorder_qty?: number
          reserved?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          id?: string
          location_id?: string
          quantity?: number
          reorder_point?: number
          reorder_qty?: number
          reserved?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          location_id: string
          note: string | null
          reason: Database["public"]["Enums"]["movement_reason"]
          reference_id: string | null
          reference_type: string | null
          unit_cost: number | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          location_id: string
          note?: string | null
          reason: Database["public"]["Enums"]["movement_reason"]
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          location_id?: string
          note?: string | null
          reason?: Database["public"]["Enums"]["movement_reason"]
          reference_id?: string | null
          reference_type?: string | null
          unit_cost?: number | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          is_warehouse: boolean
          name_ar: string
          name_en: string
          phone: string | null
          position: number
          sells_online: boolean
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_warehouse?: boolean
          name_ar: string
          name_en: string
          phone?: string | null
          position?: number
          sells_online?: boolean
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_warehouse?: boolean
          name_ar?: string
          name_en?: string
          phone?: string | null
          position?: number
          sells_online?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          note: string | null
          order_id: string | null
          points: number
          reason: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          note?: string | null
          order_id?: string | null
          points: number
          reason: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          note?: string | null
          order_id?: string | null
          points?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      marquee_messages: {
        Row: {
          id: string
          is_active: boolean
          position: number
          text_ar: string
          text_en: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          position?: number
          text_ar: string
          text_en: string
        }
        Update: {
          id?: string
          is_active?: boolean
          position?: number
          text_ar?: string
          text_en?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          is_subscribed: boolean
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_subscribed?: boolean
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_subscribed?: boolean
          source?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          link: string | null
          severity: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          severity?: string
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          severity?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_code: string | null
          event_params: Json
          id: string
          message: string | null
          meta: Json | null
          order_id: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_code?: string | null
          event_params?: Json
          id?: string
          message?: string | null
          meta?: Json | null
          order_id: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_code?: string | null
          event_params?: Json
          id?: string
          message?: string | null
          meta?: Json | null
          order_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          color_name: string | null
          created_at: string
          discount: number
          id: string
          image_url: string | null
          order_id: string
          product_id: string | null
          product_name: string
          product_name_ar: string | null
          quantity: number
          quantity_returned: number
          size: string | null
          sku: string | null
          total: number
          unit_cost: number
          unit_price: number
          variant_id: string | null
          variant_label: string | null
        }
        Insert: {
          color_name?: string | null
          created_at?: string
          discount?: number
          id?: string
          image_url?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          product_name_ar?: string | null
          quantity: number
          quantity_returned?: number
          size?: string | null
          sku?: string | null
          total?: number
          unit_cost?: number
          unit_price: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Update: {
          color_name?: string | null
          created_at?: string
          discount?: number
          id?: string
          image_url?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          product_name_ar?: string | null
          quantity?: number
          quantity_returned?: number
          size?: string | null
          sku?: string | null
          total?: number
          unit_cost?: number
          unit_price?: number
          variant_id?: string | null
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_storefront_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_paid: number
          amount_refunded: number
          amount_tendered: number | null
          cancel_reason: string | null
          cashier_id: string | null
          change_given: number | null
          channel: Database["public"]["Enums"]["order_channel"]
          completed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          customer_id: string | null
          discount_code: string | null
          discount_id: string | null
          discount_total: number
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          location_id: string | null
          notes: string | null
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string
          points_earned: number
          points_redeemed: number
          shift_id: string | null
          shipping_address: Json | null
          shipping_total: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          amount_refunded?: number
          amount_tendered?: number | null
          cancel_reason?: string | null
          cashier_id?: string | null
          change_given?: number | null
          channel: Database["public"]["Enums"]["order_channel"]
          completed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_id?: string | null
          discount_code?: string | null
          discount_id?: string | null
          discount_total?: number
          fulfillment?: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          location_id?: string | null
          notes?: string | null
          order_number: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          placed_at?: string
          points_earned?: number
          points_redeemed?: number
          shift_id?: string | null
          shipping_address?: Json | null
          shipping_total?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          amount_refunded?: number
          amount_tendered?: number | null
          cancel_reason?: string | null
          cashier_id?: string | null
          change_given?: number | null
          channel?: Database["public"]["Enums"]["order_channel"]
          completed_at?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          customer_id?: string | null
          discount_code?: string | null
          discount_id?: string | null
          discount_total?: number
          fulfillment?: Database["public"]["Enums"]["fulfillment_type"]
          id?: string
          location_id?: string | null
          notes?: string | null
          order_number?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_status?: Database["public"]["Enums"]["payment_status"]
          placed_at?: string
          points_earned?: number
          points_redeemed?: number
          shift_id?: string | null
          shipping_address?: Json | null
          shipping_total?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_discount_id_fkey"
            columns: ["discount_id"]
            isOneToOne: false
            referencedRelation: "discounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      product_costs: {
        Row: {
          cost_price: number
          product_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cost_price?: number
          product_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cost_price?: number
          product_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_costs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "v_storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt: string | null
          color_name: string | null
          created_at: string
          id: string
          position: number
          product_id: string
          url: string
        }
        Insert: {
          alt?: string | null
          color_name?: string | null
          created_at?: string
          id?: string
          position?: number
          product_id: string
          url: string
        }
        Update: {
          alt?: string | null
          color_name?: string | null
          created_at?: string
          id?: string
          position?: number
          product_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          color_hex: string | null
          color_name: string | null
          cost_price: number | null
          created_at: string
          id: string
          is_active: boolean
          position: number
          price: number | null
          product_id: string
          size: string | null
          sku: string
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          barcode?: string | null
          color_hex?: string | null
          color_name?: string | null
          cost_price?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          position?: number
          price?: number | null
          product_id: string
          size?: string | null
          sku: string
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          barcode?: string | null
          color_hex?: string | null
          color_name?: string | null
          cost_price?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          position?: number
          price?: number | null
          product_id?: string
          size?: string | null
          sku?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          care_ar: string | null
          care_en: string | null
          category_id: string | null
          compare_at_price: number | null
          cost_price: number
          created_at: string
          created_by: string | null
          description_ar: string | null
          description_en: string | null
          id: string
          is_featured: boolean
          is_new: boolean
          material_ar: string | null
          material_en: string | null
          name_ar: string
          name_en: string
          price: number
          published_at: string | null
          rating_avg: number
          rating_count: number
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          tags: string[]
          total_sold: number
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          care_ar?: string | null
          care_en?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_featured?: boolean
          is_new?: boolean
          material_ar?: string | null
          material_en?: string | null
          name_ar: string
          name_en: string
          price?: number
          published_at?: string | null
          rating_avg?: number
          rating_count?: number
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          tags?: string[]
          total_sold?: number
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          care_ar?: string | null
          care_en?: string | null
          category_id?: string | null
          compare_at_price?: number | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description_ar?: string | null
          description_en?: string | null
          id?: string
          is_featured?: boolean
          is_new?: boolean
          material_ar?: string | null
          material_en?: string | null
          name_ar?: string
          name_en?: string
          price?: number
          published_at?: string | null
          rating_avg?: number
          rating_count?: number
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          tags?: string[]
          total_sold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          location_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          last_seen_at?: string | null
          location_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          location_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number
          unit_cost: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number
          unit_cost?: number
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number
          unit_cost?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          expected_at: string | null
          id: string
          location_id: string
          notes: string | null
          received_at: string | null
          reference: string
          shipping_cost: number
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          supplier_id: string | null
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          location_id: string
          notes?: string | null
          received_at?: string | null
          reference: string
          shipping_cost?: number
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expected_at?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          received_at?: string | null
          reference?: string
          shipping_cost?: number
          status?: Database["public"]["Enums"]["po_status"]
          subtotal?: number
          supplier_id?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      return_items: {
        Row: {
          id: string
          order_item_id: string
          quantity: number
          restock: boolean
          return_id: string
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          id?: string
          order_item_id: string
          quantity: number
          restock?: boolean
          return_id: string
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          id?: string
          order_item_id?: string
          quantity?: number
          restock?: boolean
          return_id?: string
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          order_id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          reference: string
          refund_amount: number
          restock: boolean
          shift_id: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          order_id: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          reference: string
          refund_amount?: number
          restock?: boolean
          shift_id?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          order_id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          reference?: string
          refund_amount?: number
          restock?: boolean
          shift_id?: string | null
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          author_name: string
          body: string | null
          created_at: string
          customer_id: string | null
          id: string
          product_id: string
          rating: number
          replied_at: string | null
          reply: string | null
          status: Database["public"]["Enums"]["review_status"]
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          author_name: string
          body?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          product_id: string
          rating: number
          replied_at?: string | null
          reply?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          author_name?: string
          body?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          product_id?: string
          rating?: number
          replied_at?: string | null
          reply?: string | null
          status?: Database["public"]["Enums"]["review_status"]
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          description: string | null
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          location_id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_float: number
          status: Database["public"]["Enums"]["shift_status"]
          updated_at: string
          variance: number | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          location_id: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string
          variance?: number | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          location_id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_float?: number
          status?: Database["public"]["Enums"]["shift_status"]
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transfer_items: {
        Row: {
          id: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Insert: {
          id?: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Update: {
          id?: string
          quantity?: number
          transfer_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "stock_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfer_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      stock_transfers: {
        Row: {
          created_at: string
          created_by: string | null
          from_location_id: string
          id: string
          notes: string | null
          received_at: string | null
          reference: string
          sent_at: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_location_id: string
          id?: string
          notes?: string | null
          received_at?: string | null
          reference: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_location_id?: string
          id?: string
          notes?: string | null
          received_at?: string | null
          reference?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      variant_costs: {
        Row: {
          cost_price: number | null
          updated_at: string
          updated_by: string | null
          variant_id: string
        }
        Insert: {
          cost_price?: number | null
          updated_at?: string
          updated_by?: string | null
          variant_id: string
        }
        Update: {
          cost_price?: number | null
          updated_at?: string
          updated_by?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "variant_costs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "variant_costs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_daily_sales: {
        Row: {
          avg_order_value: number | null
          channel: Database["public"]["Enums"]["order_channel"] | null
          day: string | null
          discounts: number | null
          location_id: string | null
          net_revenue: number | null
          orders: number | null
          refunded: number | null
          revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_inventory_valuation: {
        Row: {
          cost_value: number | null
          location_id: string | null
          location_name_en: string | null
          retail_value: number | null
          units: number | null
          variant_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_low_stock: {
        Row: {
          available: number | null
          color_name: string | null
          level_id: string | null
          location_id: string | null
          location_name_ar: string | null
          location_name_en: string | null
          product_id: string | null
          product_name_ar: string | null
          product_name_en: string | null
          quantity: number | null
          reorder_point: number | null
          reorder_qty: number | null
          reserved: number | null
          size: string | null
          sku: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_levels_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_stock"
            referencedColumns: ["variant_id"]
          },
        ]
      }
      v_product_performance: {
        Row: {
          category_name_en: string | null
          cost: number | null
          last_sold_at: string | null
          name_ar: string | null
          name_en: string | null
          product_id: string | null
          profit: number | null
          revenue: number | null
          status: Database["public"]["Enums"]["product_status"] | null
          units_returned: number | null
          units_sold: number | null
        }
        Relationships: []
      }
      v_sales_by_hour: {
        Row: {
          day_of_week: number | null
          hour_of_day: number | null
          orders: number | null
          revenue: number | null
        }
        Relationships: []
      }
      v_staff_sales: {
        Row: {
          cashier_id: string | null
          cashier_name: string | null
          day: string | null
          orders: number | null
          revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_storefront_products: {
        Row: {
          available_stock: number | null
          brand_name: string | null
          category_id: string | null
          category_name_ar: string | null
          category_name_en: string | null
          category_slug: string | null
          colors: string[] | null
          compare_at_price: number | null
          description_ar: string | null
          description_en: string | null
          id: string | null
          is_featured: boolean | null
          is_new: boolean | null
          name_ar: string | null
          name_en: string | null
          price: number | null
          primary_image: string | null
          published_at: string | null
          rating_avg: number | null
          rating_count: number | null
          sizes: string[] | null
          slug: string | null
          tags: string[] | null
          total_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      v_variant_stock: {
        Row: {
          available: number | null
          barcode: string | null
          color_hex: string | null
          color_name: string | null
          cost_price: number | null
          is_active: boolean | null
          on_hand: number | null
          price: number | null
          product_id: string | null
          product_name_ar: string | null
          product_name_en: string | null
          product_status: Database["public"]["Enums"]["product_status"] | null
          reorder_point: number | null
          reserved: number | null
          size: string | null
          sku: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_product_performance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_storefront_products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_delta: number
          p_location_id: string
          p_note?: string
          p_reason?: Database["public"]["Enums"]["movement_reason"]
          p_variant_id: string
        }
        Returns: {
          id: string
          location_id: string
          quantity: number
          reorder_point: number
          reorder_qty: number
          reserved: number
          updated_at: string
          variant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_levels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assert_shift_usable: {
        Args: { p_location_id?: string; p_shift_id: string }
        Returns: undefined
      }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      available_qty: {
        Args: { l: Database["public"]["Tables"]["inventory_levels"]["Row"] }
        Returns: number
      }
      award_loyalty_points: { Args: { p_order_id: string }; Returns: number }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: {
          amount_paid: number
          amount_refunded: number
          amount_tendered: number | null
          cancel_reason: string | null
          cashier_id: string | null
          change_given: number | null
          channel: Database["public"]["Enums"]["order_channel"]
          completed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          customer_id: string | null
          discount_code: string | null
          discount_id: string | null
          discount_total: number
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          location_id: string | null
          notes: string | null
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string
          points_earned: number
          points_redeemed: number
          shift_id: string | null
          shipping_address: Json | null
          shipping_total: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      close_shift: {
        Args: { p_counted_cash: number; p_notes?: string; p_shift_id: string }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          location_id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_float: number
          status: Database["public"]["Enums"]["shift_status"]
          updated_at: string
          variance: number | null
        }
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_order: {
        Args: { p_order_id: string; p_shift_id?: string }
        Returns: {
          amount_paid: number
          amount_refunded: number
          amount_tendered: number | null
          cancel_reason: string | null
          cashier_id: string | null
          change_given: number | null
          channel: Database["public"]["Enums"]["order_channel"]
          completed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          customer_id: string | null
          discount_code: string | null
          discount_id: string | null
          discount_total: number
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          location_id: string | null
          notes: string | null
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string
          points_earned: number
          points_redeemed: number
          shift_id: string | null
          shipping_address: Json | null
          shipping_total: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_stock_transfer: {
        Args: { p_transfer_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          from_location_id: string
          id: string
          notes: string | null
          received_at: string | null
          reference: string
          sent_at: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_transfers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_reservation: { Args: { p_order_id: string }; Returns: undefined }
      create_online_order: {
        Args: {
          p_address?: Json
          p_contact_email?: string
          p_contact_name: string
          p_contact_phone: string
          p_discount_code?: string
          p_fulfillment?: Database["public"]["Enums"]["fulfillment_type"]
          p_items: Json
          p_location_id?: string
          p_notes?: string
        }
        Returns: {
          amount_paid: number
          amount_refunded: number
          amount_tendered: number | null
          cancel_reason: string | null
          cashier_id: string | null
          change_given: number | null
          channel: Database["public"]["Enums"]["order_channel"]
          completed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          customer_id: string | null
          discount_code: string | null
          discount_id: string | null
          discount_total: number
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          location_id: string | null
          notes: string | null
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string
          points_earned: number
          points_redeemed: number
          shift_id: string | null
          shipping_address: Json | null
          shipping_total: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_pos_sale: {
        Args: {
          p_amount_tendered?: number
          p_customer_id?: string
          p_discount_code?: string
          p_items: Json
          p_location_id: string
          p_manual_discount?: number
          p_notes?: string
          p_redeem_points?: number
          p_shift_id?: string
        }
        Returns: {
          amount_paid: number
          amount_refunded: number
          amount_tendered: number | null
          cancel_reason: string | null
          cashier_id: string | null
          change_given: number | null
          channel: Database["public"]["Enums"]["order_channel"]
          completed_at: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          customer_id: string | null
          discount_code: string | null
          discount_id: string | null
          discount_total: number
          fulfillment: Database["public"]["Enums"]["fulfillment_type"]
          id: string
          location_id: string | null
          notes: string | null
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_status: Database["public"]["Enums"]["payment_status"]
          placed_at: string
          points_earned: number
          points_redeemed: number
          shift_id: string | null
          shipping_address: Json | null
          shipping_total: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_setting: { Args: { p_default?: Json; p_key: string }; Returns: Json }
      has_role: {
        Args: { allowed: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      is_manager: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      my_customer_id: { Args: never; Returns: string }
      next_order_number: { Args: never; Returns: string }
      open_shift: {
        Args: { p_location_id: string; p_opening_float?: number }
        Returns: {
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          location_id: string
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_float: number
          status: Database["public"]["Enums"]["shift_status"]
          updated_at: string
          variance: number | null
        }
        SetofOptions: {
          from: "*"
          to: "shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      order_line_paid_per_unit: {
        Args: { p_order_item_id: string }
        Returns: number
      }
      process_return: {
        Args: {
          p_lines: Json
          p_order_id: string
          p_reason?: string
          p_shift_id?: string
        }
        Returns: {
          created_at: string
          id: string
          location_id: string | null
          order_id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          reference: string
          refund_amount: number
          restock: boolean
          shift_id: string | null
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "returns"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      receive_purchase_order: {
        Args: { p_lines: Json; p_po_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          expected_at: string | null
          id: string
          location_id: string
          notes: string | null
          received_at: string | null
          reference: string
          shipping_cost: number
          status: Database["public"]["Enums"]["po_status"]
          subtotal: number
          supplier_id: string | null
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "purchase_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_cash_movement: {
        Args: {
          p_amount: number
          p_reason?: string
          p_shift_id: string
          p_type: Database["public"]["Enums"]["cash_movement_type"]
        }
        Returns: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          order_id: string | null
          reason: string | null
          shift_id: string
          type: Database["public"]["Enums"]["cash_movement_type"]
        }
        SetofOptions: {
          from: "*"
          to: "cash_movements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      redeem_points: {
        Args: { p_customer_id: string; p_points: number }
        Returns: number
      }
      release_reservation: { Args: { p_order_id: string }; Returns: undefined }
      reverse_redemption: {
        Args: { p_customer_id: string; p_note?: string; p_points: number }
        Returns: number
      }
      set_stock: {
        Args: {
          p_counted: number
          p_location_id: string
          p_note?: string
          p_variant_id: string
        }
        Returns: {
          id: string
          location_id: string
          quantity: number
          reorder_point: number
          reorder_qty: number
          reserved: number
          updated_at: string
          variant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_levels"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      shift_expected_cash: { Args: { p_shift_id: string }; Returns: number }
      validate_discount: {
        Args: {
          p_code: string
          p_customer_id?: string
          p_eligible_subtotal?: number
          p_subtotal: number
        }
        Returns: Json
      }
      variant_price: {
        Args: { v: Database["public"]["Tables"]["product_variants"]["Row"] }
        Returns: number
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "manager"
        | "cashier"
        | "stock"
        | "viewer"
        | "customer"
      cash_movement_type:
        | "opening_float"
        | "sale"
        | "refund"
        | "pay_in"
        | "pay_out"
        | "expense"
        | "closing"
      discount_type: "percentage" | "fixed"
      fulfillment_type: "pickup" | "delivery" | "in_store"
      movement_reason:
        | "initial"
        | "sale"
        | "return"
        | "purchase"
        | "adjustment"
        | "transfer_in"
        | "transfer_out"
        | "damage"
        | "stocktake"
        | "cancellation"
      order_channel: "pos" | "online"
      order_status:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "out_for_delivery"
        | "completed"
        | "cancelled"
      payment_method: "cash" | "cash_on_delivery"
      payment_status: "unpaid" | "paid" | "partially_refunded" | "refunded"
      po_status:
        | "draft"
        | "ordered"
        | "partially_received"
        | "received"
        | "cancelled"
      product_status: "draft" | "active" | "archived"
      return_status: "pending" | "approved" | "rejected" | "completed"
      review_status: "pending" | "approved" | "rejected"
      shift_status: "open" | "closed"
      transfer_status: "draft" | "in_transit" | "received" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager", "cashier", "stock", "viewer", "customer"],
      cash_movement_type: [
        "opening_float",
        "sale",
        "refund",
        "pay_in",
        "pay_out",
        "expense",
        "closing",
      ],
      discount_type: ["percentage", "fixed"],
      fulfillment_type: ["pickup", "delivery", "in_store"],
      movement_reason: [
        "initial",
        "sale",
        "return",
        "purchase",
        "adjustment",
        "transfer_in",
        "transfer_out",
        "damage",
        "stocktake",
        "cancellation",
      ],
      order_channel: ["pos", "online"],
      order_status: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "out_for_delivery",
        "completed",
        "cancelled",
      ],
      payment_method: ["cash", "cash_on_delivery"],
      payment_status: ["unpaid", "paid", "partially_refunded", "refunded"],
      po_status: [
        "draft",
        "ordered",
        "partially_received",
        "received",
        "cancelled",
      ],
      product_status: ["draft", "active", "archived"],
      return_status: ["pending", "approved", "rejected", "completed"],
      review_status: ["pending", "approved", "rejected"],
      shift_status: ["open", "closed"],
      transfer_status: ["draft", "in_transit", "received", "cancelled"],
    },
  },
} as const
