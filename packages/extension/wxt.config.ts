import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  zip: { name: 'autochrome' },
  manifest: {
    name: 'autochrome',
    description: 'Let AI control your real browser, from a side panel or an external bridge.',
    permissions: [
      'sidePanel',
      'tabs',
      'tabGroups',
      'scripting',
      'debugger',
      'alarms',
      'storage',
      'unlimitedStorage',
    ],
    host_permissions: ['<all_urls>'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: {
      default_title: 'Open autochrome',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
  },
});
