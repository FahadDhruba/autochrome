import { useState } from 'react';
import { Hand, MessageCircleQuestion, Send } from 'lucide-react';
import type { Question } from './useChat';

type Props = { question: Question; onAnswer: (text: string) => void };

/** The agent's question, or its request that the user do something in the page themselves. */
export default function QuestionCard({ question, onAnswer }: Props) {
  const [text, setText] = useState('');
  const Icon = question.handoff ? Hand : MessageCircleQuestion;
  const submit = (value: string) => {
    if (!question.handoff && !value.trim()) return;
    onAnswer(value.trim());
  };

  return (
    <section className="question" aria-label="Question from the AI" data-testid="question-card">
      <h2 className="question-title">
        <Icon size={15} aria-hidden="true" />
        {question.handoff ? 'Your turn in the page' : 'The AI asks'}
      </h2>
      <p className="question-text">{question.question}</p>
      {question.handoff && (
        <p className="muted question-hint">
          Do it in the page yourself. Nothing you type there is sent to the AI.
        </p>
      )}
      {question.choices && question.choices.length > 0 && (
        <div className="question-choices">
          {question.choices.map((choice) => (
            <button key={choice} type="button" className="chip" onClick={() => submit(choice)}>
              {choice}
            </button>
          ))}
        </div>
      )}
      <form
        className="question-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(text);
        }}
      >
        <input
          aria-label={question.handoff ? 'Note for the AI (optional)' : 'Your answer'}
          placeholder={question.handoff ? 'Note for the AI (optional)' : 'Your answer'}
          value={text}
          autoFocus
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="with-icon">
          <Send size={14} aria-hidden="true" />
          {question.handoff ? 'Done' : 'Answer'}
        </button>
      </form>
    </section>
  );
}
