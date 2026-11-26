import { PackSvg } from '@/components/resources/CardIcon';
import { placeOf } from '@/lib/pricing/markets';
import { TINTS, packIcon } from '@/lib/resources/iconPack';

/** A price book item's icon (from the card icon pack, tinted by its catalog place). */
export function ItemIcon({ sku, size = 'w-[34px] h-[34px]' }: { sku: string; size?: string }) {
  const p = placeOf(sku);
  const icon = packIcon(p.icon) ?? packIcon('document')!;
  const t = TINTS[p.tint] ?? TINTS.stone;
  return (
    <span className={`${size} rounded-[9px] grid place-items-center flex-shrink-0`} style={{ background: t.bg, color: t.fg }} aria-hidden="true">
      <PackSvg icon={icon} className="w-[52%] h-[52%]" />
    </span>
  );
}
