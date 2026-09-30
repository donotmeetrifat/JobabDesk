'use client'

import { useState, useEffect } from 'react'
import { Store, Truck, RefreshCw, HelpCircle, Save, Sparkles, MessageSquare, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface BusinessProfileSettings {
  name: string
  ai_business_description: string
  delivery_policy: string
  return_policy: string
  special_instructions: string
  ai_persona: string
}

export function BusinessSetup() {
  const [settings, setSettings] = useState<BusinessProfileSettings>({
    name: '',
    ai_business_description: '',
    delivery_policy: '',
    return_policy: '',
    special_instructions: '',
    ai_persona: 'friendly_bangla',
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
          ai_business_description: data.settings.ai_business_description || data.settings.ai_store_instructions || '',
          delivery_policy: data.settings.delivery_policy || data.settings.ai_delivery_policy || '',
          return_policy: data.settings.return_policy || data.settings.ai_return_policy || '',
          special_instructions: data.settings.special_instructions || '',
          ai_persona: data.settings.ai_persona || data.settings.ai_auto_reply_tone || 'friendly_bangla',
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
          ai_store_instructions: settings.ai_business_description,
          delivery_policy: settings.delivery_policy,
          ai_delivery_policy: settings.delivery_policy,
          return_policy: settings.return_policy,
          ai_return_policy: settings.return_policy,
          special_instructions: settings.special_instructions,
          ai_persona: settings.ai_persona,
          ai_auto_reply_tone: settings.ai_persona,
        }),
      })
      if (!res.ok) throw new Error('Failed to save business profile')
      toast.success('Business Profile & AI Knowledge Base updated!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <Sparkles className="h-4 w-4 animate-spin text-primary" /> Loading business profile...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Single Action Bar */}
      <div className="rounded-2xl border bg-card p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Business Profile & AI Knowledge Base</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set up your shop details, delivery rates, return rules, and payment info. The AI uses this to reply to customers with 100% accuracy.
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

      {/* Spacious 2-Column Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Business Overview & Persona */}
        <div className="rounded-2xl border bg-card p-5 space-y-4 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 border-b pb-3">
              <Store className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm text-foreground">Business Overview & Brand Persona</h3>
            </div>

            <p className="text-xs text-muted-foreground">
              Describe what your business sells, brand values, and store identity.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground">Business / Store Overview</label>
              <textarea
                rows={4}
                value={settings.ai_business_description}
                onChange={(e) => setSettings({ ...settings, ai_business_description: e.target.value })}
                placeholder="e.g. Authentic Korean & UK skincare store in Dhaka. 100% original products."
                className="w-full rounded-xl border bg-background p-3.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
              />
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t">
            <label className="block text-xs font-semibold text-foreground flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-primary" /> AI Voice & Persona
            </label>
            <select
              value={settings.ai_persona}
              onChange={(e) => setSettings({ ...settings, ai_persona: e.target.value })}
              className="w-full rounded-xl border bg-background px-3.5 py-2.5 text-xs text-foreground font-medium outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="friendly_bangla">Friendly Bangladeshi Bengali (ন্যাচারাল বাংলা & Banglish)</option>
              <option value="professional_english">Professional English (Formal & Precise)</option>
              <option value="short_direct">Conversational Banglish (Short & Direct)</option>
            </select>
          </div>
        </div>

        {/* Card 2: Delivery Rates & Shipping Policy */}
        <div className="rounded-2xl border bg-card p-5 space-y-3 shadow-xs">
          <div className="flex items-center gap-2.5 border-b pb-3">
            <Truck className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Delivery Rates & Shipping Policy</h3>
          </div>

          <p className="text-xs text-muted-foreground">
            Specify shipping costs, delivery timeframes, and free delivery thresholds.
          </p>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">Delivery Rates & Estimated Time</label>
            <textarea
              rows={5}
              value={settings.delivery_policy}
              onChange={(e) => setSettings({ ...settings, delivery_policy: e.target.value })}
              placeholder="e.g. Inside Dhaka ৳80 (24-48 hrs), Outside Dhaka ৳150 (2-3 days). Free delivery on orders above ৳2000."
              className="w-full rounded-xl border bg-background p-3.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* Card 3: Return & Exchange Policy */}
        <div className="rounded-2xl border bg-card p-5 space-y-3 shadow-xs">
          <div className="flex items-center gap-2.5 border-b pb-3">
            <RefreshCw className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Return & Exchange Policy</h3>
          </div>

          <p className="text-xs text-muted-foreground">
            Explain terms for item replacements, defective products, or return conditions.
          </p>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">Return & Replacement Terms</label>
            <textarea
              rows={4}
              value={settings.return_policy}
              onChange={(e) => setSettings({ ...settings, return_policy: e.target.value })}
              placeholder="e.g. 7-day replacement for damaged items with unboxing video proof."
              className="w-full rounded-xl border bg-background p-3.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* Card 4: Payment Info & Custom FAQs */}
        <div className="rounded-2xl border bg-card p-5 space-y-3 shadow-xs">
          <div className="flex items-center gap-2.5 border-b pb-3">
            <HelpCircle className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm text-foreground">Payment Info & Custom FAQs</h3>
          </div>

          <p className="text-xs text-muted-foreground">
            Provide payment instructions (bKash/Nagad), Cash on Delivery options, or special customer FAQs.
          </p>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">Payment Methods & Special Instructions</label>
            <textarea
              rows={4}
              value={settings.special_instructions}
              onChange={(e) => setSettings({ ...settings, special_instructions: e.target.value })}
              placeholder="e.g. bKash Personal: 017XXXXX. We accept Cash on Delivery nationwide."
              className="w-full rounded-xl border bg-background p-3.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
