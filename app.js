/* =========================================================
   Tablero de tareas — lógica
   Sin backend: todo se guarda en localStorage.
   ========================================================= */

'use strict';

const STORAGE_KEY = 'trello.tasks.v1';
const THEME_KEY = 'trello.theme';

const COLUMNS = [
  {
    id: 'pendiente',
    title: 'Pendiente',
    color: '#e39a2d',
    emptyTitle: 'Nada pendiente',
    emptyText: 'Añade tu primera tarea para empezar.',
  },
  {
    id: 'enProceso',
    title: 'En proceso',
    color: '#4f7dff',
    emptyTitle: 'Nada en marcha',
    emptyText: 'Arrastra aquí lo que estés haciendo.',
  },
  {
    id: 'terminada',
    title: 'Terminada',
    color: '#25a06b',
    emptyTitle: 'Nada terminado',
    emptyText: 'Las tareas terminadas aparecerán aquí.',
  },
];

const COLUMN_BY_ID = Object.fromEntries(COLUMNS.map((col) => [col.id, col]));
const STATUS_ORDER = COLUMNS.map((col) => col.id);

const ICONS = {
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
  left:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5.5 8.5 12l6.5 6.5"/></svg>',
  right:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5.5 15.5 12 9 18.5"/></svg>',
  edit:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.6 3.4a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5Z"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6.5h17"/><path d="M9 6.5V4.2A1.2 1.2 0 0 1 10.2 3h3.6A1.2 1.2 0 0 1 15 4.2v2.3"/><path d="M18.5 6.5 17.7 20a1.5 1.5 0 0 1-1.5 1.4H7.8A1.5 1.5 0 0 1 6.3 20L5.5 6.5"/><path d="M10 11v5.5M14 11v5.5"/></svg>',
  inbox:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13h4l1.5 2.5h5L16 13h4"/><path d="M5.8 4.5h12.4a2 2 0 0 1 1.9 1.4l1.4 4.6v6a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2v-6l1.4-4.6a2 2 0 0 1 1.9-1.4Z"/></svg>',
};

const els = {
  board: document.getElementById('board'),
  search: document.getElementById('searchInput'),
  themeToggle: document.getElementById('themeToggle'),
  newTask: document.getElementById('newTaskBtn'),

  dialog: document.getElementById('taskDialog'),
  form: document.getElementById('taskForm'),
  dialogTitle: document.getElementById('dialogTitle'),
  closeDialog: document.getElementById('closeDialog'),
  cancel: document.getElementById('cancelBtn'),
  saveBtn: document.getElementById('saveBtn'),

  id: document.getElementById('taskId'),
  title: document.getElementById('taskTitle'),
  status: document.getElementById('taskStatus'),
  date: document.getElementById('taskDate'),
  description: document.getElementById('taskDescription'),
  titleError: document.getElementById('titleError'),

  summaryText: document.getElementById('summaryText'),
  summaryPct: document.getElementById('summaryPct'),
  progress: document.getElementById('progress'),
  progressBar: document.getElementById('progressBar'),

  clearDone: document.getElementById('clearDoneBtn'),
  toast: document.getElementById('toast'),
};

let tasks = loadTasks();
let query = '';
let toastTimer = null;

let dragId = null;
let placeholder = null;
let lastDragEnd = 0;

/* ---------- Utilidades ---------- */

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatDate(iso) {
  const today = todayISO();
  if (iso === today) return 'Hoy';

  const date = new Date(iso + 'T00:00:00');
  const base = new Date(today + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return iso;

  const diffDays = Math.round((date - base) / 86400000);
  if (diffDays === 1) return 'Mañana';
  if (diffDays === -1) return 'Ayer';

  const options = { day: 'numeric', month: 'short' };
  if (date.getFullYear() !== base.getFullYear()) options.year = 'numeric';

  return new Intl.DateTimeFormat('es-ES', options).format(date).replace('.', '');
}

function formatFullDate(iso) {
  const date = new Date(iso + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function isOverdue(task) {
  return task.status !== 'terminada' && task.date < todayISO();
}

function showToast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    els.toast.classList.remove('show');
  }, 2400);
}

/* ---------- Persistencia ---------- */

