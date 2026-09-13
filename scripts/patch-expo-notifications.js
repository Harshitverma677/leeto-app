const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build');

// 1. Patch warnOfExpoGoPushUsage.js — replace with console.log to avoid triggering LogBox popup on Android
const warnFile = path.join(base, 'warnOfExpoGoPushUsage.js');
if (fs.existsSync(warnFile)) {
  let content = fs.readFileSync(warnFile, 'utf8');
  if (content.includes("throw new Error(message);") || content.includes("console.warn(message);")) {
    content = content.replace(
      /if \(Platform\.OS === 'android'\) \{\s*throw new Error\(message\);\s*\}\s*else if \(__DEV__\) \{\s*didWarn = true;\s*console\.warn\(message\);\s*\}/g,
      'didWarn = true;\n        console.log(message);'
    ).replace(/console\.warn\(message\);/g, 'console.log(message);');
    fs.writeFileSync(warnFile, content, 'utf8');
    console.log('✅ Patched warnOfExpoGoPushUsage.js');
  } else {
    console.log('ℹ️  warnOfExpoGoPushUsage.js already patched');
  }
}

// 2. Patch TopicSubscriptionModule.android.js — use inline stub, NO circular import
const topicFile = path.join(base, 'TopicSubscriptionModule.android.js');
if (fs.existsSync(topicFile)) {
  fs.writeFileSync(
    topicFile,
    `import { requireOptionalNativeModule } from 'expo-modules-core';
const mod = requireOptionalNativeModule('ExpoTopicSubscriptionModule');
export default mod ?? {
  addListener: () => ({ remove: () => {} }),
  removeListeners: () => {},
  subscribeToTopicAsync: () => Promise.resolve(null),
  unsubscribeFromTopicAsync: () => Promise.resolve(null),
};
//# sourceMappingURL=TopicSubscriptionModule.android.js.map
`,
    'utf8'
  );
  console.log('✅ Patched TopicSubscriptionModule.android.js');
}

// 3. Patch PushTokenManager.native.js — use inline stub, NO circular import
const pushTokenFile = path.join(base, 'PushTokenManager.native.js');
if (fs.existsSync(pushTokenFile)) {
  fs.writeFileSync(
    pushTokenFile,
    `import { requireOptionalNativeModule } from 'expo-modules-core';
const mod = requireOptionalNativeModule('ExpoPushTokenManager');
export default mod ?? {
  addListener: () => ({ remove: () => {} }),
  removeListener: () => {},
  removeAllListeners: () => {},
  emit: () => {},
  listenerCount: () => 0,
  getDevicePushTokenAsync: () => Promise.resolve(null),
  getExpoPushTokenAsync: () => Promise.resolve(null),
};
//# sourceMappingURL=PushTokenManager.native.js.map
`,
    'utf8'
  );
  console.log('✅ Patched PushTokenManager.native.js');
}

// 4. Patch ServerRegistrationModule.native.js — use inline stub, NO circular import
const serverRegFile = path.join(base, 'ServerRegistrationModule.native.js');
if (fs.existsSync(serverRegFile)) {
  fs.writeFileSync(
    serverRegFile,
    `import { requireOptionalNativeModule } from 'expo-modules-core';
const mod = requireOptionalNativeModule('NotificationsServerRegistrationModule');
export default mod ?? {
  addListener: () => ({ remove: () => {} }),
  removeListeners: () => {},
  registerForPushNotificationsAsync: () => Promise.resolve(null),
  unregisterForPushNotificationsAsync: () => Promise.resolve(null),
  getDevicePushTokenAsync: () => Promise.resolve(null),
};
//# sourceMappingURL=ServerRegistrationModule.native.js.map
`,
    'utf8'
  );
  console.log('✅ Patched ServerRegistrationModule.native.js');
}
