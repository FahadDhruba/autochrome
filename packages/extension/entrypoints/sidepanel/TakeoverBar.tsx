import { useState } from 'react';
import { Hand } from 'lucide-react';

type Props = { onHandBack: (note?: string) => void };

/** Shown while the user has taken over: the agent waits until they hand the browser back. */
export default function TakeoverBar({ onHandBack }: Props) {
  const [note, setNote] = useState('');
  return (
    <section className="takeover" aria-label="You have control" data-testid="takeover-bar">
      <p className="takeover-title">
        <Hand size={15} aria-hidden="true" />
        You have control
      </p>
      <p className="muted">
        The AI is paused. Do what you need in the page, then hand it back. It will look at the page
        again before going on.
      </p>
      <form
        className="question-form"
        onSubmit={(event) => {
          event.preventDefault();
          onHandBack(note.trim() || undefined);
        }}
      >
        <input
          aria-label="Note for the AI (optional)"
          placeholder="Note for the AI (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <button type="submit">Hand back</button>
      </form>
    </section>
  );
}
