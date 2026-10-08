import { useAnalyticsText } from './i18n';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Dataset, ImpactMetrics } from './types';
const COLORS = ['#009e78', '#8c4820', '#3d609a', '#b7953b', '#8d5da7'];
interface Props {
  metrics: ImpactMetrics;
  onDrill(dataset: Dataset, day?: string): void;
}
/** HCI-05c / HCI-10: separate reach %, people and unit-specific distribution charts. */
export function Charts({ metrics, onDrill }: Props) {
  const tr = useAnalyticsText();
  return (
    <div className="uc4-chart-grid">
      <AlertChart metrics={metrics} onDrill={onDrill} />
      <ShelterChart metrics={metrics} onDrill={onDrill} />
      <section className="uc4-card uc4-wide">
        <div className="uc4-section-heading">
          <h2>{tr('Relief distribution by district & organisation')}</h2>
          <button className="uc4-link" onClick={() => onDrill('distribution')}>
            {tr('View dispatch log →')}
          </button>
        </div>
        {metrics.distributionByDistrict.length ? (
          [...new Set(metrics.distributionByDistrict.map((row) => row.unit))].map((unit) => (
            <DistributionChart
              key={unit}
              metrics={metrics}
              unit={unit}
              onDrill={() => onDrill('distribution')}
            />
          ))
        ) : (
          <p className="uc4-chart-empty">{tr('No relief dispatches in your scope.')}</p>
        )}
      </section>
    </div>
  );
}
function DistributionChart({
  metrics,
  unit,
  onDrill,
}: {
  metrics: ImpactMetrics;
  unit: string;
  onDrill(): void;
}) {
  const tr = useAnalyticsText();
  const facts = metrics.distributionByDistrict.filter((row) => row.unit === unit);
  const orgs = [
    ...new Map(facts.map((row) => [row.organizationId, row.organizationName])).entries(),
  ];
  const data = [...new Set(facts.map((row) => row.district))].map((district) =>
    Object.fromEntries([
      ['district', tr(district)],
      ...orgs.map(([id], index) => [
        `org${index}`,
        facts
          .filter((row) => row.district === district && row.organizationId === id)
          .reduce((sum, row) => sum + row.quantity, 0),
      ]),
    ]),
  );
  return (
    <div>
      <h3 className="uc4-chart-unit">
        {tr('Quantity')} ({unit})
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} onClick={onDrill}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="district" tick={{ fontSize: 11 }} />
          <YAxis />
          <Tooltip />
          <Legend />
          {orgs.map(([, name], index) => (
            <Bar
              isAnimationActive={false}
              key={name}
              dataKey={`org${index}`}
              name={name}
              stackId="relief"
              fill={COLORS[index % COLORS.length]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function AlertChart({ metrics, onDrill }: Props) {
  const tr = useAnalyticsText();
  return (
    <section className="uc4-card">
      <div className="uc4-section-heading">
        <h2>{tr('Alert delivery timeline vs reach')}</h2>
        <span className="uc4-tag">{tr('Reach %')}</span>
      </div>
      {metrics.alertTimeline.length ? (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={metrics.alertTimeline}
              onClick={(state) => {
                if (state?.activeLabel) onDrill('alerts', String(state.activeLabel));
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} unit="%" />
              <Tooltip />
              <Line
                isAnimationActive={false}
                dataKey="reachPct"
                name={tr('Citizens reached (%)')}
                stroke="#009e78"
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
          <details>
            <summary>{tr('View daily reach and event logs')}</summary>
            {metrics.alertTimeline.map((row) => (
              <button
                key={row.date}
                className="uc4-log-link"
                onClick={() => onDrill('alerts', row.date)}
              >
                {row.date}: {row.reachPct}% · {row.alerts} {tr('alerts')}
              </button>
            ))}
          </details>
        </>
      ) : (
        <p className="uc4-chart-empty">{tr('No alert records for these filters.')}</p>
      )}
    </section>
  );
}
function ShelterChart({ metrics, onDrill }: Props) {
  const tr = useAnalyticsText();
  return (
    <section className="uc4-card">
      <div className="uc4-section-heading">
        <h2>{tr('Shelter occupancy vs capacity')}</h2>
        <span className="uc4-tag">{tr('People')}</span>
      </div>
      {metrics.occupancySeries.length ? (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={metrics.occupancySeries}
              onClick={(state) => {
                if (state?.activeLabel) onDrill('occupancy', String(state.activeLabel));
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area
                isAnimationActive={false}
                dataKey="capacity"
                name={tr('Capacity (people)')}
                stroke="#3d609a"
                fill="#d5dce6"
              />
              <Area
                isAnimationActive={false}
                dataKey="occupancy"
                name={tr('Occupancy (people)')}
                stroke="#8c4820"
                fill="#f3e6d8"
              />
            </AreaChart>
          </ResponsiveContainer>
          <details>
            <summary>{tr('View daily occupancy and event logs')}</summary>
            {metrics.occupancySeries.map((row) => (
              <button
                className="uc4-log-link"
                key={row.date}
                onClick={() => onDrill('occupancy', row.date)}
              >
                {row.date}: {row.occupancy} / {row.capacity} {tr('people')}
              </button>
            ))}
          </details>
        </>
      ) : (
        <p className="uc4-chart-empty">{tr('No shelter observations for these filters.')}</p>
      )}
    </section>
  );
}
