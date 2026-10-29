import { useCallback, useState } from 'react';
import {
  CalendarClock,
  History,
  MessagesSquare,
  Settings,
  SquarePen,
  Workflow,
} from 'lucide-react';
import IconButton from '@/src/ui/IconButton';
import Logo from '@/src/ui/Logo';
import Tooltip from '@/src/ui/Tooltip';
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
        <h1 className="app-title">
          {activeView === 'chat' ? (
            <span className="brand">
              <Logo />
              <span className="app-name">autochrome</span>
            </span>
          ) : (
            // Off the chat, the brand doubles as the way back, so the toolbar needs no extra icon.
            <Tooltip label="Back to chat" align="start">
              <button
                type="button"
                className="brand brand-btn"
                aria-label="Back to chat"
                onClick={() => show('chat')}
              >
                <Logo />
                <span className="app-name">autochrome</span>
              </button>
            </Tooltip>
          )}
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
        <nav className="header-actions" aria-label="Main">
          <IconButton
            label="Chats"
            icon={MessagesSquare}
            active={drawerOpen}
            disabled={chat.running}
            onClick={() => setDrawerOpen(!drawerOpen)}
          />
          <IconButton
            label="New chat"
            icon={SquarePen}
            disabled={chat.running}
            onClick={() => {
              chat.newChat();
              show('chat');
            }}
          />
          <IconButton
            label="Workflows"
            icon={Workflow}
            active={activeView === 'workflows'}
            onClick={() => show('workflows')}
          />
          <IconButton
            label="Schedules"
            icon={CalendarClock}
            active={activeView === 'schedules'}
            onClick={() => show('schedules')}
          />
          <IconButton
            label="Runs"
            icon={History}
            active={activeView === 'runs'}
            onClick={() => {
              setSelectedRun(undefined);
              show('runs');
            }}
          />
          <IconButton
            label="Settings"
            icon={Settings}
            align="end"
            active={activeView === 'settings'}
            onClick={() => show('settings')}
          />
        </nav>
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
