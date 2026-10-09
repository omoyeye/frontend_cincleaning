import React from 'react';
import type { DurationBreakdown } from '../src/utils/bookingHelpers';
import { formatBookedHoursLabel } from '../src/utils/bookingHelpers';

interface Props {
  breakdown: DurationBreakdown;
  className?: string;
  title?: string;
}

export const DurationBreakdownBlock: React.FC<Props> = ({
  breakdown,
  className = '',
  title = 'Booked duration',
}) => {
  const hasLines = breakdown.lines.length > 0;

  return (
    <div className={`rounded-2xl border border-slate-200 bg-slate-50/90 p-4 md:p-5 ${className}`}>
      <h4 className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-slate-500 mb-3">{title}</h4>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-slate-200/80">
          {!hasLines ? (
            <tr>
              <td className="py-2 pr-2 font-bold text-slate-700">
                {breakdown.model === 'itemized' ? breakdown.baseLabel : 'Booked clean duration'}
              </td>
              <td className="py-2 text-right font-black text-blue-600 tabular-nums">
                {formatBookedHoursLabel(breakdown.totalHours)}h
              </td>
            </tr>
          ) : (
            <>
              <tr>
                <td className="py-2 pr-2 font-bold text-slate-700">{breakdown.baseLabel}</td>
                <td className="py-2 text-right font-black text-slate-900 tabular-nums">
                  {formatBookedHoursLabel(breakdown.baseHours)}h
                </td>
              </tr>
              {breakdown.lines.map((line, i) => (
                <tr key={`${line.label}-${i}`}>
                  <td className="py-2 pr-2 text-slate-600">
                    <span className="font-bold text-slate-800">{line.label}</span>
                    <span className="text-slate-400 font-medium">
                      {' '}
                      ×{line.quantity}
                      {line.quantity > 1 && line.hoursPerUnit > 0 ? (
                        <span className="text-xs">
                          {' '}
                          @ {formatBookedHoursLabel(line.hoursPerUnit)}h ea.
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="py-2 text-right font-black text-slate-800 tabular-nums">
                    {formatBookedHoursLabel(line.lineHours)}h
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300">
                <td className="py-2.5 pr-2 font-black uppercase text-xs tracking-wide text-slate-600">
                  Total booked
                </td>
                <td className="py-2.5 text-right font-black text-base text-blue-600 tabular-nums">
                  {formatBookedHoursLabel(breakdown.totalHours)}h
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};
