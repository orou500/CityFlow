# Implementation Plan - Fix Statistics and Unified Networking

The app is partially working (cities load) but failing on statistics and login due to hardcoded `/api` paths and inconsistent routing between development and production. I will centralize all network calls to use the absolute URL utility.

## Proposed Changes

### 1. Fix Statistics on Home Screen

## Proposed Changes

### 2. Fix Login and Registration

#### [MODIFY] [LoginPage.jsx](file:///C:/Users/Or Moshe/Desktop/Projects/Cityflow/frontend/src/pages/LoginPage.jsx)
- Import `getApiBaseUrl`.
- Fix `handleResend` to use the absolute URL for verification emails.
- Update Google/Discord login links to use absolute URLs so they don't hit the internal app server.

### 3. Cleanup Data Stores

#### [MODIFY] [useGameStore.js](file:///C:/Users/Or Moshe/Desktop/Projects/Cityflow/frontend/src/store/useGameStore.js)
- Ensure `downloadBackup` and `uploadBackupFile` use the absolute API URL.

#### [MODIFY] [AdminPage.jsx](file:///C:/Users/Or Moshe/Desktop/Projects/Cityflow/frontend/src/pages/AdminPage.jsx)
- Fix `handleDownloadBackup` to use the absolute API URL.

## Verification Plan

### Manual Verification
1.  **Apply Changes**.
2.  **Clean & Rebuild**:
    ```bash
    npm run build
    npx cap copy android
    ```
3.  **Run in Android Studio**.
4.  Verify that statistics appear on the landing page immediately.
5.  Verify that login/registration works.
