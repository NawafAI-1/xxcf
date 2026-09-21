export interface MeterSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * A single bar split into parts, with a 2px gap of surface between them: the
 * gap is what separates the segments, not a stroke around each one. Values
 * ride beside the bar rather than inside it, so a thin segment still has a
 * readable number.
 */
export default function Meter({
  segments,
  height = 'h-2.5',
}: {
  segments: MeterSegment[];
  height?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div>
      <div className={`flex w-full gap-[2px] overflow-hidden rounded-full ${height}`}>
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <div
              key={segment.label}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
              title={`${segment.label}: ${segment.value}`}
            />
          ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments
          .filter((segment) => segment.value > 0)
          .map((segment) => (
            <li key={segment.label} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: segment.color }}
                aria-hidden
              />
              <span>{segment.label}</span>
              <span className="font-semibold tabular-nums text-slate-900">{segment.value}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
