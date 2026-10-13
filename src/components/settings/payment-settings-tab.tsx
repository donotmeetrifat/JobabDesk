'use client'

import React, { useEffect, useState } from 'react'
import {
  CreditCard,
  ShieldCheck,
  Building2,
  Save,
  Loader2,
  Sparkles,
  Info,
  CheckCircle2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import type { PaymentSettings } from '@/types/orders'

const DEFAULT_SETTINGS: PaymentSettings = {
  bkash: { number: '', type: 'personal' },
  nagad: { number: '', type: 'personal' },
  rocket: { number: '', type: 'personal' },
  bank: { details: '' },
  allow_cod_advance: true,
  cod_advance_amount: 150,
}

export function PaymentSettingsTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    let active = true
    const fetchSettings = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/ai/settings')
        if (!res.ok) throw new Error('Failed to load payment settings')
        const data = await res.json()
        if (active && data.settings?.payment_settings) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...data.settings.payment_settings,
          })
        }
      } catch (err: any) {
        toast.error(err?.message || 'Error loading payment settings')
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
      const res = await fetch('/api/ai/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_settings: settings,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save payment settings')

      toast.success('Payment settings saved successfully!')
    } catch (err: any) {
      toast.error(err?.message || 'Could not save payment settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading merchant payment configuration...</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Intro Banner */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-500" />
            <h2 className="text-base font-bold text-foreground">
              Free 0% Gateway Commission Direct Payments
            </h2>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 bg-emerald-500/10 text-[10px]">
              0% Fee
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Configure your personal or merchant bKash, Nagad, Rocket &amp; Bank accounts.
            Customers pay directly to you and submit their Transaction ID (TrxID) via `/pay/[orderId]`.
          </p>
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="bg-primary text-primary-foreground font-semibold px-5 shrink-0 shadow-sm"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="size-4 mr-2" />
              Save Settings
            </>
          )}
        </Button>
      </div>

      {/* Mobile Wallets Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* bKash */}
        <Card className="border-border shadow-xs hover:border-[#D12053]/40 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <span className="size-3 rounded-full bg-[#D12053]" />
                bKash Settings
              </CardTitle>
              <Badge variant="outline" className="text-[10px] border-[#D12053]/40 text-[#D12053]">
                bKash
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Direct mobile wallet settlement
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Account Number</Label>
              <Input
                placeholder="017XXXXXXXX"
                value={settings.bkash?.number || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    bkash: {
                      number: e.target.value.trim(),
                      type: settings.bkash?.type || 'personal',
                    },
                  })
                }
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Account Type</Label>
              <select
                value={settings.bkash?.type || 'personal'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    bkash: {
                      number: settings.bkash?.number || '',
                      type: e.target.value as 'personal' | 'merchant' | 'agent',
                    },
                  })
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="personal">Personal (Send Money)</option>
                <option value="merchant">Merchant (Make Payment)</option>
                <option value="agent">Agent (Cash In)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Nagad */}
        <Card className="border-border shadow-xs hover:border-[#F7941D]/40 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <span className="size-3 rounded-full bg-[#F7941D]" />
                Nagad Settings
              </CardTitle>
              <Badge variant="outline" className="text-[10px] border-[#F7941D]/40 text-[#F7941D]">
                Nagad
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Bangladesh Post Office digital wallet
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Account Number</Label>
              <Input
                placeholder="01XXXXXXXXX"
                value={settings.nagad?.number || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    nagad: {
                      number: e.target.value.trim(),
                      type: settings.nagad?.type || 'personal',
                    },
                  })
                }
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Account Type</Label>
              <select
                value={settings.nagad?.type || 'personal'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    nagad: {
                      number: settings.nagad?.number || '',
                      type: e.target.value as 'personal' | 'merchant',
                    },
                  })
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="personal">Personal (Send Money)</option>
                <option value="merchant">Merchant (Payment)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Rocket */}
        <Card className="border-border shadow-xs hover:border-[#8C3494]/40 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <span className="size-3 rounded-full bg-[#8C3494]" />
                Rocket Settings
              </CardTitle>
              <Badge variant="outline" className="text-[10px] border-[#8C3494]/40 text-[#8C3494]">
                DBBL
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Dutch-Bangla Bank Rocket account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Account Number</Label>
              <Input
                placeholder="01XXXXXXXXX"
                value={settings.rocket?.number || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    rocket: {
                      number: e.target.value.trim(),
                      type: settings.rocket?.type || 'personal',
                    },
                  })
                }
                className="font-mono text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Account Type</Label>
              <select
                value={settings.rocket?.type || 'personal'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    rocket: {
                      number: settings.rocket?.number || '',
                      type: e.target.value as 'personal' | 'merchant',
                    },
                  })
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="personal">Personal</option>
                <option value="merchant">Merchant</option>
              </select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bank & COD Advance Configuration */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Bank Transfer Details */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              Bank Deposit Information
            </CardTitle>
            <CardDescription className="text-xs">
              Displayed to customers who choose direct bank transfer or NPSB/BEFTN
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={5}
              placeholder={`Bank Name: City Bank\nAccount Name: My Business Ltd\nAccount Number: 1234567890\nBranch: Gulshan 2\nRouting Number: 225272635`}
              value={settings.bank?.details || ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  bank: { details: e.target.value },
                })
              }
              className="font-mono text-xs leading-relaxed"
            />
            <p className="text-[11px] text-muted-foreground">
              Provide complete account details so customers can transfer funds effortlessly.
            </p>
          </CardContent>
        </Card>

        {/* COD Advance Delivery Fee */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <CreditCard className="size-4 text-emerald-500" />
                COD Advance Delivery Fee
              </CardTitle>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 text-[10px]">
                Anti-RTO Shield
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Allow shoppers to pay only the delivery charge upfront to confirm their order
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/30">
              <div className="space-y-0.5">
                <Label htmlFor="allow-cod-advance" className="text-xs font-semibold cursor-pointer">
                  Enable COD Advance Fee Option
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Shows &ldquo;Advance Delivery Fee&rdquo; pill on the payment portal
                </p>
              </div>
              <Switch
                id="allow-cod-advance"
                checked={settings.allow_cod_advance ?? true}
                onCheckedChange={(checked) =>
                  setSettings({
                    ...settings,
                    allow_cod_advance: checked,
                  })
                }
              />
            </div>

            {settings.allow_cod_advance && (
              <div className="space-y-1.5">
                <Label htmlFor="cod-amount" className="text-xs text-muted-foreground">
                  Default Advance Delivery Charge (৳ BDT)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                    ৳
                  </span>
                  <Input
                    id="cod-amount"
                    type="number"
                    min="0"
                    step="10"
                    placeholder="150"
                    value={settings.cod_advance_amount ?? 150}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        cod_advance_amount: Number(e.target.value) || 0,
                      })
                    }
                    className="pl-8 font-mono text-sm"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Collecting ৳{settings.cod_advance_amount ?? 150} upfront prevents fake COD orders and guarantees delivery commitment.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Save Button Bar */}
      <div className="flex justify-end pt-2">
        <Button
          type="submit"
          disabled={saving}
          className="bg-primary text-primary-foreground font-semibold px-6 shadow-md"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Saving Configuration...
            </>
          ) : (
            <>
              <Save className="size-4 mr-2" />
              Save Payment Settings
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
