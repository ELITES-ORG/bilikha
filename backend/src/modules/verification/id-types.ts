import type { IdType } from '../../contracts/verification.js';

/**
 * Which accepted IDs have a back (issue #51). A card needs both sides; a
 * single-page document — a certificate, a clearance, a printout — only its
 * front.
 *
 * No imports but a contract type, so the frontend's parity test can import
 * this file directly and fail if its own list drifts from it.
 */
export const ID_TYPES: Readonly<Record<IdType, { hasBack: boolean }>> = {
  philsys_id: { hasBack: true },
  ephilid: { hasBack: false },
  drivers_license: { hasBack: true },
  postal_id: { hasBack: true },
  umid: { hasBack: true },
  voters_certification: { hasBack: false },
  barangay_id: { hasBack: true },
  barangay_certificate_of_residency: { hasBack: false },
  barangay_clearance: { hasBack: false },
  senior_citizen_id: { hasBack: true },
  pwd_id: { hasBack: true },
  college_id: { hasBack: true },
  high_school_id: { hasBack: true },
};

export const ID_TYPE_IDS = Object.keys(ID_TYPES) as IdType[];
