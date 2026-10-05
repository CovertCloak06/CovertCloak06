/**
 * Popup UI. Plain DOM (no framework) to keep the extension small; all state
 * lives in the background worker, which pings the popup to re-render.
 */
import {
  COUNTRIES,
  countryFlag,
  servicesForCountry,
  type CommonTitle,
  type RoomState,
} from '@watch-party/shared/client';
import type { CatalogPage, PopupRequest, PopupResponse, PopupStatus, Profile } from './messages';

const app = document.getElementById('app')!;
let status: PopupStatus | null = null;
let tabId: number | null = null;
let busy = false;
let flash: string | null = null;
let catalog: { titles: CommonTitle[]; page: number; total: number; query: string } | null = null;

async function send<T>(req: PopupRequest): Promise<T> {
  const res = await chrome.runtime.sendMessage<PopupRequest, PopupResponse<T>>(req);
  if (!res.ok) throw new Error(res.error);
  return res.data;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: Array<Node | string | null>
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c !== null) node.append(c);
  return node;
}

async function act(fn: () => Promise<unknown>) {
  busy = true;
  flash = null;
  render();
  try {
    await fn();
  } catch (err) {
    flash = err instanceof Error ? err.message : String(err);
  } finally {
    busy = false;
    await refresh();
  }
}

async function refresh() {
  status = await send<PopupStatus>({ type: 'status', tabId });
  render();
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function profileView(existing: Profile | null): HTMLElement {
  let country = existing?.country ?? 'US';
  const selected = new Set<string>(existing?.services ?? []);
  const name = el('input', {
    type: 'text',
    value: existing?.displayName ?? '',
    placeholder: 'Your name',
    maxLength: 40,
  });
  const select = el('select');
  for (const c of COUNTRIES)
    select.append(
      el('option', {
        value: c.code,
        textContent: `${countryFlag(c.code)} ${c.name}`,
        selected: c.code === country,
      }),
    );
  const chips = el('div', { className: 'chips' });
  const drawChips = () => {
    chips.replaceChildren(
      ...servicesForCountry(country).map((s) => {
        const box = el('input', { type: 'checkbox', checked: selected.has(s.id) });
        box.addEventListener('change', () =>
          box.checked ? selected.add(s.id) : selected.delete(s.id),
        );
        return el('label', {}, box, s.name);
      }),
    );
  };
  select.addEventListener('change', () => {
    country = select.value;
    const sold = new Set(servicesForCountry(country).map((s) => s.id));
    for (const id of [...selected]) if (!sold.has(id)) selected.delete(id);
    drawChips();
  });
  drawChips();
  const save = el('button', { textContent: 'Save' });
  save.addEventListener('click', () => {
    const profile = { displayName: name.value.trim(), country, services: [...selected] };
    if (!profile.displayName || profile.services.length === 0) {
      flash = 'Add your name and at least one subscription';
      render();
      return;
    }
    void act(async () => {
      await send({ type: 'saveProfile', profile });
      editingProfile = false;
    });
  });
  return el(
    'section',
    { className: 'card' },
    el('h2', { textContent: 'Your streaming setup' }),
    name,
    el('div', {
      className: 'small muted',
      textContent: 'Country your streaming accounts are registered in:',
    }),
    select,
    el('div', { className: 'small muted', textContent: 'Subscriptions (rentals never count):' }),
    chips,
    save,
  );
}

function memberList(state: RoomState, selfId: string, isHost: boolean): HTMLElement {
  return el(
    'ul',
    { className: 'members' },
    ...state.members.map((m) => {
      const cls = !m.connected
        ? ''
        : m.status === 'playing' || m.status === 'ready'
          ? 'ok'
          : m.status === 'buffering' || m.status === 'loading' || m.status === 'blocked'
            ? 'warn'
            : 'ok';
      const li = el(
        'li',
        {},
        el('span', { className: `dot ${cls}` }),
        el('span', {
          className: 'grow',
          textContent: `${countryFlag(m.countryCode)} ${m.displayName}${m.userId === selfId ? ' (you)' : ''}${m.userId === state.hostId ? ' ★' : ''}`,
        }),
        el('span', { className: 'small muted', textContent: m.connected ? m.status : 'offline' }),
      );
      if (isHost && m.userId !== selfId) {
        const b = el('button', { className: 'link small', textContent: 'make host' });
        b.addEventListener(
          'click',
          () => void act(() => send({ type: 'transferHost', tabId: tabId!, userId: m.userId })),
        );
        li.append(b);
      }
      return li;
    }),
  );
}

function catalogView(state: RoomState, isHost: boolean): HTMLElement {
  const wrap = el(
    'section',
    { className: 'card' },
    el('h2', { textContent: 'Films everyone can stream' }),
  );
  const search = el('input', { type: 'text', placeholder: 'Search', value: catalog?.query ?? '' });
  let t: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => void loadCatalog(1, search.value.trim()), 350);
  });
  wrap.append(search);
  const list = el('div', { className: 'titles' });
  for (const title of catalog?.titles ?? []) {
    const who = state.members
      .map(
        (m) =>
          `${m.displayName}: ${(title.watchOptions[m.userId] ?? []).map((o) => o.serviceName).join('/') || '—'}`,
      )
      .join(' · ');
    const row = el(
      'div',
      { className: 'title' },
      title.posterUrl
        ? el('img', { src: title.posterUrl, alt: '' })
        : el('div', { className: 'ph' }),
      el(
        'div',
        { className: 'grow' },
        el('div', {
          textContent: `${title.title}${title.releaseYear ? ` (${title.releaseYear})` : ''}`,
        }),
        el('div', { className: 'small muted', textContent: who }),
      ),
    );
    if (isHost) {
      const pick = el('button', {
        className: 'secondary small',
        textContent: 'Watch',
        disabled: busy,
      });
      pick.addEventListener(
        'click',
        () => void act(() => send({ type: 'selectTitle', tabId: tabId!, tmdbId: title.tmdbId })),
      );
      row.append(pick);
    }
    list.append(row);
  }
  if (catalog && catalog.titles.length === 0)
    list.append(
      el('div', {
        className: 'muted small',
        textContent:
          state.members.length < 2
            ? 'Invite a friend to see shared titles.'
            : 'Nothing in common yet.',
      }),
    );
  wrap.append(list);
  if (catalog && catalog.titles.length < catalog.total) {
    const more = el('button', { className: 'secondary', textContent: 'Load more' });
    more.addEventListener('click', () => void loadCatalog(catalog!.page + 1, catalog!.query));
    wrap.append(more);
  }
  if (!isHost)
    wrap.append(
      el('div', {
        className: 'small muted',
        textContent: 'The host picks; your tab opens your own service automatically.',
      }),
    );
  return wrap;
}

