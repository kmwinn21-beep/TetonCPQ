/**
 * Gantt of the implementation plan for pilot communities: one group per
 * go-live date, one row per stage, go-live marked with a diamond. Plain HTML
 * positioned in percentages, so it renders on the server and prints cleanly.
 * Stages are ordered, so they share one green family that deepens toward
 * go-live (Evaluation & Contracting, before kick-off, is neutral); every bar
 * also carries its stage name and dates, so color is never the only cue.
 */
import type { PilotGroup, ScheduledStage, StageKey } from '@/lib/quote/implementationPlan';
import { PilotFlag } from './PilotFlag';

export const STAGE_COLORS: Record<StageKey, string> = {
  evaluation: '#C2D0D3',
  queue: '#9FB4B9',
  kickoff: '#A9DEC0',
  implementation: '#7FCDA1',
  baseline: '#4FAF7E',
  golive: '#2E8A5C',
};
/** Custom stages: a blue family, so they read as added to the standard (green) path. */
const CUSTOM_COLORS = ['#9CC3EE', '#6FA6E3', '#4F8AD6', '#B7CDEB'];

/** Color for a stage: its standard color, or a custom-stage blue by its place among the custom stages. */
export function stageColor(id: string, order: string[]): string {
  if (id in STAGE_COLORS) return STAGE_COLORS[id as StageKey];
  const k = order.filter((x) => !(x in STAGE_COLORS)).indexOf(id);
  return CUSTOM_COLORS[Math.max(k, 0) % CUSTOM_COLORS.length];
}

const DAY = 86_400_000;
const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const short = (iso: string) => new Date(t(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const longDate = (iso: string) => new Date(t(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function ImplementationGantt({ groups, today, labelWidth = 220 }: { groups: PilotGroup[]; /** ISO date: draws a Today line and flags late starts. */ today?: string; labelWidth?: number }) {
  if (!groups.length) return null;
  const bars = groups.flatMap((g) => g.schedule.stages.filter((s) => s.weeks > 0));
  const min = Math.min(...bars.map((s) => t(s.start)), ...(today ? [t(today)] : [])) - 7 * DAY;
  // Room on the right for the last date label.
  const max = Math.max(...bars.map((s) => t(s.end))) + 30 * DAY;
  const pct = (ms: number) => ((ms - min) / (max - min)) * 100;

  const months: Array<{ at: number; label: string; year: boolean }> = [];
  const first = new Date(min);
  for (let m = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)); m.getTime() < max; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const jan = m.getUTCMonth() === 0;
    if (pct(m.getTime()) > 95) break; // no room for a label at the right edge
    months.push({ at: pct(m.getTime()), label: m.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) + (jan ? ` ${m.getUTCFullYear()}` : ''), year: jan });
  }
  const grid = { gridTemplateColumns: `${labelWidth}px minmax(0,1fr)` };
  const legendStages: ScheduledStage[] = groups[0].schedule.stages.filter((s) => s.weeks > 0);
  const order = groups[0].schedule.stages.map((s) => s.id);
  const hasGoLiveStage = order.includes('golive');
  const todayPct = today ? pct(t(today)) : null;

  return (
    <figure className="m-gantt m-0">
      <div className="relative" role="img" aria-label={`Implementation timeline for ${groups.reduce((n, g) => n + g.names.length, 0)} pilot communities, ${groups.length} go-live ${groups.length === 1 ? 'date' : 'dates'}.`}>
        {/* Month grid (and today line) behind the bars */}
        <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ left: labelWidth }} aria-hidden="true">
          {months.map((m) => (
            <div key={m.at} className="absolute top-7 bottom-0 border-l border-teton-off-white" style={{ left: `${m.at}%` }} />
          ))}
          {todayPct != null && (
            <div className="absolute top-5 bottom-0 border-l-[1.5px] border-dashed" style={{ left: `${todayPct}%`, borderColor: '#D9472B' }}>
              <span className="absolute -top-0.5 left-1 text-[10.5px] font-semibold whitespace-nowrap" style={{ color: '#B23A22' }}>
                Today · {short(today!)}
              </span>
            </div>
          )}
        </div>

        <div className="grid items-end h-7" style={grid}>
          <div />
          <div className="relative h-full">
            {months.map((m) => (
              <span key={m.at} className={`absolute top-0 pl-1 text-[11px] whitespace-nowrap ${m.year ? 'font-semibold text-teton-ink' : 'text-teton-ui-gray'}`} style={{ left: `${m.at}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>

        {groups.map((g) => {
          const late = today && g.schedule.contractStart < today;
          return (
            <div key={g.goLive} className="relative mt-2 pt-2 border-t border-teton-off-white avoid-break">
              <div className="grid items-center" style={grid}>
                <div className="pr-3 min-w-0">
                  <p className="text-[12.5px] font-semibold flex items-center gap-1.5">
                    {g.names.length > 1 ? `${g.names.length} communities` : g.names[0]}
                    <PilotFlag />
                  </p>
                  {g.names.length > 1 && <p className="text-[11px] text-teton-ui-gray leading-snug">{g.names.join(' · ')}</p>}
                </div>
                <p className="text-[11.5px] text-teton-dark-gray">
                  Go-live <span className="font-semibold text-teton-ink">{longDate(g.goLive)}</span>
                  {late && <span className="ml-2 badge-yellow relative z-10">Contracting was due {longDate(g.schedule.contractStart)}</span>}
                </p>
              </div>
              {g.schedule.stages.map((s, si) => {
                if (s.weeks <= 0) return null;
                const left = pct(t(s.start));
                const width = pct(t(s.end) + DAY) - left;
                const labelLeft = left + width > 82; // near the right edge: label goes before the bar
                return (
                  <div key={s.id} className="grid items-center h-[25px]" style={grid}>
                    <div className="pl-3 pr-3 text-[12px] truncate">{s.name}</div>
                    <div className="relative h-full">
                      <div className="absolute top-[6px] h-[13px] rounded-[4px]" style={{ left: `${left}%`, width: `${width}%`, background: stageColor(s.id, order) }}>
                        <span
                          className={`absolute -top-[1px] text-[10.5px] text-teton-dark-gray whitespace-nowrap ${
                            labelLeft ? (s.id === 'golive' ? 'right-[calc(100%+14px)]' : 'right-[calc(100%+6px)]') : 'left-[calc(100%+6px)]'
                          }`}
                        >
                          {short(s.start)} – {short(s.end)}
                        </span>
                      </div>
                      {/* Go-live: start of Training & Go live, or the day after the last stage if that stage was removed. */}
                      {(s.id === 'golive' || (!hasGoLiveStage && si === g.schedule.stages.length - 1)) && (
                        <div className="absolute top-[6px] w-[13px] h-[13px] rounded-[2px] bg-teton-ink" style={{ left: `${pct(t(g.goLive))}%`, transform: 'translateX(-50%) rotate(45deg)' }} title={`Go-live ${longDate(g.goLive)}`} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-teton-dark-gray">
        {legendStages.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: stageColor(s.id, order) }} />
            {s.name}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-[1px] bg-teton-ink rotate-45" />
          Go-live
        </span>
        {today && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 border-l-[1.5px] border-dashed" style={{ borderColor: '#D9472B' }} />
            Today
          </span>
        )}
      </figcaption>
    </figure>
  );
}
