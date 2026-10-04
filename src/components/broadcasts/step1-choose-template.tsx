'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  FileText,
  ArrowRight,
  Radio,
  Sparkles,
  MessageCircle,
  Smartphone,
  Copy,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

const categoryColors: Record<string, string> = {
  Marketing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Utility: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Authentication: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

interface Step1Props {
  channel: 'all' | 'whatsapp' | 'messenger';
  onChannelChange: (channel: 'all' | 'whatsapp' | 'messenger') => void;
  selectedTemplate: MessageTemplate | null;
  onSelect: (template: MessageTemplate) => void;
  aiContext?: string;
  onAiContextChange?: (context: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step1ChooseTemplate({
  channel,
  onChannelChange,
  selectedTemplate,
  onSelect,
  aiContext = '',
  onAiContextChange,
  onNext,
  onBack,
}: Step1Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'custom' | 'template'>('custom');
  const [customText, setCustomText] = useState(
    selectedTemplate?.body_text ||
      'Hello {{name}}, we have an exclusive special update for you! Let us know if you need any assistance.'
  );

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from('message_templates')
          .select('*')
          .eq('status', 'APPROVED')
          .order('created_at', { ascending: false });

        if (!fetchError && data) {
          setTemplates(data);
        }
      } catch (err) {
        console.warn('Templates fetch notice:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchTemplates();
  }, []);

  // Sync custom text to template object
  useEffect(() => {
    if (mode === 'custom' && customText.trim()) {
      onSelect({
        id: 'custom',
        name: 'Custom Broadcast Message',
        category: 'Marketing',
        status: 'APPROVED',
        language: 'en_US',
        body_text: customText,
        variable_count: 0,
      } as unknown as MessageTemplate);
    }
  }, [mode, customText, onSelect]);

  function handleInsertVariable(variable: string) {
    setCustomText((prev) => `${prev} {{${variable}}}`);
  }

  const isNextDisabled =
    mode === 'custom' ? !customText.trim() : !selectedTemplate || selectedTemplate.id === 'custom';

  return (
    <div className="space-y-6">
      {/* 1. Channel Selector */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">
          Select Target Delivery Channel
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Omnichannel */}
          <button
            type="button"
            onClick={() => onChannelChange('all')}
            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
              channel === 'all'
                ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30'
                : 'border-border bg-card hover:border-border/80'
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Omnichannel</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                WhatsApp & Messenger together
              </div>
            </div>
          </button>

          {/* WhatsApp */}
          <button
            type="button"
            onClick={() => onChannelChange('whatsapp')}
            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
              channel === 'whatsapp'
                ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                : 'border-border bg-card hover:border-border/80'
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">WhatsApp Only</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Phones via Cloud API / Gateway
              </div>
            </div>
          </button>

          {/* Facebook Messenger */}
          <button
            type="button"
            onClick={() => onChannelChange('messenger')}
            className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
              channel === 'messenger'
                ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30'
                : 'border-border bg-card hover:border-border/80'
            }`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.514 3.734 7.202V22l3.376-1.854c.905.251 1.877.387 2.89.387 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.05 12.443l-2.673-2.853-5.217 2.853 5.738-6.094 2.742 2.853 5.148-2.853-5.738 6.094z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-medium text-foreground">Messenger Only</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Meta Facebook Page inbox
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Message Mode Toggle */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Message Content</h2>
            <p className="text-xs text-muted-foreground">
              Choose to compose a custom broadcast text or use an approved WhatsApp template
            </p>
          </div>

          <div className="flex items-center rounded-lg bg-muted p-1 border border-border text-xs">
            <button
              type="button"
              onClick={() => setMode('custom')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                mode === 'custom'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Custom Message
            </button>
            <button
              type="button"
              onClick={() => setMode('template')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                mode === 'template'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              WhatsApp Templates ({templates.length})
            </button>
          </div>
        </div>

        {/* Custom Message Mode */}
        {mode === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="md:col-span-3 space-y-3">
              <label className="text-xs font-medium text-muted-foreground">
                Broadcast Text Message
              </label>
              <Textarea
                rows={6}
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Write your broadcast announcement..."
                className="bg-background border-border resize-none text-sm text-foreground focus:ring-primary"
              />

              {/* Dynamic Tag Helpers */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Insert Variable:</span>
                <button
                  type="button"
                  onClick={() => handleInsertVariable('name')}
                  className="px-2 py-0.5 rounded text-xs bg-muted hover:bg-muted/80 text-foreground border border-border"
                >
                  + Customer Name
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertVariable('phone')}
                  className="px-2 py-0.5 rounded text-xs bg-muted hover:bg-muted/80 text-foreground border border-border"
                >
                  + Phone
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertVariable('company')}
                  className="px-2 py-0.5 rounded text-xs bg-muted hover:bg-muted/80 text-foreground border border-border"
                >
                  + Company
                </button>
              </div>

              {/* AI Auto-Reply Context & Offer Details Box */}
              <div className="pt-2 mt-2 space-y-1.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <label className="text-xs font-semibold text-foreground">
                    Update / Offer Details for AI Auto-Reply
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  When customers reply asking about this update (e.g. &quot;What is the update?&quot;, &quot;How much discount?&quot;, &quot;Offer details&quot;), what should the AI automation reply? Provide the exact details, discounts, or terms here. If left blank, the AI will NEVER invent or guess discounts!
                </p>
                <Textarea
                  rows={3}
                  value={aiContext}
                  onChange={(e) => onAiContextChange?.(e.target.value)}
                  placeholder="e.g. We are offering 15% discount on all skincare items using code SAVE15 until Friday. Free delivery inside Dhaka."
                  className="bg-background border-border resize-none text-xs text-foreground focus:ring-primary placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {/* Live Message Chat Mockup Preview */}
            <div className="md:col-span-2 flex flex-col items-center justify-center p-4 rounded-xl border border-border bg-card/60">
              <div className="w-full max-w-[240px] space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Customer View Preview</span>
                </div>
                <div
                  className={`p-3 rounded-2xl rounded-tl-sm text-xs leading-relaxed shadow-sm ${
                    channel === 'messenger'
                      ? 'bg-blue-600 text-white'
                      : 'bg-emerald-600 text-white'
                  }`}
                >
                  {customText.replace(/{{\s*name\s*}}/gi, 'Rifat') || 'Message preview here...'}
                  <div className="text-[9px] opacity-75 text-right mt-1">Just now ✓✓</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* WhatsApp Template Mode */}
        {mode === 'template' && (
          <div>
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : templates.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
                <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No approved WhatsApp templates</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  You can easily switch to &quot;Custom Message&quot; above to compose and send messages
                  immediately to WhatsApp & Messenger contacts!
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMode('custom')}
                  className="mt-3"
                >
                  Switch to Custom Message
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {templates.map((template) => {
                  const isSelected = selectedTemplate?.id === template.id;
                  const catColor = categoryColors[template.category] ?? categoryColors.Utility;

                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => onSelect(template)}
                      className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border bg-card/50 hover:border-border hover:bg-card'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <h3 className="text-sm font-medium text-foreground truncate max-w-[140px]">
                          {template.name}
                        </h3>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${catColor}`}
                        >
                          {template.category}
                        </span>
                      </div>
                      <p className="line-clamp-3 text-xs text-muted-foreground">
                        {template.body_text}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{template.language ?? 'en_US'}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button variant="outline" onClick={onBack} className="border-border text-muted-foreground">
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={isNextDisabled}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
