'use client'

import React, { useEffect, useState } from 'react'
import {
  Truck,
  ShieldCheck,
  Zap,
  Save,
  Loader2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  PackageCheck,
  Building,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { PRESET_COURIERS } from '@/lib/courier/types'
import type { CourierSettings, CourierProvider } from '@/types/orders'

const DEFAULT_SETTINGS: CourierSettings = {
  default_provider: 'manual',
  steadfast: { enabled: false, api_key: '', secret_key: '' },
  pathao: {
    enabled: false,
    client_id: '',
    client_secret: '',
    username: '',
    password: '',
    store_id: '',
  },
}

export function CourierSettingsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<CourierSettings>(DEFAULT_SETTINGS)
  const [showSteadfastSecret, setShowSteadfastSecret] = useState(false)
  const [showPathaoSecret, setShowPathaoSecret] = useState(false)

  useEffect(() => {
    let active = true
    const fetchSettings = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/courier/settings')
        if (!res.ok) throw new Error('Failed to load courier settings')
        const data = await res.json()
        if (active && data.settings) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data.settings,
          })
        }
      } catch (err: any) {
        toast.error(err?.message || 'Error loading courier settings')
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchSettings()
    return () => {
      active = false
    }
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setSaving(true)
      const res = await fetch('/api/courier/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save courier settings')

      toast.success('Courier settings saved successfully!')
    } catch (err: any) {
      toast.error(err?.message || 'Could not save courier settings')
    } finally {
      setSaving(false)
    }
  }

  const isSteadfastConfigured = Boolean(
    settings.steadfast.api_key && settings.steadfast.secret_key
  )

  const isPathaoConfigured = Boolean(
    settings.pathao.client_id &&
      settings.pathao.client_secret &&
      settings.pathao.username &&
      settings.pathao.password &&
      settings.pathao.store_id
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading courier &amp; delivery configuration...</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Intro Banner: Manual First, API Optional */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-primary text-primary-foreground">
              <Truck className="size-3.5" />
              Manual First Architecture
            </span>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]">
              0 API Keys Required by Default
            </Badge>
          </div>
          <h2 className="text-lg font-bold text-foreground">
            Hybrid Courier &amp; Delivery Tracking Engine
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Every merchant can instantly log consignments for Sundarban, SA Paribahan, RedX, Paperfly, Karatoa, or In-House Delivery boys without any setup. Optionally connect your Steadfast or Pathao corporate accounts for 1-Click Automated Parcel Booking.
          </p>
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="shrink-0 flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5 font-semibold shadow-xs"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </Button>
      </div>

      {/* Provider Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <PackageCheck className="size-4 text-primary" />
            Default Booking Mode
          </CardTitle>
          <CardDescription>
            Choose your preferred workflow when opening an order&apos;s delivery details.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: 'manual' as CourierProvider,
                title: 'Manual Tracking (Free)',
                desc: 'Enter tracking code or memo number manually. Works for all couriers.',
                badge: 'Recommended',
              },
              {
                id: 'steadfast' as CourierProvider,
                title: 'Steadfast Courier API',
                desc: '1-click direct parcel booking with automated consignment tracking code.',
                badge: isSteadfastConfigured ? 'Ready' : 'Setup needed',
              },
              {
                id: 'pathao' as CourierProvider,
                title: 'Pathao Courier API',
                desc: '1-click booking with Pathao logistics & automated recipient routing.',
                badge: isPathaoConfigured ? 'Ready' : 'Setup needed',
              },
            ].map((prov) => {
              const isSelected = settings.default_provider === prov.id
              return (
                <div
                  key={prov.id}
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      default_provider: prov.id,
                    }))
                  }
                  className={`relative p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-xs'
                      : 'border-border bg-card hover:bg-muted/30'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-foreground">{prov.title}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isSelected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {prov.badge}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{prov.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Manual Couriers Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building className="size-4 text-primary" />
            Zero-Config Free Couriers
          </CardTitle>
          <CardDescription>
            The following courier presets are ready to use immediately with auto-generated tracking links:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PRESET_COURIERS.map((courier) => (
              <div
                key={courier.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-muted/30 text-xs font-medium text-foreground"
              >
                <span>{courier.name}</span>
                <span className="text-[11px] text-muted-foreground font-bengali">({courier.nameBn})</span>
                {courier.hasAutomatedApi && (
                  <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.2 rounded">
                    API Available
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Steadfast API Integration Card */}
      <Card className={settings.steadfast.enabled ? 'border-primary/40' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                <Zap className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Steadfast Courier API
                  {isSteadfastConfigured ? (
                    <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px]">
                      <CheckCircle2 className="size-3" /> Credentials Set
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px]">
                      <AlertCircle className="size-3" /> Not Configured
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Automate parcel creation via Steadfast Merchant Portal.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="steadfast-toggle" className="text-xs text-muted-foreground hidden sm:inline">
                {settings.steadfast.enabled ? 'Enabled' : 'Disabled'}
              </Label>
              <Switch
                id="steadfast-toggle"
                checked={settings.steadfast.enabled}
                onCheckedChange={(val) =>
                  setSettings((prev) => ({
                    ...prev,
                    steadfast: { ...prev.steadfast, enabled: val },
                  }))
                }
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="steadfast-api-key" className="text-xs font-semibold">
                Steadfast Api-Key
              </Label>
              <Input
                id="steadfast-api-key"
                type="text"
                placeholder="e.g. stdf_api_xxxxxxx"
                value={settings.steadfast.api_key}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    steadfast: { ...prev.steadfast, api_key: e.target.value },
                  }))
                }
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="steadfast-secret-key" className="text-xs font-semibold">
                  Steadfast Secret-Key
                </Label>
                <button
                  type="button"
                  onClick={() => setShowSteadfastSecret(!showSteadfastSecret)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {showSteadfastSecret ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  <span>{showSteadfastSecret ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <Input
                id="steadfast-secret-key"
                type={showSteadfastSecret ? 'text' : 'password'}
                placeholder="e.g. stdf_secret_xxxxxxx"
                value={settings.steadfast.secret_key}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    steadfast: { ...prev.steadfast, secret_key: e.target.value },
                  }))
                }
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
            <span>
              Find your API credentials under <strong>Steadfast Portal &gt; Settings &gt; API</strong>.
            </span>
            <a
              href="https://portal.steadfast.com.bd"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1 font-medium"
            >
              Steadfast Portal <ExternalLink className="size-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Pathao Courier API Integration Card */}
      <Card className={settings.pathao.enabled ? 'border-primary/40' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                <Zap className="size-5" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  Pathao Courier API
                  {isPathaoConfigured ? (
                    <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px]">
                      <CheckCircle2 className="size-3" /> Credentials Set
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px]">
                      <AlertCircle className="size-3" /> Not Configured
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  1-click parcel fulfillment with Pathao Courier Hermes API.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="pathao-toggle" className="text-xs text-muted-foreground hidden sm:inline">
                {settings.pathao.enabled ? 'Enabled' : 'Disabled'}
              </Label>
              <Switch
                id="pathao-toggle"
                checked={settings.pathao.enabled}
                onCheckedChange={(val) =>
                  setSettings((prev) => ({
                    ...prev,
                    pathao: { ...prev.pathao, enabled: val },
                  }))
                }
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pathao-client-id" className="text-xs font-semibold">
                Client ID
              </Label>
              <Input
                id="pathao-client-id"
                type="text"
                placeholder="Pathao OAuth Client ID"
                value={settings.pathao.client_id}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    pathao: { ...prev.pathao, client_id: e.target.value },
                  }))
                }
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pathao-client-secret" className="text-xs font-semibold">
                  Client Secret
                </Label>
                <button
                  type="button"
                  onClick={() => setShowPathaoSecret(!showPathaoSecret)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {showPathaoSecret ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  <span>{showPathaoSecret ? 'Hide' : 'Show'}</span>
                </button>
              </div>
              <Input
                id="pathao-client-secret"
                type={showPathaoSecret ? 'text' : 'password'}
                placeholder="Pathao OAuth Client Secret"
                value={settings.pathao.client_secret}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    pathao: { ...prev.pathao, client_secret: e.target.value },
                  }))
                }
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pathao-username" className="text-xs font-semibold">
                Pathao Username / Email
              </Label>
              <Input
                id="pathao-username"
                type="text"
                placeholder="merchant@example.com"
                value={settings.pathao.username}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    pathao: { ...prev.pathao, username: e.target.value },
                  }))
                }
                className="text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pathao-password" className="text-xs font-semibold">
                Pathao Password
              </Label>
              <Input
                id="pathao-password"
                type="password"
                placeholder="Account password"
                value={settings.pathao.password}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    pathao: { ...prev.pathao, password: e.target.value },
                  }))
                }
                className="text-xs"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="pathao-store-id" className="text-xs font-semibold">
                Pathao Store ID
              </Label>
              <Input
                id="pathao-store-id"
                type="text"
                placeholder="e.g. 12345 (find in Pathao Merchant &gt; Stores)"
                value={settings.pathao.store_id}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    pathao: { ...prev.pathao, store_id: e.target.value },
                  }))
                }
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-1">
            <span>
              Request API Developer Access from your Pathao account manager or merchant portal.
            </span>
            <a
              href="https://merchant.pathao.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline flex items-center gap-1 font-medium"
            >
              Pathao Merchant <ExternalLink className="size-3" />
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Bottom Save Bar */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-6 font-semibold shadow-xs"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saving ? 'Saving...' : 'Save Settings'}</span>
        </Button>
      </div>
    </form>
  )
}
