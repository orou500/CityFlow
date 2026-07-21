import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cityflow.game',
  appName: 'CityFlow',
  webDir: 'dist',
  server: {
    androidScheme: 'http',
    cleartext: true,
    allowNavigation: ['cityflow.sizops.co.il', 'localhost', '10.0.2.2'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#3b82f6',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      backgroundColor: '#0f172a',
      style: 'DARK',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentations: ['alert', 'badge', 'sound'],
      android: {
        sound: true,
        vibration: true,
      },
    },
    Biometric: {
      allowDeviceCredential: true,
    },
    App: {
      // Deep link scheme
    },
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined,
    },
  },
  ios: {
    scheme: 'CityFlow',
    contentInset: 'always',
  },
};

export default config;
