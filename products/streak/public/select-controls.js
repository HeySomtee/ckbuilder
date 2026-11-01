// The original select retains form values and existing change handlers. All user
// interaction stays in-page, including wallet browsers without native pickers.
let sequence = 0;
let current = null;
const chevron =
  '<svg class="streak-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const check =
  '<svg class="streak-select-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4 10-10"/></svg>';
const visible = (option) => !option.hidden && !option.closest('optgroup[hidden]');
const enabled = (option) => !option.disabled && !option.closest('optgroup[disabled]');

function enhanceSelect(select, controls) {
  const id = `streak-legacy-select-${++sequence}`;
  const original = {
    hidden: select.hidden,
    tabindex: select.getAttribute('tabindex'),
    aria: select.getAttribute('aria-hidden'),
  };
  const wrapper = document.createElement('span');
  wrapper.className = 'streak-select';
  if (select.style.width) wrapper.style.width = select.style.width;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'streak-select-trigger';
  trigger.id = `${id}-trigger`;
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${id}-list`);
  const value = document.createElement('span');
  value.className = 'streak-select-value';
  trigger.append(value);
  trigger.insertAdjacentHTML('beforeend', chevron);
  const menu = document.createElement('div');
  menu.id = `${id}-list`;
  menu.className = 'streak-select-menu';
  menu.setAttribute('role', 'listbox');
  select.before(wrapper);
  wrapper.append(select, trigger);
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  let open = false;
  let active = -1;
  let choices = [];
  let typed = '';
  let typedAt = 0;
  let resize;
  const form = select.form;
  const labels = [...select.labels];
  const labelText = labels.map((label) => label.textContent.trim()).join(' ');
  const rows = () => [...menu.querySelectorAll('[role="option"]')];
  const allowed = () =>
    choices.map((option, index) => (enabled(option) ? index : -1)).filter((index) => index >= 0);
  const setActive = (index, scroll = true) => {
    active = index;
    rows().forEach((row, i) => {
      row.dataset.active = String(i === active);
    });
    const row = rows()[active];
    if (!row) trigger.removeAttribute('aria-activedescendant');
    else {
      trigger.setAttribute('aria-activedescendant', row.id);
      if (scroll) {
        const bounds = menu.getBoundingClientRect();
        const option = row.getBoundingClientRect();
        if (option.top < bounds.top) menu.scrollTop -= bounds.top - option.top;
        else if (option.bottom > bounds.bottom) menu.scrollTop += option.bottom - bounds.bottom;
      }
    }
  };
  function close(focus = false) {
    if (!open) return;
    open = false;
    typed = '';
    typedAt = 0;
    menu.remove();
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('focusin', outside);
    document.removeEventListener('scroll', scroll, true);
    window.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('scroll', position);
    resize?.disconnect();
    if (current?.trigger === trigger) current = null;
    if (focus && trigger.isConnected) trigger.focus({ preventScroll: true });
  }
  function outside(event) {
    if (!wrapper.contains(event.target) && !menu.contains(event.target)) close();
  }
  function scroll(event) {
    if (!menu.contains(event.target)) position();
  }
  function position() {
    if (!open || !trigger.isConnected || select.matches(':disabled')) return close();
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
    const topEdge = (viewport?.offsetTop ?? 0) + 8;
    const rightEdge = leftEdge + (viewport?.width ?? innerWidth) - 16;
    const bottomEdge = topEdge + (viewport?.height ?? innerHeight) - 16;
    const bounds = trigger.getBoundingClientRect();
    if (bounds.bottom < topEdge || bounds.top > bottomEdge) return close();
    const width = Math.min(Math.max(bounds.width, 200), rightEdge - leftEdge);
    const below = bottomEdge - bounds.bottom - 6;
    const above = bounds.top - topEdge - 6;
    const down = below >= Math.min(220, above);
    const maxHeight = Math.max(44, Math.min(320, down ? below : above));
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(leftEdge, Math.min(bounds.left, rightEdge - width))}px`;
    menu.style.maxHeight = `${maxHeight}px`;
    const height = Math.min(menu.scrollHeight, maxHeight);
    const top = down ? bounds.bottom + 6 : bounds.top - height - 6;
    menu.style.top = `${Math.max(topEdge, Math.min(top, bottomEdge - height))}px`;
  }
  function sync() {
    const previous = choices[active]?.value;
    choices = [...select.options].filter(visible);
    trigger.disabled = select.matches(':disabled') || !choices.some(enabled);
    value.textContent = select.selectedOptions[0]?.label || 'Choose an option';
    for (const attribute of [
      'aria-label',
      'aria-labelledby',
      'aria-describedby',
      'aria-required',
      'aria-invalid',
    ]) {
      const next = select.getAttribute(attribute);
      if (next !== null) trigger.setAttribute(attribute, next);
      else trigger.removeAttribute(attribute);
    }
    if (!trigger.hasAttribute('aria-label') && !trigger.hasAttribute('aria-labelledby'))
      trigger.setAttribute('aria-label', labelText || 'Choose an option');
    if (select.required) trigger.setAttribute('aria-required', 'true');
    menu.setAttribute('aria-label', trigger.getAttribute('aria-label') || value.textContent);
    if (trigger.disabled || select.closest('[inert]')) return close();
    if (!open) return;
    menu.replaceChildren(
      ...choices.map((option, index) => {
        const row = document.createElement('div');
        row.className = 'streak-select-option';
        row.id = `${id}-option-${index}`;
        row.dataset.index = String(index);
        row.dataset.value = option.value;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(option.selected));
        row.setAttribute('aria-disabled', String(!enabled(option)));
        const label = document.createElement('span');
        label.className = 'streak-select-option-label';
        label.textContent = option.label;
        row.append(label);
        row.insertAdjacentHTML('beforeend', check);
        return row;
      }),
    );
    const priorIndex = choices.findIndex((option) => option.value === previous && enabled(option));
    const selected = choices.findIndex((option) => option.selected && enabled(option));
    setActive(priorIndex >= 0 ? priorIndex : selected >= 0 ? selected : allowed()[0], false);
    position();
  }
  function show() {
    sync();
    if (trigger.disabled || select.closest('[inert]') || open) return;
    current?.close();
    trigger.focus({ preventScroll: true });
    open = true;
    current = { close, trigger };
    active = -1;
    const host = trigger.closest('dialog[open], [role="dialog"]') || document.body;
    host.append(menu);
    trigger.setAttribute('aria-expanded', 'true');
    sync();
    if (!open) return;
    setActive(active);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', position);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    if (typeof ResizeObserver !== 'undefined') {
      resize = new ResizeObserver(position);
      resize.observe(trigger);
    }
  }
  function choose(index) {
    const option = choices[index];
    if (!option || !option.isConnected || !enabled(option) || select.matches(':disabled')) return;
    const changed = select.value !== option.value;
    const sourceId = select.id;
    const locationBefore = location.href;
    select.value = option.value;
    close(true);
    sync();
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      // Some legacy filters redraw their view synchronously on change.
      if (!trigger.isConnected && sourceId)
        requestAnimationFrame(() => {
          if (location.href === locationBefore)
            controls.get(document.getElementById(sourceId))?.trigger.focus({ preventScroll: true });
        });
    }
  }
  trigger.addEventListener('click', () => (open ? close() : show()));
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') return close();
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      return close(true);
    }
    if (event.key === 'ArrowUp' && event.altKey && open) {
      event.preventDefault();
      return close(true);
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const wasOpen = open;
      if (!open) show();
      if (!open) return;
      const indices = allowed();
      if (event.key === 'Home') setActive(indices[0]);
      else if (event.key === 'End') setActive(indices.at(-1));
      else if (event.key === 'Enter' || event.key === ' ') {
        if (wasOpen) choose(active);
      } else if (wasOpen) {
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        setActive(indices[(indices.indexOf(active) + direction + indices.length) % indices.length]);
      }
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      show();
      const now = Date.now();
      typed = now - typedAt > 800 ? event.key : typed + event.key;
      typedAt = now;
      const prefix = /^(.)\1*$/.test(typed) ? typed[0] : typed;
      const indices = allowed();
      const rotated = [...indices.filter((i) => i > active), ...indices.filter((i) => i <= active)];
      const found = rotated.find((i) =>
        choices[i].label.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase()),
      );
      if (found !== undefined) setActive(found);
    }
  });
  trigger.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') event.preventDefault();
  });
  menu.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') event.preventDefault();
  });
  // A touch tap can emit a compatibility mousedown before click. Keep focus on
  // the combobox while leaving pointer/touch scrolling available in the menu.
  menu.addEventListener('mousedown', (event) => event.preventDefault());
  menu.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const row = event.target.closest('[role="option"]');
    if (row && row.getAttribute('aria-disabled') !== 'true')
      setActive(Number(row.dataset.index), false);
  });
  menu.addEventListener('click', (event) => {
    const row = event.target.closest('[role="option"]');
    if (row && row.dataset.value === choices[Number(row.dataset.index)]?.value)
      choose(Number(row.dataset.index));
  });
  const invalid = (event) => {
    event.preventDefault();
    trigger.focus();
  };
  const focusLabel = (event) => {
    if (event.target.closest('button, a, input, textarea')) return;
    event.preventDefault();
    trigger.focus({ preventScroll: true });
  };
  labels.forEach((label) => label.addEventListener('click', focusLabel));
  select.addEventListener('change', sync);
  select.addEventListener('invalid', invalid);
  const reset = () => queueMicrotask(sync);
  form?.addEventListener('reset', reset);
  const sourceObserver = new MutationObserver(sync);
  sourceObserver.observe(select, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'disabled',
      'hidden',
      'selected',
      'label',
      'value',
      'aria-label',
      'aria-labelledby',
      'aria-describedby',
      'aria-required',
      'aria-invalid',
      'required',
    ],
  });
  sync();
  return {
    trigger,
    sync,
    destroy() {
      close();
      sourceObserver.disconnect();
      select.removeEventListener('change', sync);
      select.removeEventListener('invalid', invalid);
      form?.removeEventListener('reset', reset);
      labels.forEach((label) => label.removeEventListener('click', focusLabel));
      if (wrapper.parentNode && wrapper.contains(select)) wrapper.before(select);
      wrapper.remove();
      select.hidden = original.hidden;
      for (const [attribute, prior] of [
        ['tabindex', original.tabindex],
        ['aria-hidden', original.aria],
      ]) {
        if (prior === null) select.removeAttribute(attribute);
        else select.setAttribute(attribute, prior);
      }
    },
  };
}

export function observeSelectControls(root) {
  const controls = new Map();
  const selector = 'select[data-streak-select]:not([multiple]):not([size])';
  const discover = (node) => {
    if (!(node instanceof Element) || !root.contains(node)) return;
    const selects = node.matches(selector) ? [node] : node.querySelectorAll(selector);
    for (const select of selects)
      if (!controls.has(select)) controls.set(select, enhanceSelect(select, controls));
  };
  discover(root);
  const observer = new MutationObserver((records) => {
    for (const [select, control] of controls)
      if (!root.contains(select)) {
        control.destroy();
        controls.delete(select);
      }
    for (const record of records) {
      if (record.type === 'attributes') {
        for (const [select, control] of controls)
          if (record.target.contains(select)) control.sync();
      } else for (const node of record.addedNodes) discover(node);
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['disabled', 'inert'],
  });
  return () => {
    observer.disconnect();
    for (const control of controls.values()) control.destroy();
    controls.clear();
  };
}
