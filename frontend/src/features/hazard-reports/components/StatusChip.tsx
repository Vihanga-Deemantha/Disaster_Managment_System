export function StatusChip({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`inline-flex rounded-lg px-3 py-1 text-[13px] font-bold ${tone}`}>
      {label}
    </span>
  );
}
