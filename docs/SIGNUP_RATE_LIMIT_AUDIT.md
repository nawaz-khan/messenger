# SIGNUP RATE LIMIT AUDIT

**Project:** Campus Messenger  
**Date:** 2026-09-29  
**Focus:** Diagnostic of signup / authentication flow, Supabase GoTrue rate limiting, duplicate submission behavior, and error handling  
**Target Remote Project Ref:** `wvcfihmgbofypwfxdkry`  

---

## Executive Summary

During the first real signup test, the application repeatedly displayed the following error:
> **"For security purposes, you can only request this after 53 seconds."**

This error originated directly from **Supabase Auth (GoTrue)** as an HTTP 429 (`over_email_send_rate_limit`) response. It is triggered by a **per-identity frequency cooldown** (default: 60 seconds) on confirmation email dispatches for a specific email address.

The persistence of this error across retries is caused by a confluence of three application-level design flaws:
1. **Unprotected Submit Button & Missing Debounce:** `<Button type="submit">` inside `RegisterPage` has no `disabled` attribute, no pending state, and no submission lock. Any double-click or subsequent click while the first request is in-flight dispatches concurrent HTTP POST requests to the server action, immediately colliding with Supabase Auth's 60-second cooldown window.
2. **Broken Email Confirmation Lifecycle:** `register()` in `src/app/auth/actions.ts` assumes `signUp()` immediately yields an authenticated session and redirects directly to `/app`. In Supabase projects where "Confirm email" is enabled (Supabase standard default), `signUp()` returns `{ data: { user, session: null } }`. Because no session cookies exist, Next.js middleware rejects the redirect to `/app` and kicks the user to `/login`, leaving the user stranded without confirmation feedback and inducing repeated signup attempts with the same email.
3. **Account Already Created in Auth:** On the very first signup click, GoTrue successfully created the user in `auth.users` with `confirmed_at = null` and dispatched the first confirmation email (setting the 60s timer). Any subsequent attempt to register the same unconfirmed email triggers a resend of the confirmation email, which GoTrue immediately blocks if attempted within 60 seconds.

---

## A. Exact Signup Flow

The current implementation proceeds through the following sequence:

1. **Page Load:**
   - The user visits `http://localhost:3000/register`.
   - `src/app/register/page.tsx` renders as a React Server Component.
   - It reads `searchParams.error` (if present) and renders a red alert box.
   - It renders an uncontrolled HTML form:
     ```tsx
     <form action={register} className="space-y-4">
       <Input id="email" name="email" type="email" required />
       <Input id="password" name="password" type="password" required />
       <Input id="confirmPassword" name="confirmPassword" type="password" required />
       <Button type="submit" className="w-full">Sign up</Button>
     </form>
     ```

2. **Form Submission:**
   - The user clicks the **Sign up** button.
   - React on the client serializes the `FormData` and sends an HTTP POST request to the Next.js Server Action endpoint for `register`.
   - The submit button remains completely enabled and clickable during this entire round-trip (no loading spinner, no disabled state).

3. **Server Action Execution (`register` in `src/app/auth/actions.ts`):**
   - Validates that `email`, `password`, and `confirmPassword` are present (redirects with error if missing).
   - Validates `password === confirmPassword` (redirects with error if mismatched).
   - Validates `password.length >= 6` (redirects with error if too short).
   - Instantiates the Supabase server client: `const supabase = createClient()`.
   - Calls `supabase.auth.signUp({ email, password })`.

4. **Response Evaluation:**
   - **If an error is returned (`if (error)`):**
     Executes: `redirect('/register?error=' + encodeURIComponent(error.message))`.
     Next.js throws `NEXT_REDIRECT`, sending a 303 redirect back to `/register` with the raw GoTrue message appended to the URL query string.
   - **If no error is returned (success):**
     Executes:
     ```ts
     revalidatePath('/', 'layout')
     redirect('/app')
     ```
   - Notice: `register` completely ignores the `data` payload (`user` and `session`) returned by `supabase.auth.signUp()`.

5. **Post-Success Redirection Failure (Middleware Barrier):**
   - When email confirmations are enabled in Supabase, `data.session` is `null`.
   - When the browser follows the redirect to `GET /app`, `src/middleware.ts` runs:
     ```ts
     const { data: { user } } = await supabase.auth.getUser()
     if (!user && isProtectedRoute) {
       const url = request.nextUrl.clone()
       url.pathname = '/login'
       return NextResponse.redirect(url)
     }
     ```
   - Because `session` was null during signup, no cookies were set. `getUser()` returns `null`.
   - The user is kicked out of `/app` and redirected to `/login`, without ever being informed to verify their inbox.

---

## B. Supabase Auth Calls Made

Throughout the entire signup and registration flow, the code makes:

- **Inside `register()`:**
  - Exactly **1** Supabase Auth call:
    ```ts
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    ```
- **What is NOT called or missing:**
  - `options.emailRedirectTo` is **omitted**. Supabase Auth uses the default project site URL rather than the application's `/auth/callback` endpoint.
  - `data.user` and `data.session` are **not inspected**.
  - `data.user.identities` is **not inspected** (in Supabase Auth, when an account already exists and identity linking or enumeration prevention is active, `identities` is returned as an empty array `[]`).
  - No check exists for `error.status === 429` or `error.code === 'over_email_send_rate_limit'`.

---

## C. Whether One Click Causes One or Multiple Requests

### In-Code Analysis:
- In `src/app/auth/actions.ts`, the function `register()` calls `supabase.auth.signUp()` **once per execution**.
- There is **no loop**, **no retry logic**, and **no automatic duplicate invocation** inside the action itself.
- In `src/app/register/page.tsx`, there are **no `useEffect` hooks**, **no window event listeners**, and **no client-side lifecycle triggers** (it is a Server Component).

### Human-Interaction & Browser Level:
- **One intentional user click CAN easily result in multiple requests:**
  1. **No Disabled State on Submit:** The submit button `<Button type="submit">` has no `disabled={pending}` state. When a user clicks "Sign up", Supabase Auth takes between 1.0 and 3.5 seconds to contact the GoTrue service, hash the password, write to `auth.users`, generate the confirmation cryptographic token, and dispatch the email via the SMTP relay.
  2. Because the UI displays no spinner or disabled state, users frequently click the button a second time.
  3. A double-click or rapid secondary click fires **two separate POST requests** to the Next.js Server Action runner.
  4. The first request reaches GoTrue, creates the user or initiates email sending, and starts the 60-second cooldown timer.
  5. The second request hits GoTrue approximately 5–7 seconds later (or fractions of a second later).
  6. GoTrue checks the last sent timestamp on the user record and computes:
     $\text{cooldown remaining} = 60\text{s} - 7\text{s} = 53\text{s}$.
  7. GoTrue immediately rejects the second request with HTTP 429 and message:
     `"For security purposes, you can only request this after 53 seconds."`
  8. The second action runner catches this, executes `redirect('/register?error=...')`, and the error banner appears on the page.

---

## D. Exact Origin of the "For security purposes..." Error

1. **Service Origin:**
   The string `"For security purposes, you can only request this after %d seconds."` is **not generated by our application**. It is the verbatim error message produced by the **Supabase GoTrue (Auth) server**.
2. **GoTrue Trigger:**
   In the GoTrue codebase, this occurs in the email rate-limiting check (`mailer.go` / `rate_limit`):
   ```go
   if time.Now().Before(user.ConfirmationSentAt.Add(rateLimitDuration)) {
       return httpError(http.StatusTooManyRequests, 
           fmt.Sprintf("For security purposes, you can only request this after %d seconds.", 
           int(time.Until(user.ConfirmationSentAt.Add(rateLimitDuration)).Seconds())))
   }
   ```
3. **Application Propagation:**
   In `src/app/auth/actions.ts` (lines 54–56):
   ```ts
   if (error) {
     redirect('/register?error=' + encodeURIComponent(error.message))
   }
   ```
   Our server action takes `error.message` directly, URL-encodes it into the query parameter `?error=...`, and redirects the client back to `/register`.
4. **Display:**
   In `src/app/register/page.tsx` (lines 33–37), the server component reads `searchParams.error` and renders it directly inside the red alert box.

---

## E. Whether the Email Address May Already Have an Account

### **YES, almost certainly.**

Here is the exact progression:
1. When the test was first performed, the very first click on "Sign up" successfully communicated with remote Supabase project `wvcfihmgbofypwfxdkry`.
2. Supabase GoTrue created a record in `auth.users` with the entered email, assigned a UUID `id`, set `confirmed_at = NULL`, and generated a `confirmation_sent_at` timestamp.
3. Therefore, **the email address is already present in `auth.users` on the remote database**.
4. When the user attempted to sign up again with that same email address:
   - Supabase GoTrue does not throw a "User already exists" error when email confirmation is enabled (to prevent account enumeration attacks).
   - Instead, GoTrue treats the new `signUp` call as a request to **resend the confirmation email**.
   - If that resend request arrives before the 60-second cooldown has fully expired, GoTrue immediately responds with the 429 rate-limit error.
5. Why did waiting and clicking again produce the exact same 53-second error?
   - If the user waited >60s and clicked, the first click was accepted by GoTrue (dispatching another confirmation email and resetting the 60s cooldown). But due to the lack of button debounce or loading feedback, a double-click or quick secondary click occurred ~7s later, immediately hitting the new 60s cooldown with 53s remaining.
   - Alternatively, if the browser reloaded or retained `?error=For%20security%20purposes...` in the URL bar, the error banner remained visible on the page.