function demoTasks() {
  return [
    {
      id: uid(),
      title: 'Definir el alcance del proyecto',
      status: 'pendiente',
      description: 'Revisar objetivos, entregables y fechas clave con el equipo.',
      date: todayISO(2),
    },
    {
      id: uid(),
      title: 'Preparar propuesta de diseño',
      status: 'pendiente',
      description: '',
      date: todayISO(5),
    },
    {
      id: uid(),
      title: 'Maquetar la pantalla de inicio',
      status: 'enProceso',
      description: 'Aplicar estilos base y componentes reutilizables.',
      date: todayISO(1),
    },
    {
      id: uid(),
      title: 'Revisar accesibilidad y contraste',
      status: 'enProceso',
      description: 'Comprobar foco visible, etiquetas y lectura en móvil.',
      date: todayISO(-1),
    },
    {
      id: uid(),
      title: 'Configurar repositorio',
      status: 'terminada',
      description: 'Estructura inicial y reglas de estilo.',
      date: todayISO(-3),
    },
    {
      id: uid(),
      title: 'Reunión de kickoff',
      status: 'terminada',
      description: '',
      date: todayISO(-5),
    },
  ];
}

function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const title = String(raw.title || '').trim();
  if (!title) return null;

  const status = STATUS_ORDER.includes(raw.status) ? raw.status : 'pendiente';
  const isIsoDate = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date);
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : uid();

  return {
    id,
    title: title.slice(0, 80),
    status,
    description: String(raw.description || '').trim().slice(0, 300),
    date: isIsoDate ? raw.date : todayISO(),
  };
}

function loadTasks() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn('No se pudo leer localStorage:', error);
  }

  if (raw === null) {
    const seeded = demoTasks();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    } catch (error) {
      console.warn('No se pudo guardar la demo:', error);
    }
    return seeded;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seen = new Set();
    return parsed
      .map(normalizeTask)
      .filter(Boolean)
      .filter((task) => {
        if (seen.has(task.id)) return false;
        seen.add(task.id);
        return true;
      });
  } catch (error) {
    console.warn('Datos guardados no válidos:', error);
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.warn('No se pudo guardar en localStorage:', error);
    showToast('No se pudieron guardar los cambios');
  }
}

/* ---------- Tema ---------- */

function applyTheme(theme, persist) {
  document.documentElement.dataset.theme = theme;

  const isDark = theme === 'dark';
  const action = isDark ? 'Activar modo claro' : 'Activar modo oscuro';
  els.themeToggle.setAttribute('aria-label', action);
  els.themeToggle.setAttribute('title', action);

  const meta = document.getElementById('themeColor');
  if (meta) meta.setAttribute('content', isDark ? '#0a0e16' : '#eef1f7');

  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      console.warn('No se pudo guardar el tema:', error);
    }
  }
}

function initTheme() {
  const current = document.documentElement.dataset.theme;
  if (current === 'dark' || current === 'light') {
    applyTheme(current, false);
    return;
  }
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark ? 'dark' : 'light', false);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next, true);
}

/* ---------- Construcción del tablero ---------- */

function buildBoard() {
  els.board.innerHTML = '';

  for (const column of COLUMNS) {
    const section = document.createElement('section');
    section.className = 'column';
    section.dataset.status = column.id;
    section.style.setProperty('--col', column.color);
    section.setAttribute('aria-label', `Columna ${column.title}`);

    section.innerHTML = `
      <header class="column-head">
        <span class="column-dot" aria-hidden="true"></span>
        <h2 class="column-title">${column.title}</h2>
        <span class="count" data-count>0</span>
        <button class="col-add" type="button" data-add="${column.id}" aria-label="Añadir tarea a ${column.title}" title="Añadir tarea">
          ${ICONS.plus}
        </button>
      </header>
      <div class="column-list" data-list="${column.id}"></div>
      <button class="add-card" type="button" data-add="${column.id}">
        ${ICONS.plus}
        Añadir tarea
      </button>
    `;

    els.board.appendChild(section);
  }
}

