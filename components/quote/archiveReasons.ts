/** Archive reasons: labels and pill colours (shared by the deal page and the Deals list). */
export const REASON_LABELS: Record<string, string> = { won: 'Won', lost: 'Lost', no_decision: 'No decision', duplicate: 'Duplicate / test', other: 'Other' };
export const REASON_TONE: Record<string, string> = {
  won: 'bg-[#E4F4EC] text-[#2F8F5B]',
  lost: 'bg-[#FDECE8] text-[#B4442C]',
  no_decision: 'bg-[#F0EEE9] text-[#6B6458]',
  duplicate: 'bg-[#EEF1F5] text-[#56606E]',
  other: 'bg-[#F0EEE9] text-[#6B6458]',
};
export const reasonLabel = (r: string) => REASON_LABELS[r] ?? 'Other';
