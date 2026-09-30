'use client'

import { useState, useEffect } from 'react'
import { Store, Users, Truck, CreditCard, Save, Sparkles, Pin, Handshake, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface GuidedBusinessProfile {
  name: string
  business_tagline: string
  ai_business_description: string
  product_categories_sold: string
  target_audience: string
  customer_relation_style: string
  ai_persona: string
  delivery_policy: string
  return_policy: string
  special_instructions: string
  ai_store_instructions: string
}

export function BusinessSetup() {
  const [settings, setSettings] = useState<GuidedBusinessProfile>({
    name: '',
    business_tagline: '',
    ai_business_description: '',
    product_categories_sold: '',
    target_audience: '',
    customer_relation_style: 'bhaiya_apu',
    ai_persona: 'friendly_bangla',
    delivery_policy: '',
    return_policy: '',
    special_instructions: '',
    ai_store_instructions: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/ai/settings')
      const data = await res.json()
      if (data.settings) {
        setSettings({
          name: data.settings.name || 'JobabDesk Store',
          business_tagline: data.settings.business_tagline || '',
          ai_business_description: data.settings.ai_business_description || data.settings.ai_store_instructions || '',
          product_categories_sold: data.settings.product_categories_sold || '',
          target_audience: data.settings.target_audience || '',
          customer_relation_style: data.settings.customer_relation_style || 'bhaiya_apu',
          ai_persona: data.settings.ai_persona || data.settings.ai_auto_reply_tone || 'friendly_bangla',
          delivery_policy: data.settings.delivery_policy || data.settings.ai_delivery_policy || '',
          return_policy: data.settings.return_policy || data.settings.ai_return_policy || '',
          special_instructions: data.settings.special_instructions || '',
          ai_store_instructions: data.settings.ai_store_instructions || '',
        })
      }
    } catch {
      // quiet catch
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settings.name,
          business_tagline: settings.business_tagline,
          ai_business_description: settings.ai_business_description,
          product_categories_sold: settings.product_categories_sold,
          target_audience: settings.target_audience,
          customer_relation_style: settings.customer_relation_style,
          ai_persona: settings.ai_persona,
          ai_auto_reply_tone: settings.ai_persona,
          delivery_policy: settings.delivery_policy,
          ai_delivery_policy: settings.delivery_policy,
          return_policy: settings.return_policy,
          ai_return_policy: settings.return_policy,
          special_instructions: settings.special_instructions,
          ai_store_instructions: settings.ai_store_instructions || settings.special_instructions,
        }),
      })
      if (!res.ok) throw new Error('Failed to save business profile')
      toast.success('Guided Business Profile & AI Knowledge Base updated!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Sparkles className="h-4 w-4 animate-spin text-primary" /> Loading guided business setup...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Action Bar */}
      <div className="rounded-2xl border bg-card p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Guided Business Profile & AI Knowledge Base</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete the 4 steps below to teach your AI agent how to represent your store, greet customers, and quote exact prices & policies.
            </p>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-2.5 rounded-xl gap-2 shadow-sm shrink-0"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving Profile...' : 'Save Business Profile'}
        </Button>
      </div>

      {/* 4 Step Cards */}
      <div className="space-y-6">
        {/* STEP 1: Core Business Identity */}
        <div className="rounded-2xl border bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 border-b pb-3">
            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
              1
            </div>
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <Pin className="h-4 w-4 text-primary" /> Core Business Identity (Compulsory)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">Business / Store Name *</label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                placeholder="e.g. Karim Cosmetics BD"
                className="w-full rounded-xl border bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">Business Tagline / Motto</label>
              <input
                type="text"
                value={settings.business_tagline}
                onChange={(e) => setSettings({ ...settings, business_tagline: e.target.value })}
                placeholder="e.g. 100% Authentic Original Korean & UK Skincare in Bangladesh"
                className="w-full rounded-xl border bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">Business Overview & Products Sold</label>
            <textarea
              rows={3}
              value={settings.ai_business_description}
              onChange={(e) => setSettings({ ...settings, ai_business_description: e.target.value })}
              placeholder="e.g. We sell imported skincare products including face washes, serums, sunscreens, and moisturizers with fast delivery."
              className="w-full rounded-xl border bg-background p-3.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">Product Categories Sold</label>
            <input
              type="text"
              value={settings.product_categories_sold}
              onChange={(e) => setSettings({ ...settings, product_categories_sold: e.target.value })}
              placeholder="e.g. Skincare, Haircare, Cosmetics"
              className="w-full rounded-xl border bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* STEP 2: Customer Profile & Communication Style */}
        <div className="rounded-2xl border bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 border-b pb-3">
            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
              2
            </div>
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <Handshake className="h-4 w-4 text-primary" /> Customer Profile & Communication Style
            </h3>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">Target Customer Profile</label>
            <input
              type="text"
              value={settings.target_audience}
              onChange={(e) => setSettings({ ...settings, target_audience: e.target.value })}
              placeholder="e.g. Beauty-conscious men & women in Bangladesh looking for genuine imported skincare."
              className="w-full rounded-xl border bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">Customer Relationship & Greeting Style</label>
              <select
                value={settings.customer_relation_style}
                onChange={(e) => setSettings({ ...settings, customer_relation_style: e.target.value })}
                className="w-full rounded-xl border bg-background px-3.5 py-2.5 text-xs text-foreground font-medium outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="bhaiya_apu">Friendly & Respectful (Bhaiya/Apu / ভাইয়া/আপু)</option>
                <option value="sir_madam">Professional & Formal (Sir/Madam / স্যার/ম্যাডাম)</option>
                <option value="casual_warm">Warm & Casual (Bengali / Banglish)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">AI Voice & Script Persona</label>
              <select
                value={settings.ai_persona}
                onChange={(e) => setSettings({ ...settings, ai_persona: e.target.value })}
                className="w-full rounded-xl border bg-background px-3.5 py-2.5 text-xs text-foreground font-medium outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="friendly_bangla">Friendly Bangladeshi Bengali (বাংলা Script & Banglish)</option>
                <option value="professional_en">Professional English</option>
                <option value="conversational_banglish">Conversational Banglish</option>
              </select>
            </div>
          </div>
        </div>

        {/* STEP 3: Delivery Rates & Return Policy */}
        <div className="rounded-2xl border bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 border-b pb-3">
            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
              3
            </div>
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" /> Delivery Rates & Return Policy
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">Delivery Charges & Shipping Time</label>
              <textarea
                rows={3}
                value={settings.delivery_policy}
                onChange={(e) => setSettings({ ...settings, delivery_policy: e.target.value })}
                placeholder="e.g. Inside Dhaka ৳80 (24-48 hrs), Outside Dhaka ৳150 (2-3 days). Free shipping above ৳2000."
                className="w-full rounded-xl border bg-background p-3.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">Return & Exchange Terms</label>
              <textarea
                rows={3}
                value={settings.return_policy}
                onChange={(e) => setSettings({ ...settings, return_policy: e.target.value })}
                placeholder="e.g. 7-day replacement for defective items with unboxing video proof."
                className="w-full rounded-xl border bg-background p-3.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* STEP 4: Payment Details & Special Instructions */}
        <div className="rounded-2xl border bg-card p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5 border-b pb-3">
            <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
              4
            </div>
            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Payment Details & Special Instructions
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">Payment Methods & Instructions</label>
              <textarea
                rows={3}
                value={settings.special_instructions}
                onChange={(e) => setSettings({ ...settings, special_instructions: e.target.value })}
                placeholder="e.g. bKash Personal: 017XXXXX. Cash on Delivery available nationwide."
                className="w-full rounded-xl border bg-background p-3.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">Special Guidelines & FAQs</label>
              <textarea
                rows={3}
                value={settings.ai_store_instructions}
                onChange={(e) => setSettings({ ...settings, ai_store_instructions: e.target.value })}
                placeholder="e.g. Urgent custom queries should call customer support."
                className="w-full rounded-xl border bg-background p-3.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
