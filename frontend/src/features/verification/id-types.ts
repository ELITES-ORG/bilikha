import type { IdType } from '@contracts/verification';

/**
 * The accepted IDs, as issue #51 lists them. Each shows a Biliran address or is
 * issued in Biliran. The names are documents' own names, so they are data here
 * rather than catalogue copy, and Phase 3's admin pages use the same list.
 *
 * `hasBack` must match `backend/src/modules/verification/id-types.ts` — the API
 * refuses a card without its back, and a certificate with one.
 * `id-types-parity.test.ts` fails if they drift.
 */
export type IdTypeGroup = 'government' | 'local' | 'school';

export interface IdTypeOption {
  id: IdType;
  label: string;
  group: IdTypeGroup;
  hasBack: boolean;
}

export const ID_TYPE_OPTIONS: readonly IdTypeOption[] = [
  { id: 'philsys_id', label: 'PhilSys National ID (PhilID)', group: 'government', hasBack: true },
  { id: 'ephilid', label: 'ePhilID (printed)', group: 'government', hasBack: false },
  { id: 'drivers_license', label: "LTO Driver's License", group: 'government', hasBack: true },
  { id: 'postal_id', label: 'PhilPost Postal ID', group: 'government', hasBack: true },
  { id: 'umid', label: 'UMID (SSS / GSIS)', group: 'government', hasBack: true },
  {
    id: 'voters_certification',
    label: "COMELEC Voter's Certification",
    group: 'government',
    hasBack: false,
  },
  { id: 'barangay_id', label: 'Barangay ID', group: 'local', hasBack: true },
  {
    id: 'barangay_certificate_of_residency',
    label: 'Barangay Certificate of Residency',
    group: 'local',
    hasBack: false,
  },
  { id: 'barangay_clearance', label: 'Barangay Clearance', group: 'local', hasBack: false },
  { id: 'senior_citizen_id', label: 'Senior Citizen ID', group: 'local', hasBack: true },
  { id: 'pwd_id', label: 'PWD ID', group: 'local', hasBack: true },
  { id: 'college_id', label: 'University or college ID', group: 'school', hasBack: true },
  { id: 'high_school_id', label: 'Senior high school or high school ID', group: 'school', hasBack: true },
];

export function idTypeOption(id: IdType | null | undefined): IdTypeOption | undefined {
  return ID_TYPE_OPTIONS.find((option) => option.id === id);
}
