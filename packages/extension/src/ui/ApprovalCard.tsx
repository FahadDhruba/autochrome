import { canAllowSite, type ApprovalChoice, type ApprovalRequest } from '@/src/safety/types';
import './approval-card.css';

type Props = { request: ApprovalRequest; onAnswer: (choice: ApprovalChoice) => void };

/** Asks whether the AI may do one thing. Shared by the side panel chat and the approve popup. */
export default function ApprovalCard({ request, onAnswer }: Props) {
  return (
    <section
      className={`approval${request.risk ? ' approval-risky' : ''}`}
      aria-label="Approval request"
      data-testid="approval-card"
    >
      <h2 className="approval-title">
        {request.source === 'bridge' ? 'An external tool wants to' : 'The AI wants to'}
      </h2>
      <p className="approval-action">
        <span className="approval-tool">{request.tool}</span>
        {request.summary && <span className="approval-summary">{request.summary}</span>}
      </p>
      {request.target && <p className="approval-detail">On {request.target}</p>}
      {request.risk && (
        <p className="approval-risk" data-testid="approval-risk">
          <strong>Risky:</strong> {request.risk}
        </p>
      )}
      {request.detail && (
        <pre className="approval-code" data-testid="approval-code">
          {request.detail}
        </pre>
      )}
      <dl className="approval-facts">
        {request.site && (
          <>
            <dt>Site</dt>
            <dd>{request.site}</dd>
          </>
        )}
        {request.tabTitle && (
          <>
            <dt>Tab</dt>
            <dd>{request.tabTitle}</dd>
          </>
        )}
      </dl>
      <div className="approval-buttons">
        <button onClick={() => onAnswer('once')}>Allow once</button>
        {canAllowSite(request) && (
          <button className="secondary" onClick={() => onAnswer('site')}>
            Allow on this site
          </button>
        )}
        <button className="danger" onClick={() => onAnswer('deny')}>
          Deny
        </button>
      </div>
    </section>
  );
}
