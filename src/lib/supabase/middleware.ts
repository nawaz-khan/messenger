import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') || 
                      request.nextUrl.pathname.startsWith('/register') || 
                      request.nextUrl.pathname.startsWith('/forgot-password') ||
                      request.nextUrl.pathname === '/reset-password' // allow /reset-password logic if needed, actually reset-password needs auth session? 
                      // Wait, reset-password needs session in URL hash, or a recovery session.

  const isProtectedRoute = request.nextUrl.pathname.startsWith('/app') || 
                         request.nextUrl.pathname.startsWith('/profile') || 
                         request.nextUrl.pathname.startsWith('/onboarding')

  if (!user && isProtectedRoute) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If user is logged in and tries to access login/register, redirect to /app
  if (user && isAuthRoute && request.nextUrl.pathname !== '/reset-password') {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
  }
  
  // Protect /reset-password if no user? Wait, reset-password might be accessed without a user session yet (it is established by auth/callback or hash). 
  // We'll leave /reset-password accessible.

  return supabaseResponse
}
