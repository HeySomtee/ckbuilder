import './notice.css';

export function BusyState({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="ui-busy" role="status" aria-live="polite">
      <span className="ui-busy-orbit" aria-hidden="true">
        <i />
        <i />
      </span>
      <div>
        <strong>{label}</strong>
        {detail && <p>{detail}</p>}
        <span className="ui-busy-line" aria-hidden="true" />
      </div>
    </div>
  );
}