async function loadCatalog(page: number, query: string) {
  if (tabId === null) return;
  try {
    const res = await send<CatalogPage>({ type: 'catalog', tabId, page, query });
    catalog = {
      titles: page === 1 ? res.results : [...(catalog?.titles ?? []), ...res.results],
      page,
      total: res.totalResults,
      query,
    };
  } catch (err) {
    flash = err instanceof Error ? err.message : String(err);
  }
  render();
}

function roomView(s: PopupStatus): HTMLElement {
  const room = s.room!;
  const state = room.state;
  const card = el('section', { className: 'card' });
  const copy = el('button', { className: 'secondary', textContent: 'Copy code' });
  copy.addEventListener(
    'click',
    () =>
      void navigator.clipboard
        .writeText(room.roomId)
        .then(() => ((copy.textContent = 'Copied'), undefined)),
  );
  card.append(
    el(
      'div',
      { className: 'row' },
      el(
        'div',
        { className: 'grow' },
        el('h2', { textContent: 'Room' }),
        el('div', { className: 'code', textContent: room.roomId }),
      ),
      copy,
    ),
  );
  if (room.connection !== 'connected')
    card.append(el('div', { className: 'small', textContent: `Connection: ${room.connection}…` }));
  if (!room.playerAttached)
    card.append(
      el('div', {
        className: 'small muted',
        textContent: 'Waiting for the video player on this tab…',
      }),
    );
  else
    card.append(
      el('div', {
        className: 'small muted',
        textContent: room.isHost
          ? 'You are the time source for the room.'
          : `Drift vs host: ${room.drift === null ? '–' : `${Math.round(room.drift * 1000)} ms`}`,
      }),
    );
  if (state) {
    card.append(memberList(state, room.userId, room.isHost));
    if (state.selection)
      card.append(
        el('div', { className: 'small', textContent: `Now showing: ${state.selection.title}` }),
      );
    if (room.isHost) {
      const toggle = el('input', { type: 'checkbox', checked: state.settings.hostOnlyControl });
      toggle.addEventListener(
        'change',
        () => void act(() => send({ type: 'setHostOnly', tabId: tabId!, value: toggle.checked })),
      );
      card.append(
        el('label', { className: 'row small' }, toggle, 'Only I can play, pause and seek'),
      );
      const countdown = el('button', {
        className: 'secondary',
        textContent: 'Synced countdown start',
        disabled: busy,
      });
      countdown.addEventListener(
        'click',
        () => void act(() => send({ type: 'countdown', tabId: tabId! })),
      );
      card.append(countdown);
    }
  }
  const leave = el('button', { className: 'secondary', textContent: 'Leave party' });
  leave.addEventListener(
    'click',
    () => void act(() => send({ type: 'leaveRoom', tabId: tabId! }).then(() => (catalog = null))),
  );
  card.append(leave);
  const parts: HTMLElement[] = [card];
  if (state) parts.push(catalogView(state, room.isHost));
  return el('div', { className: 'stack' }, ...parts);
}