function createCard(task) {
  const column = COLUMN_BY_ID[task.status];
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.id = task.id;
  card.draggable = true;
  card.tabIndex = 0;
  card.setAttribute('aria-roledescription', 'tarjeta de tarea');
  card.setAttribute(
    'aria-label',
    `${task.title}. Estado: ${column.title}. Abre la tarjeta para editarla.`
  );

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = task.title;
  card.appendChild(title);

  if (task.description) {
    const description = document.createElement('p');
    description.className = 'card-desc';
    description.textContent = task.description;
    card.appendChild(description);
  }

  const meta = document.createElement('div');
  meta.className = 'card-meta';

  const dateEl = document.createElement('span');
  dateEl.className = 'card-date';
  const overdue = isOverdue(task);
  if (overdue) dateEl.classList.add('is-overdue');
  dateEl.title = (overdue ? 'Fecha límite vencida: ' : 'Fecha límite: ') + formatFullDate(task.date);
  dateEl.innerHTML = ICONS.calendar;

  const dateLabel = document.createElement('span');
  dateLabel.textContent = formatDate(task.date);
  dateEl.appendChild(dateLabel);

  if (overdue) {
    const warning = document.createElement('span');
    warning.textContent = '· vencida';
    dateEl.appendChild(warning);
  }

  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const leftIndex = STATUS_ORDER.indexOf(task.status);
  actions.append(
    actionButton('move-left', ICONS.left, 'Mover a la columna anterior', leftIndex === 0),
    actionButton('move-right', ICONS.right, 'Mover a la columna siguiente', leftIndex === STATUS_ORDER.length - 1),
    actionButton('edit', ICONS.edit, 'Editar tarea'),
    actionButton('delete', ICONS.trash, 'Eliminar tarea')
  );

  meta.append(dateEl, actions);
  card.appendChild(meta);

  return card;
}

function actionButton(action, icon, label, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card-btn';
  button.dataset.action = action;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = icon;
  button.disabled = disabled;
  return button;
}

function createEmptyState(column, filtered) {
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';

  const icon = document.createElement('div');
  icon.className = 'empty-icon';
  icon.innerHTML = ICONS.inbox;

  const title = document.createElement('p');
  title.className = 'empty-title';

  const text = document.createElement('p');
  text.className = 'empty-text';

  if (filtered) {
    title.textContent = 'Sin coincidencias';
    text.textContent = 'Prueba con otra búsqueda.';
  } else {
    title.textContent = column.emptyTitle;
    text.textContent = column.emptyText;
  }

  wrapper.append(icon, title, text);
  return wrapper;
}

/* ---------- Render ---------- */

function render() {
  const search = normalizeText(query);

  for (const column of COLUMNS) {
    const columnEl = els.board.querySelector(`.column[data-status="${column.id}"]`);
    if (!columnEl) continue;

    const list = columnEl.querySelector('[data-list]');
    const columnTasks = tasks.filter((task) => task.status === column.id);
    const visibleTasks = columnTasks.filter((task) => {
      if (!search) return true;
      return normalizeText(task.title).includes(search) || normalizeText(task.description).includes(search);
    });

    list.innerHTML = '';
    for (const task of visibleTasks) {
      list.appendChild(createCard(task));
    }

    if (visibleTasks.length === 0) {
      list.appendChild(createEmptyState(column, columnTasks.length > 0));
    }

    const count = columnEl.querySelector('[data-count]');
    if (count) count.textContent = String(columnTasks.length);
  }

  updateProgress();
}

function updateProgress() {
  const total = tasks.length;
  const done = tasks.filter((task) => task.status === 'terminada').length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  els.summaryText.textContent =
    total === 0
      ? 'Sin tareas todavía'
      : `${done} de ${total} ${total === 1 ? 'tarea completada' : 'tareas completadas'}`;

  els.summaryPct.textContent = `${percent}%`;
  els.progressBar.style.width = `${percent}%`;
  els.progress.setAttribute('aria-valuenow', String(percent));
  els.progress.setAttribute('aria-valuetext', `${done} de ${total} tareas completadas`);

  els.clearDone.hidden = done === 0;
}

/* ---------- Diálogo de tarea ---------- */

function clearTitleError() {
  els.titleError.textContent = '';
  els.title.removeAttribute('aria-invalid');
}

function showTitleError(message) {
  els.titleError.textContent = message;
  els.title.setAttribute('aria-invalid', 'true');
}

function openDialog(taskId, presetStatus) {
  els.form.reset();
  clearTitleError();

  if (taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    els.id.value = task.id;
    els.title.value = task.title;
    els.status.value = task.status;
    els.date.value = task.date;
    els.description.value = task.description || '';
    els.dialogTitle.textContent = 'Editar tarea';
    els.saveBtn.textContent = 'Guardar cambios';
  } else {
    els.id.value = '';
    els.status.value = STATUS_ORDER.includes(presetStatus) ? presetStatus : 'pendiente';
    els.date.value = todayISO();
    els.dialogTitle.textContent = 'Nueva tarea';
    els.saveBtn.textContent = 'Crear tarea';
  }

  els.dialog.showModal();
  window.setTimeout(() => els.title.focus(), 40);
}

