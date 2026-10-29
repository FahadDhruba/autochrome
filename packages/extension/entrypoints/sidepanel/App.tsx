import { useState } from 'react';
import RecordingBar from './RecordingBar';
import ChatDrawer from './ChatDrawer';
import ChatView from './ChatView';
import SettingsView from './SettingsView';
import WorkflowsView, { type WorkflowScreen } from './WorkflowsView';
import { useChat } from './useChat';
import { useProviderSettings } from './useProviderSettings';
import { useRecording } from './useRecording';
import { useSafety } from './useSafety';
import { useWorkflowRun } from './useWorkflowRun';

type View = 'chat' | 'settings' | 'workflows';

export default function App() {
  const [view, setView] = useState<View>('chat');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const settings = useProviderSettings();
  const chat = useChat(settings);
  const safety = useSafety();
  const recording = useRecording();
  const workflowRun = useWorkflowRun(chat);
  const [workflowScreen, setWorkflowScreen] = useState<WorkflowScreen>({ name: 'list' });
  // A waiting approval prompt must not stay hidden behind Settings. The Workflows view shows
  // its own, next to the run it belongs to.
  const activeView = chat.approval && view !== 'workflows' ? 'chat' : view;

  const show = (next: View) => {
    setView(next);
    setDrawerOpen(false);
  };

  const openEditor = (id: string) => {
    setWorkflowScreen({ name: 'edit', id });
    show('workflows');
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
          {activeView !== 'workflows' && (
            <button className="link" onClick={() => show('workflows')}>
              Workflows
            </button>
          )}
          {activeView !== 'settings' && (
            <button className="link" onClick={() => show('settings')}>
              Settings
            </button>
          )}
          {activeView !== 'chat' && (
            <button className="link" onClick={() => show('chat')}>
              Back to chat
            </button>
          )}
        </div>
      </header>
      {recording && <RecordingBar recording={recording} onFinished={openEditor} />}
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
        ) : activeView === 'workflows' ? (
          <WorkflowsView
            screen={workflowScreen}
            onScreen={setWorkflowScreen}
            run={workflowRun}
            recording={recording}
            approval={chat.approval}
            onApproval={chat.answerApproval}
            onStop={chat.stop}
          />
        ) : settings ? (
          <ChatView
            chat={chat}
            providers={settings}
            onOpenSettings={() => show('settings')}
            onSavedWorkflow={openEditor}
          />
        ) : null}
      </main>
    </div>
  );
}
