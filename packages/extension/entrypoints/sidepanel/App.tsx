import { useState } from 'react';
import ChatDrawer from './ChatDrawer';
import ChatView from './ChatView';
import SettingsView from './SettingsView';
import { useChat } from './useChat';
import { useProviderSettings } from './useProviderSettings';
import { useSafety } from './useSafety';

type View = 'chat' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('chat');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const settings = useProviderSettings();
  const chat = useChat(settings);
  const safety = useSafety();
  // A waiting approval prompt must not stay hidden behind Settings.
  const activeView = chat.approval ? 'chat' : view;

  const show = (next: View) => {
    setView(next);
    setDrawerOpen(false);
  };

  return (
    <div className="app">
      <header>
        <h1>
          autochrome
          {safety?.mode === 'auto' && (
            <span
              className="badge-auto"
              title="The AI can act on any site without asking"
              data-testid="auto-badge"
            >
              Auto
            </span>
          )}
        </h1>
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
          <button
            className="link"
            onClick={() => show(activeView === 'chat' ? 'settings' : 'chat')}
          >
            {activeView === 'chat' ? 'Settings' : 'Back to chat'}
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
        {activeView === 'settings' ? (
          <SettingsView />
        ) : settings ? (
          <ChatView chat={chat} providers={settings} onOpenSettings={() => show('settings')} />
        ) : null}
      </main>
    </div>
  );
}
