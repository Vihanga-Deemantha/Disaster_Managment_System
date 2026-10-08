export function StatusChip({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  );
}
