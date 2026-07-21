# Walkthrough - Unified Networking and Statistics Fix

I have resolved the issues where live statistics were missing and login was unreliable. The cause was several hardcoded `/api` paths in the UI that didn't work correctly on Android.

## Changes Made

### 1. Fixed Live Statistics
Updated [LandingPage.jsx](file:///C:/Users/Or Moshe/Desktop/Projects/Cityflow/frontend/src/pages/LandingPage.jsx) to use the absolute API URL (`http://10.0.2.2:5000`) instead of relative paths. This ensures the dashboard can load player counts, property totals, and world status immediately on startup.

### 2. Fixed Login & Social Links
- Updated [LoginPage.jsx](file:///C:/Users/Or Moshe/Desktop/Projects/Cityflow/frontend/src/pages/LoginPage.jsx) to use absolute URLs for resending verification emails.
- Fixed **Google and Discord login links**. Previously, they were trying to load internal app files; now they correctly redirect to your backend server.

### 3. Cleanup Admin & Backups
Updated the data stores and admin pages to ensure backup downloads and uploads use the centralized networking utility, preventing "File not found" errors in the admin panel.

---

## ⚠️ FINAL SYNC (Required)

To see the statistics and fix the login links, you MUST run these commands in your terminal **from the `frontend` folder**:

1.  **Build Web App**:
    ```bash
    npm run build
    ```
2.  **Sync to Android**:
    ```bash
    npx cap copy android
    ```
3.  **Run the App**: Click the **Run** button in Android Studio.

> [!NOTE]
> If you were using Google/Discord login, it should now open the browser or the correct auth flow instead of showing a blank page.
