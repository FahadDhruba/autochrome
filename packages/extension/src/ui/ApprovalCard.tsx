import { canAllowSite, type ApprovalChoice, type ApprovalRequest } from '@/src/safety/types';
import { Check, ShieldCheck, X } from 'lucide-react';
import './approval-card.css';

const ASKER: Record<ApprovalRequest['source'], string> = {
  agent: 'The AI wants to',
  workflow: 'A workflow wants to',
  bridge: 'An external tool wants to',
  scheduled: 'A scheduled run wants to',
};

const VERB: Partial<Record<ApprovalRequest['tool'], string>> = {
  click: 'click',
  type: 'type into',
  form_input: 'fill in',
  key: 'press keys in',
  scroll: 'scroll',
  hover: 'point at',
  drag: 'drag and drop on this page',
  upload_file: 'upload files to',
  dialog: 'answer a dialog',
  navigate: 'open a page',
  tab_open: 'open a page',
  go_back: 'go back',
  go_forward: 'go forward',
  read_page: 'read this page',
  get_text: 'read this page',
  find: 'search this page',
  screenshot: 'take a screenshot of this page',
  console_logs: 'read the console',
  network_requests: 'read network requests',
  network_response: 'read a network response',
  js_eval: 'run JavaScript in this page',
  workflow_run: 'run a workflow',
};

/** "click “Place order”" from the tool and its target (`button "Place order"`). */
export function approvalAction(request: Pick<ApprovalRequest, 'tool' | 'target'>): string {
  const verb = VERB[request.tool] ?? `use ${request.tool}`;
  const name = request.target && /"(.*)"$/.exec(request.target)?.[1];
  return name ? `${verb} “${name}”` : verb;
}

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
        {ASKER[request.source]} <strong>{approvalAction(request)}</strong>
      </h2>
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
      <details className="approval-more">
        <summary>Details</summary>
        <p className="approval-action">
          <span className="approval-tool">{request.tool}</span>
          {request.summary && <span className="approval-summary">{request.summary}</span>}
        </p>
        {request.target && <p className="approval-detail">On {request.target}</p>}
      </details>
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
        <button className="with-icon" onClick={() => onAnswer('once')}>
          <Check size={14} aria-hidden="true" />
          Allow once
        </button>
        {canAllowSite(request) && (
          <button className="secondary with-icon" onClick={() => onAnswer('site')}>
            <ShieldCheck size={14} aria-hidden="true" />
            Allow on this site
          </button>
        )}
        <button className="danger with-icon" onClick={() => onAnswer('deny')}>
          <X size={14} aria-hidden="true" />
          Deny
        </button>
      </div>
    </section>
  );
}