function closeDialog() {
  if (els.dialog.open) els.dialog.close();
}

function onSubmit(event) {
  event.preventDefault();

  const title = els.title.value.trim();
  if (!title) {
    showTitleError('Escribe un título para la tarea.');
    els.title.focus();
    return;
  }

  const status = STATUS_ORDER.includes(els.status.value) ? els.status.value : 'pendiente';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(els.date.value) ? els.date.value : todayISO();
  const data = {
    title: title.slice(0, 80),
    status,
    description: els.description.value.trim().slice(0, 300),
    date,
  };

  const editingId = els.id.value;
  if (editingId) {
    const index = tasks.findIndex((task) => task.id === editingId);
    if (index !== -1) {
      tasks[index] = { ...tasks[index], ...data };
    }
    showToast('Tarea actualizada');
  } else {
    tasks.push({ id: uid(), ...data });
    showToast('Tarea creada');
  }

  saveTasks();
  closeDialog();
  render();
}

/* ---------- Acciones sobre tarjetas ---------- */

function deleteTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  const confirmed = window.confirm(`¿Eliminar la tarea «${task.title}»?`);
  if (!confirmed) return;

  tasks = tasks.filter((item) => item.id !== id);
  saveTasks();
  render();
  showToast('Tarea eliminada');
}

function moveTask(id, direction) {
  const task = tasks.find((item) => item.id === id);
  if (!task) return;

  const currentIndex = STATUS_ORDER.indexOf(task.status);
  const nextIndex = Math.max(0, Math.min(STATUS_ORDER.length - 1, currentIndex + direction));
  const nextStatus = STATUS_ORDER[nextIndex];

  if (nextStatus === task.status) return;

  task.status = nextStatus;
  tasks = tasks.filter((item) => item.id !== id);
  tasks.push(task);

  saveTasks();
  render();
  showToast(`Tarea movida a ${COLUMN_BY_ID[nextStatus].title}`);
}

function clearCompleted() {
  const done = tasks.filter((task) => task.status === 'terminada').length;
  if (done === 0) return;

  const label = done === 1 ? 'la tarea terminada' : `las ${done} tareas terminadas`;
  if (!window.confirm(`¿Eliminar ${label}?`)) return;

  tasks = tasks.filter((task) => task.status !== 'terminada');
  saveTasks();
  render();
  showToast('Tareas terminadas eliminadas');
}

/* ---------- Eventos del tablero ---------- */

function onBoardClick(event) {
  const addButton = event.target.closest('[data-add]');
  if (addButton) {
    openDialog(null, addButton.dataset.add);
    return;
  }

  const card = event.target.closest('.card');
  if (!card) return;

  if (Date.now() - lastDragEnd < 220) return;

  const action = event.target.closest('[data-action]');
  if (!action) {
    openDialog(card.dataset.id);
    return;
  }

  const id = card.dataset.id;
  switch (action.dataset.action) {
    case 'edit':
      openDialog(id);
      break;
    case 'delete':
      deleteTask(id);
      break;
    case 'move-left':
      moveTask(id, -1);
      break;
    case 'move-right':
      moveTask(id, 1);
      break;
    default:
      break;
  }
}

function onBoardKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;

  const card = event.target.closest('.card');
  if (!card || event.target.closest('button')) return;

  event.preventDefault();
  openDialog(card.dataset.id);
}

/* ---------- Arrastrar y soltar ---------- */

function dropListFrom(node) {
  if (!node || typeof node.closest !== 'function') return null;
  const column = node.closest('.column');
  return column ? column.querySelector('[data-list]') : null;
}

