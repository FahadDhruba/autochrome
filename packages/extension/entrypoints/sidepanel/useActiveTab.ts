import { useEffect, useState } from 'react';

export type ActiveTab = { title: string; url: string };

/** The tab the user is looking at, kept current as they switch or navigate. */
export function useActiveTab(): ActiveTab | undefined {
  const [tab, setTab] = useState<ActiveTab>();

  useEffect(() => {
    const refresh = async () => {
      const [active] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      setTab(active?.url ? { title: active.title ?? '', url: active.url } : undefined);
    };
    void refresh();
    const onUpdated = (_id: number, info: { status?: string }) => {
      if (info.status === 'complete') void refresh();
    };
    const onActivated = () => void refresh();
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return tab;
}

/** Three starting prompts, about the open page when there is one. */
export function suggestionsFor(tab: ActiveTab | undefined): string[] {
  let host = '';
  try {
    const url = new URL(tab?.url ?? '');
    if (url.protocol === 'http:' || url.protocol === 'https:')
      host = url.host.replace(/^www\./, '');
  } catch {
    // Not a web page.
  }
  if (!host) {
    return [
      'Open wikipedia.org and tell me about today’s featured article',
      'List my open tabs and group them by topic',
      'Summarize the page I have open',
    ];
  }
  return [
    'Summarize this page',
    `Find the contact email on ${host}`,
    'List my open tabs and group them by topic',
  ];
}
