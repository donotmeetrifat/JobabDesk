import { normalizeBdPhone } from './phone'
import {
  HIGH_RISK_RATIO_THRESHOLD,
  MEDIUM_RISK_RATIO_THRESHOLD,
  HIGH_RISK_CANCELLATION_COUNT,
  type CustomerRiskAssessment,
  type AssessCustomerRiskParams,
  type RiskLevel,
} from './types'

export async function checkSteadfastFraud(
  phone: string,
  apiKey: string,
  secretKey: string
): Promise<{
  success: boolean
  total_parcels?: number
  delivered_parcels?: number
  cancelled_parcels?: number
  delivery_ratio?: number
  raw?: unknown
  error?: string
}> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(`https://portal.steadfast.com.bd/api/v1/fraud_check/${encodeURIComponent(phone)}`, {
      method: 'GET',
      headers: {
        'Api-Key': apiKey.trim(),
        'Secret-Key': secretKey.trim(),
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const data = await res.json().catch(() => ({}))
    if (!res.ok || (data.status && data.status !== 200)) {
      return {
        success: false,
        error: data.message || `Steadfast returned status ${res.status}`,
        raw: data,
      }
    }

    const payload = data.data || data
    const total = Number(
      payload.total_parcels ??
      payload.total_parcel ??
      payload.total_delivery ??
      payload.total ??
      0
    )
    const delivered = Number(
      payload.delivered_parcels ??
      payload.total_delivered ??
      payload.delivered ??
      payload.success_delivery ??
      0
    )
    const cancelled = Number(
      payload.cancelled_parcels ??
      payload.total_cancel ??
      payload.total_cancelled ??
      payload.cancelled ??
      payload.cancel_delivery ??
      0
    )
    const ratio =
      typeof payload.delivery_ratio === 'number'
        ? Math.round(payload.delivery_ratio)
        : total > 0
        ? Math.round((delivered / total) * 100)
        : 100

    return {
      success: true,
      total_parcels: total,
      delivered_parcels: delivered,
      cancelled_parcels: cancelled,
      delivery_ratio: ratio,
      raw: data,
    }
  } catch (err: any) {
    return {
      success: false,
      error: err?.name === 'AbortError' ? 'Steadfast request timed out' : err?.message,
    }
  }
}

export async function assessCustomerRisk(
  params: AssessCustomerRiskParams
): Promise<CustomerRiskAssessment> {
  const { phone, accountId, supabase, steadfastSettings, currentOrderId } = params
  const cleanPhone = normalizeBdPhone(phone)

  // 1. Check Store Blacklist Shield
  let isBlacklisted = false
  let blacklistReason: string | null = null

  if (cleanPhone) {
    const { data: blacklistEntry } = await supabase
      .from('customer_blacklists')
      .select('reason')
      .eq('account_id', accountId)
      .eq('phone_normalized', cleanPhone)
      .maybeSingle()

    if (blacklistEntry) {
      isBlacklisted = true
      blacklistReason = blacklistEntry.reason || 'Store Blacklisted'
    }
  }

  if (isBlacklisted) {
    return {
      phone,
      phone_normalized: cleanPhone,
      risk_level: 'blacklisted',
      delivery_ratio: 0,
      total_parcels: 0,
      delivered_parcels: 0,
      cancelled_parcels: 0,
      is_blacklisted: true,
      blacklist_reason: blacklistReason,
      source: 'internal',
      summary: `🚫 Blacklisted Customer: ${blacklistReason}`,
      summaryBn: `🚫 ব্ল্যাকলিস্টেড গ্রাহক: ${blacklistReason}`,
      recommendation:
        'Do NOT dispatch parcel via Cash on Delivery (COD). Require 100% advance payment or cancel order.',
      recommendationBn:
        'ক্যাশ অন ডেলিভারিতে পার্সেল পাঠাবেন না। সম্পূর্ণ অগ্রিম মূল্য দাবি করুন অথবা অর্ডার বাতিল করুন।',
      reasons: [`Customer is on store blacklist: "${blacklistReason}"`],
    }
  }

  // 2. Network-Wide Check via Steadfast (Tier 2 Optional Enhancement)
  let steadfastData: Awaited<ReturnType<typeof checkSteadfastFraud>> | null = null
  if (
    cleanPhone &&
    steadfastSettings?.enabled &&
    steadfastSettings.api_key &&
    steadfastSettings.secret_key
  ) {
    steadfastData = await checkSteadfastFraud(
      cleanPhone,
      steadfastSettings.api_key,
      steadfastSettings.secret_key
    )
  }

  // 3. Internal Store Order History (Tier 1 Baseline)
  let internalTotal = 0
  let internalDelivered = 0
  let internalCancelled = 0

  if (cleanPhone) {
    let query = supabase
      .from('orders')
      .select('id, status, customer_phone')
      .eq('account_id', accountId)
      .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.eq.${phone}`)

    if (currentOrderId) {
      query = query.neq('id', currentOrderId)
    }

    const { data: pastOrders } = await query
    if (Array.isArray(pastOrders)) {
      internalTotal = pastOrders.length
      internalDelivered = pastOrders.filter((o) => o.status === 'delivered').length
      internalCancelled = pastOrders.filter((o) => o.status === 'cancelled').length
    }
  }

  // 4. Resolve Aggregate Data
  let totalParcels = 0
  let deliveredParcels = 0
  let cancelledParcels = 0
  let source: 'steadfast' | 'internal' | 'combined' | 'new_customer' = 'new_customer'

  if (steadfastData?.success && typeof steadfastData.total_parcels === 'number') {
    totalParcels = steadfastData.total_parcels
    deliveredParcels = steadfastData.delivered_parcels || 0
    cancelledParcels = steadfastData.cancelled_parcels || 0
    source = internalTotal > 0 ? 'combined' : 'steadfast'

    // Combine internal cancellation count if internal recorded cancellations not yet in Steadfast
    if (internalCancelled > 0 && internalCancelled > cancelledParcels) {
      cancelledParcels = internalCancelled
    }
  } else if (internalTotal > 0) {
    totalParcels = internalTotal
    deliveredParcels = internalDelivered
    cancelledParcels = internalCancelled
    source = 'internal'
  }

  const deliveryRatio =
    totalParcels > 0 ? Math.round((deliveredParcels / totalParcels) * 100) : 100

  // 5. Evaluate Risk Level
  let riskLevel: RiskLevel = 'low'
  const reasons: string[] = []

  if (cancelledParcels >= HIGH_RISK_CANCELLATION_COUNT) {
    riskLevel = 'high'
    reasons.push(
      `Customer has ${cancelledParcels} cancelled/refused parcels on record (Threshold: ${HIGH_RISK_CANCELLATION_COUNT}+)`
    )
  } else if (totalParcels >= 2 && deliveryRatio < HIGH_RISK_RATIO_THRESHOLD) {
    riskLevel = 'high'
    reasons.push(
      `Delivery success rate is only ${deliveryRatio}% (${deliveredParcels}/${totalParcels} delivered)`
    )
  } else if (
    (totalParcels >= 2 && deliveryRatio < MEDIUM_RISK_RATIO_THRESHOLD) ||
    cancelledParcels >= 1
  ) {
    riskLevel = 'medium'
    if (cancelledParcels >= 1) {
      reasons.push(`Customer has ${cancelledParcels} previously cancelled parcel(s)`)
    }
    if (deliveryRatio < MEDIUM_RISK_RATIO_THRESHOLD) {
      reasons.push(`Delivery rate is ${deliveryRatio}% (below 80% trusted threshold)`)
    }
  } else if (totalParcels === 0) {
    riskLevel = 'low'
    reasons.push('New customer with 0 prior parcel records')
  } else {
    riskLevel = 'low'
    reasons.push(`High delivery success rate: ${deliveryRatio}% (${deliveredParcels}/${totalParcels} delivered)`)
  }

  // 6. Formulate Summaries and Recommendations
  let summary = ''
  let summaryBn = ''
  let recommendation = ''
  let recommendationBn = ''

  if (riskLevel === 'high') {
    summary = `⚠️ High Return Risk: Customer returned ${cancelledParcels} of ${totalParcels} parcels (${deliveryRatio}% success rate).`
    summaryBn = `⚠️ উচ্চ রিটার্ন ঝুঁকি: গ্রাহক পূর্ববর্তী ${totalParcels}টি অর্ডারের মধ্যে ${cancelledParcels}টি বাতিল করেছেন (${deliveryRatio}% সফলতার হার)।`
    recommendation =
      'Recommend requiring ৳150 Advance Delivery Fee before dispatch to protect against return courier charges.'
    recommendationBn =
      'কুরিয়ার রিটার্ন খরচ এড়াতে পার্সেল পাঠানোর পূর্বে ১৫০ টাকা অগ্রিম ডেলিভারি চার্জ সংগ্রহ করার পরামর্শ দেওয়া হচ্ছে।'
  } else if (riskLevel === 'medium') {
    summary = `🟡 Moderate Risk: Delivery success rate is ${deliveryRatio}% (${deliveredParcels}/${totalParcels} delivered).`
    summaryBn = `🟡 মাঝারি ঝুঁকি: ডেলিভারি সফলতার হার ${deliveryRatio}% (${deliveredParcels}/${totalParcels}টি সফল)।`
    recommendation =
      'Verify customer phone number & full street address via chat or call before packing.'
    recommendationBn =
      'প্যাকেজিংয়ের পূর্বে ফোনে কথা বলে অথবা চ্যাটে সঠিক ডেলিভারি ঠিকানা নিশ্চিত করে নিন।'
  } else if (totalParcels === 0) {
    summary = '🟢 New Customer: No prior delivery history recorded.'
    summaryBn = '🟢 নতুন গ্রাহক: কোনো পূর্ববর্তী রিটার্ন বা ডেলিভারি ইতিহাস নেই।'
    recommendation = 'Safe for standard Cash on Delivery (COD). Confirm address before shipping.'
    recommendationBn = 'ক্যাশ অন ডেলিভারিতে পাঠানো নিরাপদ। পাঠানোর পূর্বে ঠিকানা যাচাই করুন।'
  } else {
    summary = `🟢 Trusted Customer: Delivery success rate is ${deliveryRatio}% (${deliveredParcels}/${totalParcels} delivered).`
    summaryBn = `🟢 বিশ্বস্ত গ্রাহক: ডেলিভারি সফলতার হার ${deliveryRatio}% (${deliveredParcels}/${totalParcels}টি সফল)।`
    recommendation = 'Safe for 100% Cash on Delivery (COD) dispatch.'
    recommendationBn = '১০০% ক্যাশ অন ডেলিভারিতে পার্সেল পাঠানো নিরাপদ।'
  }

  return {
    phone,
    phone_normalized: cleanPhone,
    risk_level: riskLevel,
    delivery_ratio: deliveryRatio,
    total_parcels: totalParcels,
    delivered_parcels: deliveredParcels,
    cancelled_parcels: cancelledParcels,
    is_blacklisted: false,
    source,
    summary,
    summaryBn,
    recommendation,
    recommendationBn,
    reasons,
    rawResponse: steadfastData?.raw,
  }
}