function getDragAfterElement(list, y) {
  const cards = Array.from(list.querySelectorAll('.card:not(.is-dragging)'));

  return cards.reduce(
    (closest, card) => {
      const box = card.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: card };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function cleanupDrag() {
  if (placeholder && placeholder.parentNode) {
    placeholder.parentNode.removeChild(placeholder);
  }
  placeholder = null;
  dragId = null;

  document.body.classList.remove('is-dragging-active');
  document.querySelectorAll('.card.is-dragging').forEach((card) => card.classList.remove('is-dragging'));
  document.querySelectorAll('.column.is-over').forEach((column) => column.classList.remove('is-over'));
}

function onDragStart(event) {
  const card = event.target.closest('.card');
  if (!card) return;

  dragId = card.dataset.id;
  document.body.classList.add('is-dragging-active');

  // Se aplica en el siguiente frame para que la imagen de arrastre no salga atenuada.
  requestAnimationFrame(() => {
    if (dragId === card.dataset.id) card.classList.add('is-dragging');
  });

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData('text/plain', dragId);
    } catch (error) {
      /* algunos navegadores limitan setData */
    }
  }

  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.className = 'card-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
  }
}

function onDragOver(event) {
  if (!dragId) return;

  const list = dropListFrom(event.target);
  if (!list) return;

  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

  const column = list.closest('.column');
  document.querySelectorAll('.column.is-over').forEach((other) => {
    if (other !== column) other.classList.remove('is-over');
  });
  column.classList.add('is-over');

  const after = getDragAfterElement(list, event.clientY);
  if (after) list.insertBefore(placeholder, after);
  else list.appendChild(placeholder);
}

function onDragLeave(event) {
  const column = event.target.closest('.column');
  if (!column) return;
  if (!column.contains(event.relatedTarget)) {
    column.classList.remove('is-over');
  }
}

function onDrop(event) {
  const list = dropListFrom(event.target);
  if (!dragId || !list) return;

  event.preventDefault();

  const column = list.closest('.column');
  const newStatus = column.dataset.status;
  const task = tasks.find((item) => item.id === dragId);

  if (!task) {
    cleanupDrag();
    return;
  }

  let insertAt = 0;
  if (placeholder && placeholder.parentNode === list) {
    for (const child of list.children) {
      if (child === placeholder) break;
      if (child.classList.contains('card') && child.dataset.id !== dragId) insertAt += 1;
    }
  } else {
    insertAt = Array.from(list.querySelectorAll('.card')).filter(
      (card) => card.dataset.id !== dragId
    ).length;
  }

  const ids = Array.from(list.querySelectorAll('.card'))
    .map((card) => card.dataset.id)
    .filter((id) => id !== dragId);

  const nextId = ids[insertAt] || null;
  const prevId = insertAt > 0 ? ids[insertAt - 1] : null;
  const statusChanged = task.status !== newStatus;

  tasks = tasks.filter((item) => item.id !== dragId);
  task.status = newStatus;

  if (nextId) {
    const index = tasks.findIndex((item) => item.id === nextId);
    if (index !== -1) tasks.splice(index, 0, task);
    else tasks.push(task);
  } else if (prevId) {
    const index = tasks.findIndex((item) => item.id === prevId);
    if (index !== -1) tasks.splice(index + 1, 0, task);
    else tasks.push(task);
  } else {
    tasks.push(task);
  }

  saveTasks();
  cleanupDrag();
  render();
  lastDragEnd = Date.now();

  if (statusChanged) {
    showToast(`Tarea movida a ${COLUMN_BY_ID[newStatus].title}`);
  }
}

function bindDragAndDrop() {
  els.board.addEventListener('dragstart', onDragStart);
  els.board.addEventListener('dragover', onDragOver);
  els.board.addEventListener('dragleave', onDragLeave);
  els.board.addEventListener('drop', onDrop);
  els.board.addEventListener('dragend', () => {
    lastDragEnd = Date.now();
    cleanupDrag();
  });
}

/* ---------- Inicialización ---------- */

function bindEvents() {
  initTheme();

  els.themeToggle.addEventListener('click', toggleTheme);
  els.newTask.addEventListener('click', () => openDialog());
  els.board.addEventListener('click', onBoardClick);
  els.board.addEventListener('keydown', onBoardKeydown);

  els.search.addEventListener('input', () => {
    query = els.search.value;
    render();
  });

  els.form.addEventListener('submit', onSubmit);
  els.cancel.addEventListener('click', closeDialog);
  els.closeDialog.addEventListener('click', closeDialog);
  els.dialog.addEventListener('click', (event) => {
    if (event.target === els.dialog) closeDialog();
  });
  els.title.addEventListener('input', clearTitleError);

  els.clearDone.addEventListener('click', clearCompleted);

  bindDragAndDrop();
}

buildBoard();
bindEvents();
render();
