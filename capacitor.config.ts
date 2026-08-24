import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.beid.app',
  appName: 'BEID',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // 让 Android 包内的 fetch/XHR 使用原生网络栈，B 站接口不会受 WebView CORS 限制。
    CapacitorHttp: {
      enabled: true,
    },
    SystemBars: {
      insetsHandling: "css",
      style: "DARK",
    },
  },
}

export default config
