import type { Status } from './types';

/**
 * Clinical sign-off (PRD §3.5). On 2026-11-17 the owner reported that the clinic's two physicians reviewed and approved
 * every clinical value of the app: volume and dose ranges, off-label doses, onset/duration/downtime, grade thresholds and
 * scales, age coefficients, lip types, MD Codes names and zones, "after" photo timings, result rank, cost tier and image
 * caps. The values themselves did not change; only their status moved from `draft` to `verified`.
 * Setting `status` back to 'draft' shows the «تأییدنشده» badge again everywhere it is tied to this record.
 */
export const CLINICAL_REVIEW: {
  status: Status;
  date: string;
  reviewers: readonly string[];
  /** The reviewers as shown in the interface. */
  by: { fa: string; en: string };
} = {
  status: 'verified',
  date: '2026-11-17',
  reviewers: ['Dr Farshad Fathi', 'Dr Naghmeh Nouri'],
  by: { fa: 'دکتر فرشاد فتحی و دکتر نغمه نوری', en: 'Dr Farshad Fathi and Dr Naghmeh Nouri' },
};

/** True while the sign-off is withdrawn: every badge tied to this record shows «تأییدنشده». */
export const reviewPending = (): boolean => CLINICAL_REVIEW.status === 'draft';

/** Appended to the `source` of every record the sign-off covers. */
export const REVIEWED = `reviewed and approved by ${CLINICAL_REVIEW.reviewers.join(' and ')} on ${CLINICAL_REVIEW.date}`;