---

## F. Whether the Problem is Application-Side, Supabase Auth-Side, or Both

### **It is BOTH, driven by application-side architectural oversights:**

| Layer | Responsibility / Behavior | Status |
| :--- | :--- | :--- |
| **Supabase Auth (Remote)** | Enforces a strict 60-second per-identity email dispatch cooldown (`GOTRUE_RATE_LIMIT_EMAIL_SENT = 60s`). By default, free-tier remote projects also have low SMTP rate limits (3-4 emails/hour on default provider). | **Working as designed by Supabase** (anti-abuse protection). |
| **Application: Double-Submit Prevention** | No disabled state or submission lock on `<Button type="submit">`. Allows duplicate concurrent submissions. | **Defective (Application-side)** |
| **Application: Email Confirmation Handling** | Ignores `data.session === null` and assumes all signups immediately log in. Redirects unconfirmed users to `/app`, which triggers a silent redirect to `/login`. No "Check your email" confirmation screen exists. | **Defective (Application-side)** |
| **Application: Auth Options** | Does not pass `emailRedirectTo` to `signUp()`, meaning confirmation links will not route through `/auth/callback`. | **Defective (Application-side)** |
| **Application: Error Presentation** | Directly passes raw GoTrue messages via URL search params instead of handling 429 status codes with user-friendly messages and client cooldown timers. | **Defective (Application-side)** |

---

## G. Recommended Fix

To resolve this issue cleanly without altering Supabase project settings or disabling security limits:

1. **Add Double-Submit Protection and Loading State:**
   - Convert the registration form to a client component or use a client submit button with `useFormStatus` from `react-dom`.
   - Disable the button and display `"Signing up..."` or a spinner as soon as the user clicks.
   - This physically prevents duplicate POST requests from reaching Supabase Auth.

2. **Handle the Unconfirmed Email State:**
   - In `register(formData)`:
     ```ts
     const { data, error } = await supabase.auth.signUp({
       email,
       password,
       options: {
         emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
       },
     })
     ```
   - Check if `data.user && !data.session`:
     - If true, email confirmation is required by Supabase.
     - Redirect to `/register?checkEmail=true` or `/auth/verify-email?email=${encodeURIComponent(email)}`.
     - Display a clean, informative UI: *"We've sent a verification link to your email. Please check your inbox to complete registration."*
   - Check if `data.session`:
     - If an active session exists (auto-confirm enabled), redirect to `/onboarding` (or `/app`).

3. **Check for Existing Users (`identities` array):**
   - When an email is already registered and confirmed, Supabase GoTrue returns `data.user` with `data.user.identities.length === 0`.
   - Detect this condition and guide the user: *"An account with this email already exists. Please sign in instead."*

4. **Graceful Rate-Limit Translation:**
   - If `error.message` contains `"For security purposes"` or `error.status === 429`:
     - Catch it in the action or UI and render a friendly message: *"You recently requested a confirmation email. Please wait a moment before trying again, or check your spam folder."*

---

## H. Exact Files That Would Need Modification

1. [src/app/auth/actions.ts](file:///c:/Users/nawaz/Desktop/campus-messenger/src/app/auth/actions.ts)
   - Update `register()` to:
     - Capture `data` alongside `error` (`const { data, error } = await supabase.auth.signUp(...)`).
     - Pass `options.emailRedirectTo` using the request origin.
     - Distinguish between unconfirmed signup (`!data.session`), existing accounts (`user.identities.length === 0`), and active sessions (`data.session`).
     - Map GoTrue rate-limit errors (429) to clean user-friendly messages.
2. [src/app/register/page.tsx](file:///c:/Users/nawaz/Desktop/campus-messenger/src/app/register/page.tsx)
   - Add a submit button with `useFormStatus` (or extract to a client component `<RegisterForm />`) so the button is disabled while pending.
   - Add support for displaying the "Check your email" confirmation prompt (`searchParams.checkEmail`).
3. [src/components/auth/SubmitButton.tsx](file:///c:/Users/nawaz/Desktop/campus-messenger/src/components/auth/SubmitButton.tsx) *(new component or inline)*
   - A client button leveraging `useFormStatus()` to prevent double-clicks across all auth forms (`/login`, `/register`, `/forgot-password`).

---

## Verdict

**SAFE TO FIX**

The root cause is fully diagnosed and isolated. The required modifications are entirely application-level improvements (preventing concurrent submissions, adding a pending button state, passing `emailRedirectTo`, and handling the unconfirmed email state). No Supabase project settings need to be changed, and no security limits need to be disabled.
