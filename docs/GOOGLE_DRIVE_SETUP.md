# Google Drive Integration Setup Guide (OAuth 2.0)

This document provides exact instructions to configure the Google Drive integration for Campus Messenger using Google OAuth 2.0. The implementation relies on authorizing the application to a specific Google account and storing media in a dedicated Drive folder.

## 1. Google Cloud Project Requirements
- A Google Cloud Platform (GCP) project is required.
- You can use an existing project or create a new one specifically for Campus Messenger.

## 2. Required APIs
- **Google Drive API** must be enabled in your Google Cloud Project.
- Go to **APIs & Services > Library**, search for "Google Drive API", and click **Enable**.

## 3. OAuth Consent Screen
- Go to **APIs & Services > OAuth consent screen**.
- Configure the consent screen (External or Internal depending on your workspace setup).
- Add the necessary scopes: `https://www.googleapis.com/auth/drive.file`.
- Add your personal Google account as a Test User if the app status is "Testing".

## 4. Create OAuth Credentials
- Go to **APIs & Services > Credentials**.
- Click **Create Credentials** -> **OAuth client ID**.
- Application type: **Web application**.
- Name: (e.g., `Campus Messenger Media`).
- Authorized redirect URIs: `http://localhost:3000/api/media/google/callback` (Add production URIs here later).
- Click **Create**.
- Copy the **Client ID** and **Client Secret**.

## 5. How to Create/Select the Dedicated Google Drive Folder
1. Go to your personal or organization's Google Drive.
2. Create a new folder (e.g., `Campus Messenger Media`).
3. Note: Because we are using OAuth linked to your personal Drive, you do not need to share this folder with a service account. The app acts on your behalf.
4. The folder remains PRIVATE in your personal Google Drive.

## 6. What GOOGLE_DRIVE_FOLDER_ID Should Contain
- Open the dedicated folder in your browser.
- Look at the URL: `https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J`
- The `GOOGLE_DRIVE_FOLDER_ID` is the alphanumeric string at the end of the URL (e.g., `1A2B3C4D5E6F7G8H9I0J`).

## 7. Exact Environment Variable Names
The codebase explicitly requires the following exact environment variable names. Do **NOT** prefix them with `NEXT_PUBLIC_`.

- `GOOGLE_OAUTH_CLIENT_ID`: Your OAuth Client ID.
- `GOOGLE_OAUTH_CLIENT_SECRET`: Your OAuth Client Secret.
- `GOOGLE_OAUTH_REDIRECT_URI`: Should be `http://localhost:3000/api/media/google/callback` for local development.
- `GOOGLE_OAUTH_REFRESH_TOKEN`: The refresh token generated after you authorize the app (see step 8).
- `GOOGLE_DRIVE_FOLDER_ID`: The ID of your Drive folder.
- `MEDIA_SECRET_KEY`: A randomly generated secure string used to sign JWTs for proxy access.

## 8. Initializing the OAuth Connection (Getting the Refresh Token)
To connect the application to your Google Drive:
1. Ensure `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI` are set in your `.env.local` file.
2. Start your local development server (`npm run dev`).
3. Open a browser and navigate to: `http://localhost:3000/api/media/google/authorize`.
4. Log in with the Google Account that owns the Google Drive folder.
5. Grant the application permission to manage Google Drive files.
6. You will be redirected back to the application. If successful, you will see a screen displaying your `GOOGLE_OAUTH_REFRESH_TOKEN`.
7. Copy the refresh token, paste it into your `.env.local` file, and restart your development server.

## 9. How to Verify Credentials (Safely)
- Navigate to: `http://localhost:3000/api/media/google/status`.
- This lightweight diagnostic endpoint will attempt to fetch your Google Drive profile and storage quota.
- If it returns `status: "connected"`, your OAuth setup is successful.
- Try uploading an image in a direct message or group chat to fully test the upload and proxy flow.

## 10. Security Requirements
- **NEVER** expose the Google OAuth Client Secret or Refresh Token to the browser (e.g., never use `NEXT_PUBLIC_...`).
- **NEVER** commit `.env.local` to version control. Ensure `.env.local` is in your `.gitignore`.
- Media files in Google Drive should remain private. The proxy architecture securely streams files using signed JWTs. Do not change the folder's sharing settings to "Anyone with the link".

## 11. Local Development Configuration
In the root of your project, create or update `.env.local` with the following variables:

```env
# Google Drive Media Configuration (OAuth)
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/media/google/callback
GOOGLE_OAUTH_REFRESH_TOKEN=your_refresh_token_after_authorization
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
MEDIA_SECRET_KEY=your_secure_random_string_here

# (Legacy Service Account Variables - Retained only temporarily for migration)
GOOGLE_DRIVE_CLIENT_EMAIL=...
GOOGLE_DRIVE_PRIVATE_KEY=...
```

## 12. Production/Vercel Configuration Considerations
- When configuring Vercel environment variables, add the variables exactly as named.
- Ensure `GOOGLE_OAUTH_REDIRECT_URI` matches your production domain (e.g., `https://your-domain.com/api/media/google/callback`). You must also add this URI to your Google Cloud OAuth Client ID authorized redirect URIs.
- In production, it is recommended to store the `GOOGLE_OAUTH_REFRESH_TOKEN` in a secure secret manager or database rather than an environment file, depending on your architecture.
- Ensure `MEDIA_SECRET_KEY` is a strong, cryptographically secure random string in production.
