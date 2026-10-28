import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
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
    action: { default_title: 'Open autochrome' },
  },
});
