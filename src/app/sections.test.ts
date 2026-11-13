import { describe, expect, it } from 'vitest';
import { caseRoute, sectionHref, sectionOfPath, SECTIONS } from './sections';

describe('app sections', () => {
  it('has the five sections of the app frame in order', () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(['cases', 'capture', 'simulate', 'plan', 'gallery']);
  });

  it('maps doctor routes to their section', () => {
    expect(sectionOfPath('/doctor')).toBe('cases');
    expect(sectionOfPath('/doctor/patient/p1')).toBe('cases');
    expect(sectionOfPath('/doctor/case/c1/intake')).toBe('cases');
    expect(sectionOfPath('/doctor/case/c1/capture')).toBe('capture');
    expect(sectionOfPath('/doctor/case/c1/analysis')).toBe('simulate');
    expect(sectionOfPath('/doctor/case/c1/age')).toBe('simulate');
    expect(sectionOfPath('/doctor/case/c1/simulate')).toBe('simulate');
    expect(sectionOfPath('/doctor/case/c1/mdcodes')).toBe('plan');
    expect(sectionOfPath('/doctor/case/c1/report')).toBe('plan');
    expect(sectionOfPath('/doctor/case/c1/compare')).toBe('gallery');
    expect(sectionOfPath('/doctor/no-case/plan')).toBe('plan');
    expect(sectionOfPath('/doctor/no-case/unknown')).toBe('cases');
  });

  it('reads the case id and step from a case route only', () => {
    expect(caseRoute('/doctor/case/abc/plan')).toEqual({ caseId: 'abc', step: 'plan' });
    expect(caseRoute('/doctor/patient/abc')).toBeNull();
  });

  it('sends section tabs to the open case, or to the notice when no case is open', () => {
    expect(sectionHref('cases', 'c1')).toBe('/doctor');
    expect(sectionHref('simulate', 'c1')).toBe('/doctor/case/c1/analysis');
    expect(sectionHref('gallery', 'c1')).toBe('/doctor/case/c1/gallery');
    expect(sectionHref('plan', null)).toBe('/doctor/no-case/plan');
  });
});
