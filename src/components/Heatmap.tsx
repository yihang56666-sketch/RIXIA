import { lastNDates, weekdayLabel } from "../lib/time";

/**
 * GitHub 风格的打卡热力图：以周为列、周一在上的日历网格。
 * 颜色深浅表示当天是否打卡（未来日期显示为空槽）。
 */
export function Heatmap({
  checkedDates,
  weeks = 15,
  today,
  color = "var(--accent)",
}: {
  checkedDates: string[];
  weeks?: number;
  today: string;
  color?: string;
}) {
  const checked = new Set(checkedDates);
  const days = lastNDates(weeks * 7, today);
  // 让第一列从周一开始对齐
  const firstDay = new Date(`${days[0]}T00:00:00`);
  const lead = (firstDay.getDay() + 6) % 7;
  const cells: Array<{ date: string | null }> = [
    ...Array.from({ length: lead }, () => ({ date: null })),
    ...days.map((date) => ({ date })),
  ];

  return (
    <div className="heatmap" role="img" aria-label="最近打卡热力图">
      {cells.map((cell, index) => {
        if (!cell.date) return <span key={`pad-${index}`} className="heatmap-cell pad" />;
        const isOn = checked.has(cell.date);
        const isFuture = cell.date > today;
        const isToday = cell.date === today;
        return (
          <span
            key={cell.date}
            className={[
              "heatmap-cell",
              isOn ? "on" : "",
              isFuture ? "future" : "",
              isToday ? "today" : "",
            ].join(" ")}
            style={isOn ? { backgroundColor: color } : undefined}
            title={`${cell.date} ${weekdayLabel(new Date(`${cell.date}T00:00:00`))}${isOn ? " · 已打卡" : ""}`}
          />
        );
      })}
    </div>
  );
}
