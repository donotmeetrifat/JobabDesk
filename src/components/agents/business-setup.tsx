'use client'

import { useState, useEffect } from 'react'
import { Store, Truck, RotateCcw, Sparkles, Save, MessageCircle, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface BusinessSettings {
  name: string
  ai_business_description: string
  ai_delivery_policy: string
  ai_return_policy: string
  ai_auto_reply_tone: string
  ai_store_instructions: string
}

export function BusinessSetup() {
  const [settings, setSettings] = useState<BusinessSettings>({
    name: '',
    ai_business_description: '',
    ai_delivery_policy: '',
    ai_return_policy: '',
    ai_auto_reply_tone: 'friendly_bangla',
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
          ai_business_description: data.settings.ai_business_description || '',
          ai_delivery_policy: data.settings.ai_delivery_policy || '',
          ai_return_policy: data.settings.ai_return_policy || '',
          ai_auto_reply_tone: data.settings.ai_auto_reply_tone || 'friendly_bangla',
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
          ai_business_description: settings.ai_business_description,
          ai_delivery_policy: settings.ai_delivery_policy,
          ai_return_policy: settings.ai_return_policy,
          ai_auto_reply_tone: settings.ai_auto_reply_tone,
          ai_store_instructions: settings.ai_store_instructions,
        }),
      })
      if (!res.ok) throw new Error('Failed to save business profile')
      toast.success('Business setup and AI instructions saved!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Sparkles className="h-4 w-4 animate-spin text-primary" /> Loading business setup...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="rounded-2xl border bg-card p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Business Context & AI Behavior Setup</h2>
            <p className="text-xs text-muted-foreground">
              Define your business identity, delivery charges, return policies, and special rules so the AI speaks accurately on your behalf.
            </p>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 rounded-xl gap-2 shadow-sm shrink-0"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Business Profile'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Business Identity & Overview */}
        <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-3">
              <Store className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Business Profile & Description</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Tell the AI assistant what your shop sells, brand identity, and key selling points.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">Business / Store Overview</label>
              <textarea
                rows={4}
                value={settings.ai_business_description}
                onChange={(e) => setSettings({ ...settings, ai_business_description: e.target.value })}
                placeholder="e.g. We are an authentic Korean & Skincare e-commerce store in Bangladesh. We sell 100% original face washes, serums, sunscreens, and moisturizers with fast delivery."
                className="w-full rounded-xl border bg-background p-3.5 text-xs outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* Persona & Tone Selector */}
          <div className="space-y-2 pt-2 border-t">
            <label className="block text-xs font-semibold text-foreground flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5 text-primary" /> AI Voice & Tone Persona
            </label>
            <select
              value={settings.ai_auto_reply_tone}
              onChange={(e) => setSettings({ ...settings, ai_auto_reply_tone: e.target.value })}
              className="w-full rounded-xl border bg-background px-3.5 py-2.5 text-xs font-medium outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="friendly_bangla">Friendly Bangladeshi Bengali (ন্যাচারাল বাংলা & Banglish)</option>
              <option value="professional_english">Professional English (Formal & Precise)</option>
              <option value="short_direct">Short & Direct (সংক্ষিপ্ত ও সরাসরি)</option>
            </select>
          </div>
        </div>

        {/* Card 2: Delivery & Shipping Rules */}
        <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-3">
              <Truck className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Delivery Rates & Shipping Policy</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Specify delivery charges, delivery timeframes, and Cash on Delivery (COD) rules.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">Delivery Rates & Estimated Time</label>
              <textarea
                rows={4}
                value={settings.ai_delivery_policy}
                onChange={(e) => setSettings({ ...settings, ai_delivery_policy: e.target.value })}
                placeholder="e.g. Inside Dhaka delivery charge ৳60 (24-48 hours). Outside Dhaka delivery charge ৳120 (2-3 days). Free delivery on orders over ৳2000."
                className="w-full rounded-xl border bg-background p-3.5 text-xs outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* Card 3: Return & Refund Policy */}
        <div className="rounded-2xl border bg-card p-5 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 border-b pb-3">
            <RotateCcw className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Return & Refund Policy</h3>
          </div>

          <p className="text-xs text-muted-foreground">
            Define conditions for item returns, exchanges, or damage claims.
          </p>

          <textarea
            rows={3}
            value={settings.ai_return_policy}
            onChange={(e) => setSettings({ ...settings, ai_return_policy: e.target.value })}
            placeholder="e.g. Customers can exchange damaged items within 7 days with unboxing video proof. Intimate items cannot be returned."
            className="w-full rounded-xl border bg-background p-3.5 text-xs outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
          />
        </div>

        {/* Card 4: Special Instructions & FAQs */}
        <div className="rounded-2xl border bg-card p-5 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 border-b pb-3">
            <FileText className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Special Instructions & Custom FAQs</h3>
          </div>

          <p className="text-xs text-muted-foreground">
            Add any specific rules, payment methods (bKash/Nagad), or special guidelines.
          </p>

          <textarea
            rows={3}
            value={settings.ai_store_instructions}
            onChange={(e) => setSettings({ ...settings, ai_store_instructions: e.target.value })}
            placeholder="e.g. bKash Merchant Number: 01700000000. For urgent custom orders, advise customers to call support."
            className="w-full rounded-xl border bg-background p-3.5 text-xs outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
          />
        </div>
      </div>

      {/* Bottom Save Bar */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 py-2.5 rounded-xl gap-2 shadow-sm"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving Profile...' : 'Save Business Profile'}
        </Button>
      </div>
    </div>
  )
}
