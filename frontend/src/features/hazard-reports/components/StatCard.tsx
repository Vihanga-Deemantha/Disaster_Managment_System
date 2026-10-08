export function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-paper bg-white p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
