import { useEffect, useState } from 'react';
import Logo from '@/src/ui/Logo';
import type { ApprovalAnswer, ApprovalGet } from '@/src/safety/messages';
import type { ApprovalChoice, ApprovalRequest } from '@/src/safety/types';
import ApprovalCard from '@/src/ui/ApprovalCard';

const CLOSE_DELAY_MS = 1500;

/** The popup opened when no side panel is there to show the prompt. */
export default function App() {
  const [request, setRequest] = useState<ApprovalRequest | null>();

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('id') ?? '';
    const message: ApprovalGet = { type: 'autochrome:approval-get', id };
    void browser.runtime.sendMessage(message).then((found?: ApprovalRequest) => {
      setRequest(found ?? null);
      if (!found) setTimeout(() => window.close(), CLOSE_DELAY_MS);
    });
  }, []);

  const answer = async (choice: ApprovalChoice) => {
    const message: ApprovalAnswer = {
      type: 'autochrome:approval-answer',
      id: request!.id,
      choice,
    };
    await browser.runtime.sendMessage(message);
    window.close();
  };

  return (
    <main>
      <h1 className="app-title">
        <Logo />
        autochrome
      </h1>
      {request ? (
        <ApprovalCard request={request} onAnswer={(choice) => void answer(choice)} />
      ) : (
        request === null && <p className="gone">This request was already answered or expired.</p>
      )}
    </main>
  );
}
