import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.rixia.app',
  appName: 'RIXIA',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
