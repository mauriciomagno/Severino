import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.severino.game',
  appName: 'Morte e Vida Severina',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#e3b778',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#e3b778',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'none',
    },
  },
};

export default config;
