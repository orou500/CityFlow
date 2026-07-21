import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { isNativePlatform, saveSetting, loadSetting } from './capacitor';

export async function isBiometricAvailable() {
  if (!isNativePlatform()) return false;
  try {
    const result = await NativeBiometric.isAvailable();
    return result.available;
  } catch {
    return false;
  }
}

export async function getBiometricType() {
  if (!isNativePlatform()) return null;
  try {
    const result = await NativeBiometric.isAvailable();
    return result.biometryType || null;
  } catch {
    return null;
  }
}

export async function authenticateWithBiometric(reason) {
  if (!isNativePlatform()) return false;
  try {
    await NativeBiometric.verify({
      title: reason || 'Authenticate to CityFlow',
      subtitle: 'Verify your identity',
      description: reason || 'Use biometrics to log in',
      cancel: 'Cancel',
    });
    return true;
  } catch (err) {
    if (err.code === 'UserCanceled' || err.code === 'BiometricSessionCancelled') {
      return false;
    }
    console.error('Biometric auth failed:', err);
    return false;
  }
}

export async function isBiometricEnabled() {
  return loadSetting('biometric_enabled', false);
}

export async function setBiometricEnabled(enabled) {
  await saveSetting('biometric_enabled', enabled);
}
