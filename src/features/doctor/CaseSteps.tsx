import { NavLink, useLocation } from 'react-router-dom';
import { caseRoute, sectionOfStep, SECTIONS } from '../../app/sections';
import { useT } from '../../i18n';

/** Steps of the current section for the open case. Sections with a single step show nothing. */
export function CaseSteps({ caseId }: { caseId: string }) {
  const t = useT();
  const { pathname } = useLocation();
  const step = caseRoute(pathname)?.step ?? '';
  const steps = SECTIONS.find((s) => s.id === sectionOfStep(step))!.steps;
  if (steps.length < 2) return null;
  return (
    <nav className="no-print -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label={t.nav.stepsLabel}>
      {steps.map((id, i) => (
        <NavLink
          key={id}
          to={`/doctor/case/${caseId}/${id}`}
          className={({ isActive }) =>
            `flex min-h-touch shrink-0 items-center gap-1.5 rounded-pill border px-3 text-caption ${
              isActive ? 'border-primary bg-primary-tint font-semibold text-primary-on-tint' : 'border-border text-ink-2'
            }`
          }
        >
          <bdi className="flex h-5 w-5 items-center justify-center rounded-pill bg-surface-2 text-label">{i + 1}</bdi>
          {t.nav.steps[id]}
        </NavLink>
      ))}
    </nav>
  );
}
