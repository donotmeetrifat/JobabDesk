'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Save,
  Sparkles,
  Bot,
  Truck,
  CreditCard,
  CheckCircle2,
  PlayCircle,
  Eye,
  X,
  Plus,
  Info,
  Copy,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

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

const EMPTY_PROFILE: GuidedBusinessProfile = {
  name: '',
  business_tagline: '',
  ai_business_description: '',
  product_categories_sold: '',
  target_audience: '',
  customer_relation_style: 'Warm & Helpful (Consultative & Polite)',
  ai_persona: 'English Standard (with bilingual Bengali greetings)',
  delivery_policy: '',
  return_policy: '',
  special_instructions: '',
  ai_store_instructions: '',
}

interface BusinessSetupProps {
  onNavigateToPlayground?: () => void
  onReadinessChange?: (percent: number) => void
}

export function BusinessSetup({ onNavigateToPlayground, onReadinessChange }: BusinessSetupProps) {
  const [settings, setSettings] = useState<GuidedBusinessProfile>(EMPTY_PROFILE)
  const [initialSettings, setInitialSettings] = useState<GuidedBusinessProfile>(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/settings')
      const data = await res.json()
      if (data.settings) {
        const loaded: GuidedBusinessProfile = {
          name: data.settings.name || '',
          business_tagline: data.settings.business_tagline || '',
          ai_business_description: data.settings.ai_business_description || '',
          product_categories_sold: data.settings.product_categories_sold || '',
          target_audience: data.settings.target_audience || '',
          customer_relation_style: data.settings.customer_relation_style || 'Warm & Helpful (Consultative & Polite)',
          ai_persona: data.settings.ai_persona || data.settings.ai_auto_reply_tone || 'English Standard (with bilingual Bengali greetings)',
          delivery_policy: data.settings.delivery_policy || data.settings.ai_delivery_policy || '',
          return_policy: data.settings.return_policy || data.settings.ai_return_policy || '',
          special_instructions: data.settings.special_instructions || '',
          ai_store_instructions: data.settings.ai_store_instructions || '',
        }
        setSettings(loaded)
        setInitialSettings(loaded)
        setLastSavedTime('Just loaded')
      }
    } catch {
      // quiet catch
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = useCallback(async () => {
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
          ai_store_instructions: settings.ai_store_instructions || '',
        }),
      })
      if (!res.ok) throw new Error('Failed to save business profile')
      setInitialSettings(settings)
      setLastSavedTime('Just now')
      toast.success('Business profile & AI Knowledge Base successfully updated!')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }, [settings])

  // Listen for Ctrl+S / Cmd+S
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSave])

  const handleDiscard = () => {
    setSettings(initialSettings)
    toast.info('Changes discarded to last saved state.')
  }

  // Categories Tag Management
  const tags = useMemo(() => {
    return settings.product_categories_sold
      ? settings.product_categories_sold
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : []
  }, [settings.product_categories_sold])

  const handleAddTag = () => {
    const trimmed = newTagInput.trim()
    if (!trimmed) return
    const currentList = [...tags]
    if (!currentList.includes(trimmed)) {
      currentList.push(trimmed)
      setSettings((prev) => ({
        ...prev,
        product_categories_sold: currentList.join(', '),
      }))
    }
    setNewTagInput('')
  }

  const handleRemoveTag = (tagToRemove: string) => {
    const currentList = tags.filter((t) => t !== tagToRemove)
    setSettings((prev) => ({
      ...prev,
      product_categories_sold: currentList.join(', '),
    }))
  }

  // Dynamic Readiness Calculation
  const { readinessSteps, readinessPercent } = useMemo(() => {
    let completed = 0
    if (settings.name.trim() && (settings.ai_business_description.trim() || settings.product_categories_sold.trim())) {
      completed += 1
    }
    if (settings.target_audience.trim() && settings.customer_relation_style && settings.ai_persona) {
      completed += 1
    }
    if (settings.delivery_policy.trim() || settings.return_policy.trim()) {
      completed += 1
    }
    if (settings.special_instructions.trim() || settings.ai_store_instructions.trim()) {
      completed += 1
    }
    const percent = Math.round((completed / 4) * 100)
    return { readinessSteps: completed, readinessPercent: percent }
  }, [settings])

  useEffect(() => {
    onReadinessChange?.(readinessPercent)
  }, [readinessPercent, onReadinessChange])

  // Presets Helpers
  const appendPreset = (field: keyof GuidedBusinessProfile, text: string) => {
    setSettings((prev) => {
      const current = prev[field]
      if (!current.trim()) return { ...prev, [field]: text }
      if (current.includes(text)) return prev
      return { ...prev, [field]: `${current.trim()}\n${text}` }
    })
  }

  // Compiled System Prompt for Preview
  const compiledPrompt = useMemo(() => {
    return `=== STORE IDENTITY & CORE KNOWLEDGE ===
Store Name: ${settings.name.trim() || '(Not set yet)'}
Tagline: ${settings.business_tagline.trim() || 'N/A'}
Description: ${settings.ai_business_description.trim() || 'N/A'}
Product Categories: ${settings.product_categories_sold.trim() || 'All catalog inventory'}

=== AUDIENCE & CONVERSATIONAL PERSONA ===
Target Audience: ${settings.target_audience.trim() || 'All shoppers'}
Formality & Salutation: ${settings.customer_relation_style}
Language & Tone Style: ${settings.ai_persona}

=== SHIPPING & LOGISTICS SLA ===
${settings.delivery_policy.trim() || 'Standard delivery terms apply.'}

=== RETURN, EXCHANGE & REFUNDS ===
${settings.return_policy.trim() || 'Contact support for return inquiries.'}

=== PAYMENT & CHECKOUT INSTRUCTIONS ===
${settings.special_instructions.trim() || 'Cash on Delivery and Mobile Banking accepted.'}

=== HUMAN ESCALATION PROTOCOL ===
${settings.ai_store_instructions.trim() || 'If customer requests custom handling, tag #NeedsHumanLead and escalate.'}`
  }, [settings])

  const copyPromptToClipboard = () => {
    void navigator.clipboard.writeText(compiledPrompt)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
    toast.success('System prompt copied to clipboard!')
  }

  // Live Simulated Persona Preview Text
  const simulatedMessage = useMemo(() => {
    const storeName = settings.name.trim() || 'Aura Home Living'
    const topCategories = tags.length > 0 ? tags.slice(0, 2).join(', ').toLowerCase() : 'custom ceramics, lighting recommendations'
    if (settings.customer_relation_style.includes('Sir/Madam')) {
      return `“Hello Sir/Madam! Welcome to ${storeName}. Are you looking for ${topCategories}, catalog recommendations, or need an update on an existing order? I am pleased to assist you.”`
    }
    if (settings.customer_relation_style.includes('Bhai/Apu')) {
      return `“আসসালামু আলাইকুম ভাইয়া/আপু! ${storeName}-এ আপনাকে স্বাগতম। আপনি কি ${topCategories} সম্পর্কিত কোনো তথ্য বা আপনার অর্ডারের আপডেট খুঁজছেন? আমি আপনাকে সাহায্য করতে পেরে আনন্দিত!”`
    }
    if (settings.customer_relation_style.includes('Direct')) {
      return `“Hi! Welcome to ${storeName}. Check out our featured ${topCategories} or reply with your order number to track delivery instantly.”`
    }
    return `“Hello! Welcome to ${storeName}. Are you looking for ${topCategories}, or need an update on an existing order? I’m delighted to help you find the perfect piece!”`
  }, [settings.name, settings.customer_relation_style, tags])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-xs text-muted-foreground">
        <Sparkles className="h-4 w-4 animate-spin text-primary" />
        <span>Loading guided business setup...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Compact Progress & Quick Controls Strip */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card px-5 py-3.5 shadow-xs md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            {readinessSteps}/4
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Business Profile Readiness</span>
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {readinessPercent}% Complete
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${readinessPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="mr-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>{lastSavedTime ? `Auto-saved ${lastSavedTime}` : 'All changes up-to-date'}</span>
          </span>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span>Preview System Prompt</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? 'Saving...' : 'Save Profile'}</span>
          </button>
        </div>
      </div>

      {/* Main 4 Step Cards */}
      <div className="space-y-6">
        {/* STEP 01: Core Brand & Business Identity */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:shadow-sm sm:p-7">
          <div className="mb-6 flex flex-col justify-between gap-2 border-b border-border/70 pb-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-xs font-bold text-primary">
                01
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Core Business Identity</h3>
                <p className="text-xs text-muted-foreground">Establishes store presence, domain, and scope of offered inventory</p>
              </div>
            </div>
            <span className="self-start rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary sm:self-auto">
              Required Info
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground" htmlFor="biz-name">
                Business / Store Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="biz-name"
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                placeholder="Aura Home Living"
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground" htmlFor="biz-tagline">
                Store Motto / Tagline
              </label>
              <input
                id="biz-tagline"
                type="text"
                value={settings.business_tagline}
                onChange={(e) => setSettings({ ...settings, business_tagline: e.target.value })}
                placeholder="Modern sustainable home decor & artisanal accents"
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-foreground" htmlFor="biz-overview">
                Business Description & Scope of Products
              </label>
              <textarea
                id="biz-overview"
                rows={2}
                value={settings.ai_business_description}
                onChange={(e) => setSettings({ ...settings, ai_business_description: e.target.value })}
                placeholder="Curating sustainably sourced ceramics, bamboo furniture, and minimal lighting for modern spaces. Handcrafted across Southeast Asia with carbon-neutral shipping."
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-foreground" htmlFor="biz-categories">
                Primary Product Categories Sold
              </label>
              {tags.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="text-muted-foreground hover:text-rose-500"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  id="biz-categories"
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  placeholder="Type new category and press enter (e.g. Planters, Wall Art)..."
                  className="flex-1 rounded-lg border border-border bg-background px-3.5 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Tag</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* STEP 02: Audience & Conversational Persona */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:shadow-sm sm:p-7">
          <div className="mb-6 flex flex-col justify-between gap-2 border-b border-border/70 pb-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-indigo-500/25 bg-indigo-500/10 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                02
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Customer Profile & AI Voice Persona</h3>
                <p className="text-xs text-muted-foreground">Fine-tunes vocabulary, formality level, and response hospitality</p>
              </div>
            </div>
            <span className="self-start rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:self-auto">
              Tone Calibration
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-foreground" htmlFor="target-profile">
                Target Customer Profile
              </label>
              <input
                id="target-profile"
                type="text"
                value={settings.target_audience}
                onChange={(e) => setSettings({ ...settings, target_audience: e.target.value })}
                placeholder="Urban interior enthusiasts, new homeowners, and boutique designers seeking modern minimalist aesthetics."
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground" htmlFor="greeting-style">
                Greeting Salutation & Formality
              </label>
              <select
                id="greeting-style"
                value={settings.customer_relation_style}
                onChange={(e) => setSettings({ ...settings, customer_relation_style: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="Warm & Helpful (Consultative & Polite)">Warm & Helpful (Consultative & Polite)</option>
                <option value="Professional & Formal (Sir/Madam)">Professional & Formal (Sir/Madam)</option>
                <option value="Casual & Friendly (Bhai/Apu)">Casual & Friendly (Bhai/Apu)</option>
                <option value="Direct & Modern E-commerce Tone">Direct & Modern E-commerce Tone</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground" htmlFor="ai-voice">
                AI Voice & Linguistic Style
              </label>
              <select
                id="ai-voice"
                value={settings.ai_persona}
                onChange={(e) => setSettings({ ...settings, ai_persona: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-medium text-foreground outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="English Standard (with bilingual Bengali greetings)">English Standard (with bilingual Bengali greetings)</option>
                <option value="Friendly Bangladeshi Bengali (বাংলা Script & Banglish)">Friendly Bangladeshi Bengali (বাংলা Script & Banglish)</option>
                <option value="Pure Bengali Standard (সাধু/চলতি বাংলা)">Pure Bengali Standard (সাধু/চলতি বাংলা)</option>
                <option value="Global International English Only">Global International English Only</option>
              </select>
            </div>

            {/* Live Tone Simulation Box */}
            <div className="mt-1 flex items-start gap-3 rounded-xl border border-border/80 bg-muted/40 p-4 md:col-span-2">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">Live Simulated Persona Preview</span>
                  <span className="text-[10px] text-muted-foreground">Zero-shot prompt output</span>
                </div>
                <p className="mt-1.5 rounded-lg border border-border/70 bg-card p-3 text-xs font-normal leading-relaxed text-foreground shadow-2xs">
                  {simulatedMessage}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* STEP 03: Shipping SLAs & Return Protocols */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:shadow-sm sm:p-7">
          <div className="mb-6 flex flex-col justify-between gap-2 border-b border-border/70 pb-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                03
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Delivery Rates & Return Terms</h3>
                <p className="text-xs text-muted-foreground">Provides exact numbers for courier rates, timeframes, and refund rights</p>
              </div>
            </div>
            <span className="self-start rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 sm:self-auto">
              Verified Policies
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground" htmlFor="delivery-charges">
                  Shipping Rates & Delivery SLA
                </label>
                <span className="text-[11px] text-muted-foreground">Exact quotations</span>
              </div>
              <textarea
                id="delivery-charges"
                rows={3}
                value={settings.delivery_policy}
                onChange={(e) => setSettings({ ...settings, delivery_policy: e.target.value })}
                placeholder="Standard Shipping: ৳80 (Inside Dhaka Metro, 24-48 hrs). Nationwide: ৳150 (3-4 business days). Complimentary free shipping on all orders over ৳3,000."
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-xs leading-relaxed text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Presets:</span>
                <button
                  type="button"
                  onClick={() => appendPreset('delivery_policy', 'Standard Shipping: ৳80 (Inside Dhaka Metro, 24-48 hrs).')}
                  className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                >
                  Inside Metro ৳80
                </button>
                <button
                  type="button"
                  onClick={() => appendPreset('delivery_policy', 'Nationwide Delivery: ৳150 (3-4 business days).')}
                  className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                >
                  Nationwide ৳150
                </button>
                <button
                  type="button"
                  onClick={() => appendPreset('delivery_policy', 'Complimentary free shipping on all orders over ৳3,000.')}
                  className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                >
                  Free Over ৳3,000
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground" htmlFor="return-policy">
                  Returns, Replacement & Refunds
                </label>
                <span className="text-[11px] text-muted-foreground">Resolution rules</span>
              </div>
              <textarea
                id="return-policy"
                rows={3}
                value={settings.return_policy}
                onChange={(e) => setSettings({ ...settings, return_policy: e.target.value })}
                placeholder="7-day hassle-free exchange on undamaged items with original tags and packaging. For transit damages, instant replacement is arranged upon submitting unboxing photos."
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-xs leading-relaxed text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground">Presets:</span>
                <button
                  type="button"
                  onClick={() => appendPreset('return_policy', '7-day hassle-free exchange on undamaged items with original tags and packaging.')}
                  className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                >
                  7-Day Return
                </button>
                <button
                  type="button"
                  onClick={() => appendPreset('return_policy', 'For transit damages, instant replacement is arranged upon submitting unboxing photos.')}
                  className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                >
                  Transit Damage Guarantee
                </button>
                <button
                  type="button"
                  onClick={() => appendPreset('return_policy', 'Cash on Delivery (COD) inspection allowed before payment.')}
                  className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                >
                  COD Available
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* STEP 04: Payment Gateways & Agent Escalations */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-xs transition-all hover:shadow-sm sm:p-7">
          <div className="mb-6 flex flex-col justify-between gap-2 border-b border-border/70 pb-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/25 bg-amber-500/10 text-xs font-bold text-amber-700 dark:text-amber-400">
                04
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">Payment Instructions & Escalation Triggers</h3>
                <p className="text-xs text-muted-foreground">Official merchant numbers and human-handoff rules when queries exceed bot scope</p>
              </div>
            </div>
            <span className="self-start rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300 sm:self-auto">
              Escalation Rules
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground" htmlFor="payment-instructions">
                Accepted Payment Channels & Checkout Instructions
              </label>
              <textarea
                id="payment-instructions"
                rows={3}
                value={settings.special_instructions}
                onChange={(e) => setSettings({ ...settings, special_instructions: e.target.value })}
                placeholder="bKash Merchant: 01700-000000 | Rocket Merchant: 01900-000000 | Nagad Merchant: 01800-000000. Cash on Delivery (COD) accepted nationwide across all covered districts."
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-xs leading-relaxed text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Supported Badges:</span>
                <button
                  type="button"
                  onClick={() => appendPreset('special_instructions', 'bKash Merchant: 01700-000000')}
                  className="inline-flex items-center gap-1 rounded border border-pink-500/30 bg-pink-500/10 px-2 py-0.5 text-[10px] font-semibold text-pink-700 dark:text-pink-300 transition-colors hover:bg-pink-500/20"
                >
                  bKash
                </button>
                <button
                  type="button"
                  onClick={() => appendPreset('special_instructions', 'Rocket Merchant: 01900-000000')}
                  className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 transition-colors hover:bg-indigo-500/20"
                >
                  Rocket
                </button>
                <button
                  type="button"
                  onClick={() => appendPreset('special_instructions', 'Nagad Merchant: 01800-000000')}
                  className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300 transition-colors hover:bg-amber-500/20"
                >
                  Nagad
                </button>
                <button
                  type="button"
                  onClick={() => appendPreset('special_instructions', 'Cash on Delivery (COD) accepted nationwide across all covered districts.')}
                  className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 transition-colors hover:bg-emerald-500/20"
                >
                  Cash on Delivery
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-foreground" htmlFor="special-faqs">
                Special Guidelines & Human Handoff Instructions
              </label>
              <textarea
                id="special-faqs"
                rows={3}
                value={settings.ai_store_instructions}
                onChange={(e) => setSettings({ ...settings, ai_store_instructions: e.target.value })}
                placeholder="AI automatically answers inventory, catalog specs, and shipping status. If a customer inquires about custom bulk orders, broken shipments, or asks to speak with an interior designer, escalate directly to human team."
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-xs leading-relaxed text-foreground outline-none transition-all placeholder:text-muted-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  Escalations will immediately tag conversation in Omnichannel Inbox with{' '}
                  <span className="font-semibold text-foreground">#NeedsHumanLead</span>.
                </span>
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Modern Floating / Sticky Action Bar (Clean & Grounded) */}
      <div className="sticky bottom-4 z-30 mt-8 flex flex-col items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3.5 shadow-lg backdrop-blur-md sm:flex-row sm:p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Configured values will instantly update agent answers across WhatsApp, Messenger & Webchat.</span>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          <button
            type="button"
            onClick={handleDiscard}
            className="rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onNavigateToPlayground}
            className="flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            <PlayCircle className="h-4 w-4" />
            <span>Test in Playground</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save Profile'}</span>
            <kbd className="ml-1 hidden items-center rounded bg-primary-foreground/20 px-1 py-0.5 font-mono text-[9px] text-primary-foreground md:inline-flex">
              ⌘S
            </kbd>
          </button>
        </div>
      </div>

      {/* Preview System Prompt Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Eye className="h-5 w-5 text-primary" />
              <span>Generated AI Agent System Instructions</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This prompt is dynamically constructed from your configured business setup and injected into the Gemini AI router before answering customer questions.
            </DialogDescription>
          </DialogHeader>
          <div className="relative mt-2">
            <pre className="max-h-[380px] overflow-y-auto rounded-xl border border-border bg-muted/50 p-4 font-mono text-xs leading-relaxed text-foreground select-all whitespace-pre-wrap">
              {compiledPrompt}
            </pre>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Auto-compiled with catalog & knowledge grounding
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={copyPromptToClipboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                {copiedPrompt ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedPrompt ? 'Copied!' : 'Copy Prompt'}</span>
              </button>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
