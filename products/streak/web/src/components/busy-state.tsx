import { CellLoader } from './cell-loader';
import './notice.css';

export function BusyState({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="ui-busy" role="status" aria-live="polite">
      <CellLoader variant="wave" />
      <div>
        <strong>{label}</strong>
        {detail && <p>{detail}</p>}
      </div>
    </div>
  );
}
