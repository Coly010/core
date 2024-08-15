import { appTools, defineConfig } from '@modern-js/app-tools';
import { moduleFederationPlugin } from '@module-federation/modern-js';

// https://modernjs.dev/en/configure/app/usage
export default defineConfig({
  dev: {
    port: 3061,
  },
  runtime: {
    router: true,
  },

  plugins: [
    appTools({
      bundler: 'experimental-rspack',
    }),
    moduleFederationPlugin({
      dataLoader: {
        baseName: 'federation',
      },
    }),
  ],
  server: {
    ssr: {
      mode: 'stream',
    },
  },
});
