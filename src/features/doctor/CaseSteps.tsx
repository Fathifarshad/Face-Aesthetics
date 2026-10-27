import { NavLink } from 'react-router-dom';
import { useT } from '../../i18n';

export function CaseSteps({ caseId }: { caseId: string }) {
  const t = useT();
  const steps = [
    ['intake', t.intake.title.split('،')[0]!.split(',')[0]!],
    ['capture', t.capture.title],
    ['analysis', t.analysis.title],
    ['age', t.age.title],
    ['plan', t.plan.title],
    ['report', t.report.title],
  ] as const;
  return (
    <nav className="no-print -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1" aria-label="steps">
      {steps.map(([path, label], i) => (
        <NavLink
          key={path}
          to={`/doctor/case/${caseId}/${path}`}
          className={({ isActive }) =>
            `flex min-h-touch shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] ${
              isActive ? 'border-gold bg-gold-tint font-semibold text-gold-ink' : 'border-border text-ink-secondary'
            }`
          }
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-2 text-[11px]">{i + 1}</span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
