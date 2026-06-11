/* Carte de section "fieldset" des pages Paramètres. */
export function SettingsCard({
  legend,
  sub,
  children,
}: {
  legend: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface px-[26px] py-[22px]">
      <div>
        <h2 className="text-[15px] font-semibold">{legend}</h2>
        {sub && <p className="mt-0.5 text-[13px] text-ink-2">{sub}</p>}
      </div>
      {children}
    </section>
  );
}
