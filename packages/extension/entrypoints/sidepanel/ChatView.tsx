import { useRef, useState } from 'react';
import { titleFor } from '@/src/history';
import { KeyRound, Workflow } from 'lucide-react';
import ApprovalCard from '@/src/ui/ApprovalCard';
import EmptyState from '@/src/ui/EmptyState';
import Logo from '@/src/ui/Logo';
import { stepsFromMessages, workflowFromChat } from '@/src/workflows/fromChat';
import { saveWorkflow } from '@/src/workflows/store';
import type { useChat } from './useChat';
import Composer from './Composer';
import MessageList from './MessageList';
import ModelChip from './ModelChip';
import type { ProviderState } from './useProviderSettings';

type Props = {
  chat: ReturnType<typeof useChat>;
  providers: ProviderState;
  onOpenSettings: () => void;
  /** Called with the id of the workflow a finished chat was saved as. */
  onSavedWorkflow: (workflowId: string) => void;
};

const EXAMPLES = [
  'Summarize the page I have open',
  'List my open tabs and group them by topic',
  'Find the contact email on this site',
];

export default function ChatView({ chat, providers, onOpenSettings, onSavedWorkflow }: Props) {
  const { target } = chat;
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const approval = chat.approval && (
    <ApprovalCard request={chat.approval} onAnswer={chat.answerApproval} />
  );
  if (providers.ready.length === 0 && chat.messages.length === 0) {
    return (
      <EmptyState
        testId="empty-state"
        visual={<KeyRound size={40} strokeWidth={1.5} />}
        actions={
          <>
            <button onClick={onOpenSettings}>Open settings</button>
            {approval}
          </>
        }
      >
        Add an API key, or connect a local server such as Ollama, to run tasks in your browser.
      </EmptyState>
    );
  }

  const canSave = !chat.running && stepsFromMessages(chat.messages).length > 0;
  const saveAsWorkflow = async () => {
    const workflow = workflowFromChat({
      title: titleFor(chat.messages),
      messages: chat.messages,
    });
    await saveWorkflow(workflow);
    onSavedWorkflow(workflow.id);
  };

  return (
    <>
      {chat.messages.length === 0 ? (
        <EmptyState
          testId="chat-empty"
          visual={<Logo size={64} />}
          actions={
            <>
              <div className="example-chips">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setDraft(example);
                      input.current?.focus();
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
              {approval}
            </>
          }
        >
          Tell autochrome what to do in your browser.
        </EmptyState>
      ) : (
        <MessageList
          messages={chat.messages}
          running={chat.running}
          error={chat.error}
          usage={chat.usage}
          awaitingApproval={chat.approval !== undefined}
        >
          {approval}
        </MessageList>
      )}
      {canSave && (
        <div className="chat-actions">
          <button className="link with-icon" onClick={() => void saveAsWorkflow()}>
            <Workflow size={14} aria-hidden="true" />
            Save as workflow
          </button>
        </div>
      )}
      <Composer
        text={draft}
        onTextChange={setDraft}
        inputRef={input}
        running={chat.running}
        onSend={chat.send}
        onStop={chat.stop}
        tools={
          target && (
            <ModelChip
              target={target}
              state={providers}
              disabled={chat.running}
              onChange={chat.changeTarget}
            />
          )
        }
      />
    </>
  );
}
