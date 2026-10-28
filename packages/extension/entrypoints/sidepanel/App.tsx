import { useState } from 'react';
import ChatDrawer from './ChatDrawer';
import ChatView from './ChatView';
import SettingsView from './SettingsView';
import { useChat } from './useChat';
import { useProviderSettings } from './useProviderSettings';

type View = 'chat' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('chat');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const settings = useProviderSettings();
  const chat = useChat(settings);

  const show = (next: View) => {
    setView(next);
    setDrawerOpen(false);
  };

  return (
    <div className="app">
      <header>
        <h1>autochrome</h1>
        <div className="header-actions">
          <button
            className="link"
            disabled={chat.running}
            onClick={() => setDrawerOpen(!drawerOpen)}
          >
            Chats
          </button>
          <button
            className="link"
            disabled={chat.running}
            onClick={() => {
              chat.newChat();
              show('chat');
            }}
          >
            New chat
          </button>
          <button className="link" onClick={() => show(view === 'chat' ? 'settings' : 'chat')}>
            {view === 'chat' ? 'Settings' : 'Back to chat'}
          </button>
        </div>
      </header>
      {drawerOpen && (
        <ChatDrawer
          activeId={chat.chatId}
          revision={chat.revision}
          onClose={() => setDrawerOpen(false)}
          onOpen={(id) => {
            void chat.openChat(id);
            show('chat');
          }}
        />
      )}
      <main>
        {view === 'settings' ? (
          <SettingsView />
        ) : settings ? (
          <ChatView chat={chat} providers={settings} onOpenSettings={() => show('settings')} />
        ) : null}
      </main>
    </div>
  );
}
