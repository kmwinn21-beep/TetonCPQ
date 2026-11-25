'use client';

/** A person's photo, or their initials on a warm gradient when there's no photo. */
const GRADS = ['#E9A08E,#C4553F', '#B3A6F0,#6A5BC7', '#8FD3AE,#2E9E5B', '#9BC2F2,#3F6FD8', '#F2C48F,#C97A2B', '#9AA3AE,#3A4250'];
export const initialsOf = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] ?? '?').slice(0, 2)).toUpperCase();
};

export function PersonPhoto({ name, photoUrl, size = 48, square = false, className = '' }: { name: string; photoUrl: string | null; size?: number; square?: boolean; className?: string }) {
  const g = GRADS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % GRADS.length];
  const radius = square ? Math.round(size * 0.14) : size / 2;
  if (photoUrl)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photoUrl} alt="" className={`object-cover flex-shrink-0 ${className}`} style={{ width: size, height: size, borderRadius: radius }} />;
  return (
    <span className={`grid place-items-center flex-shrink-0 text-white font-bold ${className}`} style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(145deg,${g})`, fontSize: Math.round(size * 0.32) }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
