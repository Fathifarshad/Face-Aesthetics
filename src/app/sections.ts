/** The five sections of the doctor app frame (docs/PRD.md §4, M0) and the case steps inside each. */
export type SectionId = 'cases' | 'capture' | 'simulate' | 'plan' | 'gallery';

export type StepId =
  | 'intake'
  | 'capture'
  | 'grading'
  | 'analysis'
  | 'simulate'
  | 'plan'
  | 'mdcodes'
  | 'report'
  | 'gallery'
  | 'compare';

export const SECTIONS: readonly { id: SectionId; steps: readonly StepId[] }[] = [
  { id: 'cases', steps: ['intake'] },
  { id: 'capture', steps: ['capture'] },
  { id: 'simulate', steps: ['grading', 'simulate', 'analysis'] },
  { id: 'plan', steps: ['plan', 'mdcodes', 'report'] },
  { id: 'gallery', steps: ['gallery', 'compare'] },
];

const CASE_ROUTE = /^\/doctor\/case\/([^/]+)\/([^/?#]+)/;
const NO_CASE_ROUTE = /^\/doctor\/no-case\/([^/?#]+)/;

export const sectionOfStep = (step: string): SectionId =>
  SECTIONS.find((s) => (s.steps as readonly string[]).includes(step))?.id ?? 'cases';

/** Case id and step of a case route, or null outside a case. */
export function caseRoute(pathname: string): { caseId: string; step: string } | null {
  const m = CASE_ROUTE.exec(pathname);
  return m ? { caseId: m[1]!, step: m[2]! } : null;
}

/** Which of the five sections a doctor route belongs to. */
export function sectionOfPath(pathname: string): SectionId {
  const route = caseRoute(pathname);
  if (route) return sectionOfStep(route.step);
  const blocked = NO_CASE_ROUTE.exec(pathname)?.[1];
  return SECTIONS.find((s) => s.id === blocked)?.id ?? 'cases';
}

/** Where a section tab leads: the list for "cases", the first step of the open case, or the "no case open" notice. */
export function sectionHref(id: SectionId, activeCaseId: string | null): string {
  if (id === 'cases') return '/doctor';
  if (!activeCaseId) return `/doctor/no-case/${id}`;
  return `/doctor/case/${activeCaseId}/${SECTIONS.find((s) => s.id === id)!.steps[0]}`;
}