function lobbyView(s: PopupStatus): HTMLElement {
  const card = el('section', { className: 'card' });
  const onService = !!s.tab?.serviceId;
  card.append(
    el('h2', { textContent: 'This tab' }),
    el('div', {
      textContent: onService
        ? `${s.tab!.serviceName}`
        : 'Open Netflix, Prime Video, Disney+ or another supported service in this tab first.',
      className: onService ? '' : 'muted',
    }),
  );
  const create = el('button', {
    textContent: 'Start a watch party',
    disabled: busy || tabId === null,
  });
  create.addEventListener(
    'click',
    () => void act(() => send({ type: 'createRoom', tabId: tabId! })),
  );
  const code = el('input', { type: 'text', placeholder: 'Room code', maxLength: 6 });
  const join = el('button', {
    className: 'secondary',
    textContent: 'Join',
    disabled: busy || tabId === null,
  });
  join.addEventListener(
    'click',
    () => void act(() => send({ type: 'joinRoom', tabId: tabId!, roomId: code.value })),
  );
  card.append(
    create,
    el('div', { className: 'row' }, el('div', { className: 'grow' }, code), join),
  );
  return card;
}

function settingsView(s: PopupStatus): HTMLElement {
  const details = el(
    'details',
    {},
    el('summary', { className: 'small muted', textContent: 'Settings' }),
  );
  const url = el('input', { type: 'url', value: s.serverUrl });
  const save = el('button', { className: 'secondary', textContent: 'Save server' });
  save.addEventListener(
    'click',
    () => void act(() => send({ type: 'saveServer', url: url.value })),
  );
  const edit = el('button', { className: 'link small', textContent: 'Edit streaming setup' });
  edit.addEventListener('click', () => {
    editingProfile = true;
    render();
  });
  details.append(
    el(
      'div',
      { className: 'card' },
      el('div', { className: 'small muted', textContent: 'Watch party server' }),
      url,
      save,
      edit,
    ),
  );
  return details;
}

let editingProfile = false;

function render() {
  if (!status) return;
  const parts: Array<HTMLElement | null> = [el('h1', { textContent: 'Watch Party' })];
  if (flash) parts.push(el('div', { className: 'error', role: 'alert', textContent: flash }));
  if (!status.profile || editingProfile) {
    parts.push(profileView(status.profile));
    if (status.profile) {
      const cancel = el('button', { className: 'link', textContent: 'Cancel' });
      cancel.addEventListener('click', () => {
        editingProfile = false;
        render();
      });
      parts.push(cancel);
    }
  } else if (status.room) {
    parts.push(roomView(status));
  } else {
    parts.push(lobbyView(status));
  }
  parts.push(settingsView(status));
  if (status.attribution)
    parts.push(el('p', { className: 'small muted', textContent: status.attribution }));
  app.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
}

async function init() {
  const params = new URLSearchParams(location.search);
  const forced = params.get('tabId');
  if (forced) tabId = Number(forced);
  else {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id ?? null;
  }
  const port = chrome.runtime.connect({ name: 'popup' });
  let lastRoom: string | null = null;
  port.onMessage.addListener(() => void refresh());
  await refresh();
  // Load the shared catalog once we're in a room.
  const watch = () => {
    const room = status?.room?.roomId ?? null;
    if (room && room !== lastRoom) void loadCatalog(1, '');
    lastRoom = room;
  };
  watch();
  port.onMessage.addListener(watch);
}

void init().catch((err) => {
  app.textContent = `Could not start: ${err instanceof Error ? err.message : String(err)}`;
});
