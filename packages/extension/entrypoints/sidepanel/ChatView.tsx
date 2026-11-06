import { useRef, useState } from 'react';
import {
  attachmentNote,
  MAX_ATTACHMENT_BYTES,
  saveAttachment,
  toBase64,
  type Attachment,
} from '@/src/attachments';
import { titleFor } from '@/src/history';
import { Workflow } from 'lucide-react';
import ApprovalCard from '@/src/ui/ApprovalCard';
import EmptyState from '@/src/ui/EmptyState';
import type { SafetyMode } from '@/src/safety/settings';
import Logo from '@/src/ui/Logo';
import { stepsFromMessages, workflowFromChat } from '@/src/workflows/fromChat';
import { saveWorkflow } from '@/src/workflows/store';
import type { useChat } from './useChat';
import Composer from './Composer';
import MessageList from './MessageList';
import ModelChip from './ModelChip';
import QuestionCard from './QuestionCard';
import TakeoverBar from './TakeoverBar';
import SafetyChip from './SafetyChip';
import SetupCard from './SetupCard';
import { suggestionsFor, useActiveTab } from './useActiveTab';
import type { ProviderState } from './useProviderSettings';

type Props = {
  chat: ReturnType<typeof useChat>;
  providers: ProviderState;
  safetyMode?: SafetyMode;
  onOpenSettings: () => void;
  /** Called with the id of the workflow a finished chat was saved as. */
  onSavedWorkflow: (workflowId: string) => void;
};

export default function ChatView({
  chat,
  providers,
  safetyMode,
  onOpenSettings,
  onSavedWorkflow,
}: Props) {
  const { target } = chat;
  const activeTab = useActiveTab();
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string>();

  const attach = async (list: FileList) => {
    setFileError(undefined);
    for (const file of Array.from(list)) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setFileError(`${file.name} is larger than 10 MB.`);
        continue;
      }
      const base64 = toBase64(new Uint8Array(await file.arrayBuffer()));
      const saved = await saveAttachment({
        name: file.name,
        type: file.type,
        size: file.size,
        base64,
      });
      setFiles((current) => [...current, saved]);
    }
  };

  const send = (text: string) => {
    chat.send(files.length ? `${text}\n\n${attachmentNote(files)}` : text);
    setFiles([]);
  };
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const approval = (
    <>
      {chat.approval && <ApprovalCard request={chat.approval} onAnswer={chat.answerApproval} />}
      {chat.question && <QuestionCard question={chat.question} onAnswer={chat.answer} />}
      {chat.paused && <TakeoverBar onHandBack={chat.handBack} />}
    </>
  );
  const waiting = Boolean(chat.approval || chat.question || chat.paused);
  if (providers.ready.length === 0 && chat.messages.length === 0) {
    return <SetupCard onOpenSettings={onOpenSettings}>{approval}</SetupCard>;
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
                {suggestionsFor(activeTab).map((example) => (
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
          {waiting ? approval : undefined}
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
      {fileError && (
        <div className="error-banner composer-error" role="alert">
          {fileError}
        </div>
      )}
      <Composer
        text={draft}
        onTextChange={setDraft}
        inputRef={input}
        running={chat.running}
        onSend={send}
        onStop={chat.stop}
        onTakeOver={chat.takeOver}
        paused={chat.paused}
        files={files}
        onAttach={(list) => void attach(list)}
        onRemoveFile={(id) => setFiles((current) => current.filter((f) => f.id !== id))}
        tools={
          target && (
            <>
              <ModelChip
                target={target}
                state={providers}
                disabled={chat.running}
                onChange={chat.changeTarget}
              />
              {safetyMode && <SafetyChip mode={safetyMode} disabled={chat.running} />}
            </>
          )
        }
      />
    </>
  );
}
