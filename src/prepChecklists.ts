/** Prep tips shown to clients before their visit (by service name keywords). */

const DEFAULT: string[] = [
  'Clear surfaces of fragile or valuable items where possible.',
  'Ensure we can access water and power if your service needs them.',
  'Secure pets in a safe area if they may be stressed by visitors.',
];

const DEEP: string[] = [
  'Declutter floors and surfaces so we can reach edges and corners.',
  'Note any areas needing extra care (grout, ovens, inside cupboards).',
  ...DEFAULT.slice(0, 2),
];

const TENANCY: string[] = [
  'Remove all personal belongings before the end-of-tenancy clean.',
  'Fridge/freezer: empty or tell us if you need inside appliances done.',
  'Carpets: mention stains so we can plan spot treatment.',
  ...DEFAULT.slice(0, 1),
];

const AIRBNB: string[] = [
  'Leave linens ready or note if linen change is included.',
  'Highlight any damage or maintenance issues for your checklist.',
  'Access codes / key safe: confirm details are up to date.',
];

const COMMERCIAL: string[] = [
  'Confirm after-hours access and alarm codes if applicable.',
  'Point out restricted zones or confidential areas.',
  ...DEFAULT.slice(0, 2),
];

export function getPrepChecklistForService(serviceType: string): string[] {
  const t = (serviceType || '').toLowerCase();
  if (t.includes('deep')) return DEEP;
  if (t.includes('tenancy') || t.includes('move')) return TENANCY;
  if (t.includes('airbnb') || t.includes('bnb')) return AIRBNB;
  if (t.includes('commercial') || t.includes('office')) return COMMERCIAL;
  if (t.includes('jet') || t.includes('wash')) return ['Clear the area of vehicles and loose debris.', 'Ensure outdoor water access if required.', ...DEFAULT.slice(1)];
  return DEFAULT;
}
