import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'autochrome',
    description: 'Let AI control your real browser, from a side panel or an external bridge.',
    permissions: ['sidePanel'],
    action: { default_title: 'Open autochrome' },
  },
});
