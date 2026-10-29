import { titleFor } from '@/src/history';
import ApprovalCard from '@/src/ui/ApprovalCard';
import { stepsFromMessages, workflowFromChat } from '@/src/workflows/fromChat';
import { saveWorkflow } from '@/src/workflows/store';
import type { useChat } from './useChat';
import Composer from './Composer';
import MessageList from './MessageList';
import ModelPicker from './ModelPicker';
import type { ProviderState } from './useProviderSettings';

type Props = {
  chat: ReturnType<typeof useChat>;
  providers: ProviderState;
  onOpenSettings: () => void;
  /** Called with the id of the workflow a finished chat was saved as. */
  onSavedWorkflow: (workflowId: string) => void;
};

export default function ChatView({ chat, providers, onOpenSettings, onSavedWorkflow }: Props) {
  const { target } = chat;
  const approval = chat.approval && (
    <ApprovalCard request={chat.approval} onAnswer={chat.answerApproval} />
  );
  if (providers.ready.length === 0 && chat.messages.length === 0) {
    return (
      <div className="empty" data-testid="empty-state">
        <h2>Set up a provider</h2>
        <p>
          autochrome needs an API key (Anthropic, OpenAI or Gemini) or an OpenAI-compatible server
          such as Ollama to run tasks in your browser.
        </p>
        <button onClick={onOpenSettings}>Open settings</button>
        {approval}
      </div>
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
        <div className="empty">
          <h2>What should I do?</h2>
          <p>Describe a task. I will work in your tabs and show each step.</p>
          {approval}
        </div>
      ) : (
        <MessageList
          messages={chat.messages}
          running={chat.running}
          error={chat.error}
          usage={chat.usage}
        >
          {approval}
        </MessageList>
      )}
      {canSave && (
        <div className="chat-actions">
          <button className="link" onClick={() => void saveAsWorkflow()}>
            Save as workflow
          </button>
        </div>
      )}
      {target && (
        <ModelPicker
          target={target}
          state={providers}
          disabled={chat.running}
          onChange={chat.changeTarget}
        />
      )}
      <Composer running={chat.running} onSend={chat.send} onStop={chat.stop} />
    </>
  );
}
