/**
 * The implementation plan as a generic timeline in weeks, for a proposal with
 * several pilot go-lives: every community follows the same plan, so one bar per
 * stage, on weeks counted down to kick-off (Pre-Kick Off: 10 … 1) and then up to
 * go-live (1 … 9). No dates: the cards below it carry each wave's dates.
 */
import type { ScheduledStage } from '@/lib/quote/implementationPlan';
import { stageColor } from '@/components/implementation/ImplementationGantt';

export function ImplementationWeeks({
  stages,
  order,
  timing,
}: {
  stages: ScheduledStage[];
  order: string[];
  /** The length label beside each bar ("3 weeks · Weeks 2–4"). */
  timing: (s: ScheduledStage) => React.ReactNode;
}) {
  if (!stages.length) return null;
  const minW = Math.min(...stages.map((s) => s.fromWeek), 1);
  const maxW = Math.max(...stages.map((s) => s.toWeek), 1);
  const n = maxW - minW + 1;
  const pct = (w: number) => ((w - minW) / n) * 100;
  const weeks = Array.from({ length: n }, (_, i) => minW + i);
  const pre = weeks.filter((w) => w <= 0).length;
  const golive = stages.find((s) => s.standard === 'golive');
  const goAt = golive ? pct(golive.fromWeek) : 100;
  const kickAt = pct(1);
  return (
    <div className="bc-wk">
      <div className="bc-wk-row bc-wk-head">
        <div />
        <div className="bc-wk-track">
          {pre > 0 && <span className="bc-wk-band bc-wk-pre" style={{ left: 0, width: `${kickAt}%` }}>Pre-Kick Off</span>}
          <span className="bc-wk-band bc-wk-post" style={{ left: `${kickAt}%`, width: `${100 - kickAt}%` }}>From kick-off to go-live</span>
          {weeks.map((w) => (
            <span key={w} className={`bc-wk-num ${w <= 0 ? 'bc-wk-num-pre' : ''}`} style={{ left: `${pct(w)}%`, width: `${100 / n}%` }}>
              {w <= 0 ? 1 - w : w}
            </span>
          ))}
        </div>
      </div>
      <div className="bc-wk-body">
        {stages.map((s, i) => {
          const left = pct(s.fromWeek);
          const width = ((s.toWeek - s.fromWeek + 1) / n) * 100;
          const after = left + width < 62;
          return (
            <div key={s.id} className="bc-wk-row">
              <div className="bc-wk-name">
                <span className="bc-gantt-n">{String(i + 1).padStart(2, '0')}</span>
                <b>{s.name}</b>
              </div>
              <div className="bc-wk-track">
                {weeks.slice(1).map((w) => (
                  <i key={w} className={`bc-wk-grid ${w === 1 ? 'bc-wk-grid-kick' : ''}`} style={{ left: `${pct(w)}%` }} />
                ))}
                <span className="bc-wk-bar" style={{ left: `${left}%`, width: `${width}%`, background: stageColor(s.id, order) }} />
                <span className="bc-wk-len" style={after ? { left: `${left + width + 1}%` } : { right: `${100 - left + 1}%` }}>
                  {timing(s)}
                </span>
              </div>
            </div>
          );
        })}
        <div className="bc-wk-overlay" aria-hidden="true">
          <span className="bc-wk-mark bc-wk-kick" style={{ left: `${kickAt}%` }}><span>Kick-off</span></span>
          <span className="bc-wk-mark bc-wk-go" style={{ left: `${goAt}%` }}><span>Go-live</span></span>
        </div>
      </div>
    </div>
  );
}
