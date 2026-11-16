import type { ReactNode } from 'react';
import { Header, LinkButton, Page } from '../../components/ui';
import { useT } from '../../i18n';

/** Empty state drawn as a plain line face (docs/BRAND.md §8: no stock imagery). */
function EmptyState({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <div className="card mt-2 flex flex-col items-center gap-3 px-5 py-8 text-center">
      <svg width="72" height="72" viewBox="0 0 80 80" fill="none" className="stroke-muted" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <ellipse cx="40" cy="40" rx="22" ry="28" />
        <path d="M40 8v64" strokeDasharray="3 4" />
        <path d="M18 31h44M18 49h44" strokeDasharray="3 4" />
      </svg>
      <h2 className="text-section font-semibold">{title}</h2>
      <p className="text-control text-ink-2">{body}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}

/** A section tab was opened while no case is open. */
export function NoCasePage() {
  const t = useT();
  return (
    <>
      <Header title={t.nav.noCaseTitle} />
      <Page>
        <EmptyState title={t.nav.noCaseTitle} body={t.nav.noCaseBody}>
          <LinkButton to="/doctor">{t.nav.openCases}</LinkButton>
        </EmptyState>
      </Page>
    </>
  );
}
