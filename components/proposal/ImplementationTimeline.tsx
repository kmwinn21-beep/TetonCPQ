/**
 * The implementation stages as a Gantt chart for the business case: one row
 * per stage (number, name, length) with its bar on a month timeline, kick-off
 * and go-live marked. HTML rather than SVG so the timing text stays clickable
 * (the parent passes it in) and it prints crisply.
 */
import type { ScheduledStage } from '@/lib/quote/implementationPlan';
import { stageColor } from '@/components/implementation/ImplementationGantt';

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const short = (iso: string) => new Date(t(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const MONTH = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();

export function ImplementationTimeline({
  stages,
  order,
  goLive,
  timing,
}: {
  stages: ScheduledStage[];
  /** The plan's stage order (for colours of added stages). */
  order: string[];
  /** Go-live date, ISO. */
  goLive: string | null;
  /** The length line under each stage name ("5 weeks · weeks 4–8"). */
  timing: (s: ScheduledStage) => React.ReactNode;
}) {
  if (!stages.length) return null;
  const from = Math.min(...stages.map((s) => t(s.start)));
  const to = Math.max(...stages.map((s) => t(s.end) + DAY), goLive ? t(goLive) + 7 * DAY : 0);
  const span = to - from;
  const pct = (ms: number) => ((ms - from) / span) * 100;
  // Month boundaries inside the window, labeled where there's room.
  const months: Array<{ at: number; label: string; width: number }> = [];
  const d0 = new Date(from);
  let m = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1);
  let first = true;
  while (m < to) {
    const next = new Date(m);
    const nm = Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1);
    const a = Math.max(m, from);
    const b = Math.min(nm, to);
    const d = new Date(m);
    const withYear = first || d.getUTCMonth() === 0;
    months.push({ at: pct(a), width: pct(b) - pct(a), label: `${MONTH(d)}${withYear ? ` ’${String(d.getUTCFullYear()).slice(2)}` : ''}` });
    if (pct(b) - pct(a) >= 7) first = false;
    m = nm;
  }
  const kickoff = stages.find((s) => s.fromWeek === 1 || (s.fromWeek <= 1 && s.toWeek >= 1));
  const kickoffAt = kickoff ? pct(t(kickoff.start) + Math.max(0, 1 - kickoff.fromWeek) * 7 * DAY) : null;
  const goLiveAt = goLive ? pct(t(goLive)) : null;

  return (
    <div className="bc-gantt">
      <div className="bc-gantt-row bc-gantt-head">
        <div />
        <div className="bc-gantt-track">
          {months.map((mo, i) => (
            <span key={i} className="bc-gantt-month" style={{ left: `${mo.at}%`, width: `${mo.width}%` }}>
              {mo.width >= 7 ? mo.label : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="bc-gantt-body">
        {stages.map((s, i) => {
          const left = pct(t(s.start));
          const width = Math.max(pct(t(s.end) + DAY) - left, 0.8);
          const label = `${short(s.start)} – ${short(s.end)}`;
          const inside = width >= 17;
          const before = !inside && left + width > 78;
          return (
            <div key={s.id} className="bc-gantt-row">
              <div className="bc-gantt-name">
                <span className="bc-gantt-n">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <b>{s.name}</b>
                  <small>{timing(s)}</small>
                </span>
              </div>
              <div className="bc-gantt-track">
                {months.map((mo, k) => (k ? <i key={k} className="bc-gantt-grid" style={{ left: `${mo.at}%` }} /> : null))}
                <span className="bc-gantt-bar" style={{ left: `${left}%`, width: `${width}%`, background: stageColor(s.id, order) }}>
                  {inside && <em>{label}</em>}
                </span>
                {!inside && (
                  <span className="bc-gantt-date" style={before ? { right: `${100 - left + 1}%` } : { left: `${left + width + 1}%` }}>
                    {label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {/* Kick-off and go-live: full-height lines over the timeline column, labeled underneath. */}
        <div className="bc-gantt-overlay" aria-hidden="true">
          {kickoffAt != null && (
            <span className="bc-gantt-mark bc-gantt-kickoff" style={{ left: `${kickoffAt}%` }}>
              <span>Kick-off · {short(new Date(t(kickoff!.start) + Math.max(0, 1 - kickoff!.fromWeek) * 7 * DAY).toISOString())}</span>
            </span>
          )}
          {goLiveAt != null && (
            <span className="bc-gantt-mark bc-gantt-golive" style={{ left: `${goLiveAt}%` }}>
              <span>Go-live · {new Date(t(goLive!)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
