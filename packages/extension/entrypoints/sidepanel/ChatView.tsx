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
import type { ContextPart } from '@/src/agent/protocol';
import type { SafetyMode } from '@/src/safety/settings';
import Logo from '@/src/ui/Logo';
import { stepsFromMessages, workflowFromChat } from '@/src/workflows/fromChat';
import { saveWorkflow } from '@/src/workflows/store';
import type { useChat } from './useChat';
import Composer from './Composer';
import MessageList from './MessageList';
import ModelChip from './ModelChip';
import ContextButton from './ContextButton';
import QuestionCard from './QuestionCard';
import TakeoverBar from './TakeoverBar';
import SafetyChip from './SafetyChip';
import SetupCard from './SetupCard';
import { suggestionsFor, useActiveTab } from './useActiveTab';
import { usePendingPrompt } from './usePendingPrompt';
import { usePrompts } from './usePrompts';
import { useLimits } from './useLimits';
import { estimateCost, formatCost, priceOf } from '@/src/limits';
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
  const prompts = usePrompts();
  const { prices } = useLimits();
  const price = target && priceOf(prices, target.providerId, target.model);
  const cost = price && chat.usage ? formatCost(estimateCost(chat.usage, price)) : undefined;
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string>();
  const [context, setContext] = useState<{ id: string; part: ContextPart }[]>([]);

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
    const parts = context.map((c) => c.part);
    chat.send(files.length ? `${text}\n\n${attachmentNote(files)}` : text, parts);
    setFiles([]);
    setContext([]);
  };

  // A right-click on a page: send it straight away when possible, else leave it to edit.
  usePendingPrompt((text) => {
    if (chat.target && providers.ready.length > 0 && !chat.running) send(text);
    else {
      setDraft(text);
      input.current?.focus();
    }
  });
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
          cost={cost}
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
        prompts={prompts}
        paused={chat.paused}
        files={[
          ...files.map((f) => ({ id: f.id, name: f.name, kind: 'file' as const })),
          ...context.map((c) => ({ id: c.id, name: c.part.context, kind: 'context' as const })),
        ]}
        onAttach={(list) => void attach(list)}
        onRemoveFile={(id) => {
          setFiles((current) => current.filter((f) => f.id !== id));
          setContext((current) => current.filter((c) => c.id !== id));
        }}
        addons={
          <ContextButton
            onAdd={(part) => {
              setFileError(undefined);
              setContext((current) => [...current, { id: crypto.randomUUID(), part }]);
            }}
            onError={setFileError}
          />
        }
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
