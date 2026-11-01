/* Test entry only. Production never imports this dropdown harness. */
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Select } from '../web/src/components/select';
import '../web/src/design-system/styles.css';

const choices = [
  { value: 'alpha', label: 'Alpha league' },
  { value: 'beta', label: 'Beta unavailable', disabled: true },
  { value: 'gamma', label: 'Gamma league' },
  {
    value: 'delta',
    label: 'Delta league with a longer name that should wrap safely on small screens',
  },
];
const dialogChoices = [
  ...choices,
  ...Array.from({ length: 30 }, (_, index) => ({
    value: `extra-${index}`,
    label: `Extra league ${index + 1}`,
  })),
];
let mutate: (action: string) => void = () => {};
export function updateSelectFixture(action: string) {
  mutate(action);
}

function Fixture() {
  const [value, setValue] = useState('alpha');
  const [dialogValue, setDialogValue] = useState('alpha');
  const [options, setOptions] = useState(choices);
  const [changes, setChanges] = useState(0);
  const [submitted, setSubmitted] = useState('');
  const [visible, setVisible] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    mutate = (action) => {
      if (action === 'replace') setOptions(choices.slice(2));
      if (action === 'empty') setOptions([]);
      if (action === 'restore') setOptions(choices);
      if (action === 'hide') setVisible(false);
      if (action === 'show') setVisible(true);
    };
    return () => {
      mutate = () => {};
    };
  }, []);
  const change = (next: string) => {
    setValue(next);
    setChanges((old) => old + 1);
  };
  return (
    <>
      <main className="select-fixture">
        <h1>Shared dropdown check</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(String(new FormData(event.currentTarget).get('league')));
          }}
        >
          <input aria-label="Outside field" />
          {visible && (
            <Select
              aria-label="Test league"
              name="league"
              value={value}
              onChange={change}
              options={options}
            />
          )}
          <button type="submit">Submit fixture</button>
        </form>
        <output aria-label="Selected value">{value}</output>
        <output aria-label="Change count">{changes}</output>
        <output aria-label="Submitted value">{submitted || 'none'}</output>
        <Select
          aria-label="Unavailable league"
          disabled
          value="alpha"
          onChange={change}
          options={choices}
        />
        <Select aria-label="Empty league" value="" onChange={change} options={[]} />
        <button onClick={() => dialog.current?.showModal()}>Open fixture dialog</button>
      </main>
      <div className="select-corner">
        <Select aria-label="Corner league" value={value} onChange={change} options={choices} />
      </div>
      <dialog ref={dialog} aria-label="Fixture dialog">
        <h2>Choose inside a dialog</h2>
        <div aria-hidden="true" style={{ height: 480 }} />
        <Select
          aria-label="Dialog league"
          value={dialogValue}
          onChange={setDialogValue}
          options={dialogChoices}
        />
        <output aria-label="Dialog value">{dialogValue}</output>
        <div aria-hidden="true" style={{ height: 240 }} />
        <button onClick={() => dialog.current?.close()}>Close fixture dialog</button>
      </dialog>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
