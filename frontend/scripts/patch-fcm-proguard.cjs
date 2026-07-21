const fs = require('fs');
const path = require('path');

const fcmBuildGradle = path.join(
  __dirname,
  'node_modules/@capacitor-community/fcm/android/build.gradle'
);

try {
  let content = fs.readFileSync(fcmBuildGradle, 'utf8');
  if (content.includes('proguard-android.txt') && !content.includes('proguard-android-optimize.txt')) {
    content = content.replace(/proguard-android\.txt/g, 'proguard-android-optimize.txt');
    fs.writeFileSync(fcmBuildGradle, content);
    console.log('Patched @capacitor-community/fcm proguard-android.txt -> proguard-android-optimize.txt');
  }
} catch (e) {
  // fcm not installed yet or file not found, skip
}
