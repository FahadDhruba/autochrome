import { useCallback, useState } from 'react';
import RecordingBar from './RecordingBar';
import ChatDrawer from './ChatDrawer';
import ChatView from './ChatView';
import RunsView from './RunsView';
import SchedulesView, { type ScheduleScreen } from './SchedulesView';
import SettingsView from './SettingsView';
import WorkflowsView, { type WorkflowScreen } from './WorkflowsView';
import { useChat } from './useChat';
import { useProviderSettings } from './useProviderSettings';
import { useRecording } from './useRecording';
import { useRunRoute } from './useRunRoute';
import { useSafety } from './useSafety';
import { useWorkflowRun } from './useWorkflowRun';

type View = 'chat' | 'settings' | 'workflows' | 'schedules' | 'runs';

export default function App() {
  const [view, setView] = useState<View>('chat');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const settings = useProviderSettings();
  const chat = useChat(settings);
  const safety = useSafety();
  const recording = useRecording();
  const workflowRun = useWorkflowRun(chat);
  const [workflowScreen, setWorkflowScreen] = useState<WorkflowScreen>({ name: 'list' });
  const [scheduleScreen, setScheduleScreen] = useState<ScheduleScreen>({ name: 'list' });
  const [selectedRun, setSelectedRun] = useState<string>();
  // A waiting approval prompt must not stay hidden behind Settings. The Workflows view shows
  // its own, next to the run it belongs to.
  const activeView = chat.approval && view !== 'workflows' ? 'chat' : view;

  const show = (next: View) => {
    setView(next);
    setDrawerOpen(false);
  };

  const openRun = useCallback((runId: string) => {
    setSelectedRun(runId);
    setView('runs');
    setDrawerOpen(false);
  }, []);
  // A notification click asks for a run to be shown.
  useRunRoute(openRun);

  const openChat = (id: string) => {
    void chat.openChat(id);
    show('chat');
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
          {activeView !== 'schedules' && (
            <button className="link" onClick={() => show('schedules')}>
              Schedules
            </button>
          )}
          {activeView !== 'runs' && (
            <button
              className="link"
              onClick={() => {
                setSelectedRun(undefined);
                show('runs');
              }}
            >
              Runs
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
          onOpen={openChat}
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
        ) : activeView === 'schedules' ? (
          <SchedulesView
            screen={scheduleScreen}
            onScreen={setScheduleScreen}
            providers={settings}
            onOpenRun={openRun}
          />
        ) : activeView === 'runs' ? (
          <RunsView selected={selectedRun} onSelect={setSelectedRun} onOpenChat={openChat} />
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
