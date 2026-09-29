import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { locale } = await req.json()
  const allowed = ['en', 'bn']
  if (!allowed.includes(locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }
  const res = NextResponse.json({ success: true })
  res.cookies.set('jobabdesk_locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  })
  return res
}
