/**
 * All values are synthetic; the card and IBAN are published test examples,
 * the SSN is a publicly voided specimen, and the phone numbers use the reserved 555-01xx range.
 */

export interface SampleItem {
  id: 'support-email' | 'hr-note' | 'clinic-intake';
  label: 'Support email' | 'HR note' | 'Clinic intake';
  text: string;
}

export const SAMPLES: readonly SampleItem[] = [
  {
    id: 'support-email',
    label: 'Support email',
    text: 'Hi support, this is Dana Whitfield following up on my order #A-20931. Please send the updated receipt to dana.whitfield@example.com or call me at (312) 555-0142 before 5pm today. The duplicate charge was on card 4111 1111 1111 1111, and I would like it refunded. Thanks, Dana Whitfield',
  },
  {
    id: 'hr-note',
    label: 'HR note',
    text: 'Marcus Bell from the Denver office asked to update his direct deposit to IBAN GB82 WEST 1234 5698 7654 32. His new home address is 48 Larkspur Lane. Reach him at marcus.bell@example.org or +1 720 555 0177 to confirm before payroll closes Friday.',
  },
  {
    id: 'clinic-intake',
    label: 'Clinic intake',
    text: 'New patient Priya Natarajan, SSN 078-05-1120, reports recurring migraines for three weeks. Lives at 905 Juniper Avenue. Prefers email at priya.n@example.net; mobile (415) 555-0163. Referred by the walk-in clinic portal from 203.0.113.42.',
  },
];
