'use strict';

/* =========================================================
   Mi Secretaria — v1 (registro simple, datos en el dispositivo)
   ========================================================= */

const STORAGE_KEY = 'misecretaria.datos.v1';
const APP_VERSION = '1.2.0';

const CATEGORIAS_BASE = ['Mercado y comida', 'Servicios', 'Tarjetas', 'Transporte', 'Salud', 'Educación', 'Hogar', 'Ocio', 'Ropa', 'Otros'];
const AREAS = ['Hogar', 'Trabajo', 'Personal', 'Familia'];
const TIPOS_PAGO = ['Tarjeta', 'Servicio', 'Préstamo', 'Suscripción', 'Otro'];
const CATEGORIA_POR_TIPO = { 'Tarjeta': 'Tarjetas', 'Servicio': 'Servicios', 'Préstamo': 'Otros', 'Suscripción': 'Ocio', 'Otro': 'Otros' };
const PRIORIDADES = [['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
const ORDEN_PRIO = { alta: 0, media: 1, baja: 2 };
const REPETIR = [['no', 'No se repite'], ['diaria', 'Cada día'], ['semanal', 'Cada semana'], ['mensual', 'Cada mes']];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const suma = arr => arr.reduce((a, b) => a + b, 0);
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

function fechaStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function hoyStr() { return fechaStr(new Date()); }
function parseFecha(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function mesStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function diasEntre(a, b) { return Math.round((parseFecha(b) - parseFecha(a)) / 86400000); }
function sumarDias(s, n) { const d = parseFecha(s); d.setDate(d.getDate() + n); return fechaStr(d); }
function sumarMes(ym, n) { const [y, m] = ym.split('-').map(Number); return mesStr(new Date(y, m - 1 + n, 1)); }
function sumarMesesFecha(s, n) {
  const d = parseFecha(s);
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const dim = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(d.getDate(), dim));
  return fechaStr(r);
}
function nombreMes(ym) { const [y, m] = ym.split('-').map(Number); return capital(MESES[m - 1]) + ' ' + y; }
function fechaCorta(s) { const d = parseFecha(s); return d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3); }
function fechaRelativa(s) {
  const n = diasEntre(hoyStr(), s);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  if (n === -1) return 'Ayer';
  if (n < 0) return `Hace ${-n} días`;
  if (n < 7) return capital(DIAS[parseFecha(s).getDay()]);
  return fechaCorta(s);
}
function fechaLarga(s) { const d = parseFecha(s); return capital(DIAS[d.getDay()]) + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()]; }

function parseMonto(v) {
  let s = String(v ?? '').trim().replace(/\s|S\/|US\$|\$/gi, '');
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
const nf = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const soles = n => 'S/ ' + nf.format(n);
const dolares = n => 'US$ ' + nf.format(n);
const fmt = (monto, moneda) => moneda === 'USD' ? dolares(monto) : soles(monto);
const enSoles = g => g.moneda === 'USD' ? g.monto * (g.tc || db.ajustes.tc) : g.monto;

/* ---------- datos ---------- */
function nuevoDb() {
  return {
    version: 1,
    ajustes: { tc: 3.75, tcFecha: null, categorias: [...CATEGORIAS_BASE], ultimoRespaldo: null },
    gastos: [], pagos: [], tareas: []
  };
}
function normalizar(d) {
  const base = nuevoDb();
  if (!d || typeof d !== 'object') return base;
  return {
    ...base, ...d,
    ajustes: { ...base.ajustes, ...(d.ajustes || {}) },
    gastos: Array.isArray(d.gastos) ? d.gastos : [],
    pagos: Array.isArray(d.pagos) ? d.pagos : [],
    tareas: Array.isArray(d.tareas) ? d.tareas : []
  };
}
function cargar() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizar(JSON.parse(raw));
  } catch (e) { console.warn('No se pudieron leer los datos', e); }
  return nuevoDb();
}
function guardar() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); return true; }
  catch (e) { toast('⚠ No se pudo guardar en este dispositivo'); return false; }
}

let db = cargar();
const estado = {
  tab: 'inicio',
  mesGastos: mesStr(new Date()),
  mesPagos: mesStr(new Date()),
  filtroTareas: 'pendientes',
  areaTareas: 'Todas',
  busqueda: ''
};

/* ---------- lógica de negocio ---------- */
function gastosDelMes(ym) { return db.gastos.filter(g => g.fecha.startsWith(ym)); }
function totalMes(ym) { return suma(gastosDelMes(ym).map(enSoles)); }
const ordenGastos = (a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || '').localeCompare(a.creado || '');

function estadoPago(p, ym) {
  const [y, m] = ym.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  const vence = `${ym}-${pad(Math.min(p.dia, dim))}`;
  const gid = p.pagados && p.pagados[ym];
  const gasto = gid ? db.gastos.find(g => g.id === gid) : null;
  return { p, ym, vence, dias: diasEntre(hoyStr(), vence), pagado: !!gasto, gasto };
}
function pagosProximos(diasMax) {
  const ym = mesStr(new Date());
  return db.pagos.filter(p => p.activo !== false).map(p => {
    let e = estadoPago(p, ym);
    // Si ya se pagó este mes, o se creó después del vencimiento, mirar el mes siguiente
    if (e.pagado || (p.creado && e.vence < p.creado.slice(0, 10))) e = estadoPago(p, sumarMes(ym, 1));
    return e;
  }).filter(e => !e.pagado && e.dias <= diasMax).sort((a, b) => a.dias - b.dias);
}

function tareasOrdenadas(lista) {
  return [...lista].sort((a, b) =>
    (a.fecha || '9999').localeCompare(b.fecha || '9999') ||
    ORDEN_PRIO[a.prioridad || 'media'] - ORDEN_PRIO[b.prioridad || 'media'] ||
    (a.creado || '').localeCompare(b.creado || ''));
}

function categorias(extra) {
  const c = [...db.ajustes.categorias];
  if (extra && !c.includes(extra)) c.push(extra);
  return c;
}
function ultimaCategoria() {
  const g = [...db.gastos].sort((a, b) => (b.creado || '').localeCompare(a.creado || ''))[0];
  return g ? g.categoria : db.ajustes.categorias[0];
}

/* ---------- componentes ---------- */
function chipsRadio(name, opciones, valor) {
  return `<div class="chips">${opciones.map(([v, l]) =>
    `<label class="chip"><input type="radio" name="${name}" value="${esc(v)}" ${v === valor ? 'checked' : ''}><span>${esc(l)}</span></label>`
  ).join('')}</div>`;
}
function segmento(name, opciones, valor) {
  return `<div class="seg">${opciones.map(([v, l]) =>
    `<label><input type="radio" name="${name}" value="${esc(v)}" ${v === valor ? 'checked' : ''}><span>${esc(l)}</span></label>`
  ).join('')}</div>`;
}
function opciones(lista, valor) {
  return lista.map(([v, l]) => `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
function selectorMes(ym, accion) {
  return `<div class="selector-mes">
    <button class="icon-btn" data-action="${accion}" data-delta="-1" aria-label="Mes anterior">‹</button>
    <strong>${nombreMes(ym)}</strong>
    <button class="icon-btn" data-action="${accion}" data-delta="1" aria-label="Mes siguiente">›</button>
  </div>`;
}
function vacio(texto, boton = '') { return `<div class="vacio"><p>${texto}</p>${boton}</div>`; }

function badgePago(e) {
  if (e.pagado) return `<span class="badge ok">Pagado</span>`;
  if (e.dias < 0) return `<span class="badge danger">Vencido hace ${-e.dias} d</span>`;
  if (e.dias === 0) return `<span class="badge danger">Vence hoy</span>`;
  if (e.dias === 1) return `<span class="badge warn">Vence mañana</span>`;
  if (e.dias <= 3) return `<span class="badge warn">En ${e.dias} días</span>`;
  return `<span class="badge">En ${e.dias} días</span>`;
}
function filaPago(e) {
  const p = e.p;
  const monto = e.pagado ? fmt(e.gasto.monto, e.gasto.moneda) : (p.monto ? fmt(p.monto, p.moneda) : '—');
  const boton = e.pagado
    ? `<button class="btn-sm ghost" data-action="deshacer-pago" data-id="${p.id}" data-ym="${e.ym}">Deshacer</button>`
    : `<button class="btn-sm primary" data-action="pagar" data-id="${p.id}" data-ym="${e.ym}">Pagar</button>`;
  return `<div class="fila">
    <button class="fila-main" data-action="editar-pago" data-id="${p.id}">
      <span class="fila-titulo">${esc(p.nombre)}</span>
      <span class="fila-sub">${esc(p.tipo)} · vence ${fechaCorta(e.vence)}${p.nota ? ' · ' + esc(p.nota) : ''}</span>
    </button>
    <div class="fila-der">
      <span class="monto">${monto}</span>
      ${badgePago(e)}
    </div>
    ${boton}
  </div>`;
}
function filaTarea(t) {
  const hoy = hoyStr();
  const atrasada = !t.hecha && t.fecha && t.fecha < hoy;
  const partes = [esc(t.area)];
  if (t.fecha) partes.push(`<span class="${atrasada ? 'txt-danger' : ''}">${fechaRelativa(t.fecha)}</span>`);
  if (t.repetir && t.repetir !== 'no') partes.push('↻ ' + REPETIR.find(r => r[0] === t.repetir)[1].toLowerCase());
  if (t.hecha && t.hechaEn) partes.push('hecha ' + fechaRelativa(t.hechaEn).toLowerCase());
  return `<div class="fila tarea ${t.hecha ? 'hecha' : ''}">
    <button class="check ${t.hecha ? 'on' : ''}" data-action="toggle-tarea" data-id="${t.id}" aria-label="${t.hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>
    </button>
    <button class="fila-main" data-action="editar-tarea" data-id="${t.id}">
      <span class="fila-titulo"><i class="prio ${t.prioridad || 'media'}" title="Prioridad ${t.prioridad || 'media'}"></i>${esc(t.titulo)}</span>
      <span class="fila-sub">${partes.join(' · ')}</span>
    </button>
  </div>`;
}
function filaGasto(g) {
  return `<button class="fila fila-main gasto" data-action="editar-gasto" data-id="${g.id}">
    <span class="fila-izq">
      <span class="fila-titulo">${esc(g.nota || g.categoria)}</span>
      <span class="fila-sub">${esc(g.categoria)}${g.pagoId ? ' · pago fijo' : ''}</span>
    </span>
    <span class="fila-der">
      <span class="monto">${fmt(g.monto, g.moneda)}</span>
      ${g.moneda === 'USD' ? `<span class="fila-sub">≈ ${soles(enSoles(g))}</span>` : ''}
    </span>
  </button>`;
}

/* ---------- vistas ---------- */
function vistaInicio() {
  const hoy = hoyStr();
  const ym = hoy.slice(0, 7);
  const h = new Date().getHours();
  const saludo = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const total = totalMes(ym);
  const prev = totalMes(sumarMes(ym, -1));
  const nG = gastosDelMes(ym).length;
  const proximos = pagosProximos(10);
  const pend = tareasOrdenadas(db.tareas.filter(t => !t.hecha));
  const paraHoy = pend.filter(t => t.fecha && t.fecha <= hoy);
  const foco = pend.filter(t => (t.fecha && diasEntre(hoy, t.fecha) <= 1) || t.prioridad === 'alta').slice(0, 6);
  const ultimos = [...db.gastos].sort(ordenGastos).slice(0, 5);

  const frases = [];
  const urgentesPago = proximos.filter(e => e.dias <= 3).length;
  if (urgentesPago) frases.push(`${urgentesPago} ${urgentesPago === 1 ? 'pago por vencer' : 'pagos por vencer'} en los próximos 3 días`);
  if (paraHoy.length) frases.push(`${paraHoy.length} ${paraHoy.length === 1 ? 'pendiente' : 'pendientes'} para hoy o atrasados`);
  const frase = frases.length ? 'Tienes ' + frases.join(' y ') + '.' : 'Todo en orden por ahora.';

  let html = `<section class="saludo">
    <p class="muted">${fechaLarga(hoy)}</p>
    <h2>${saludo}</h2>
    <p>${frase}</p>
  </section>`;

  const nDatos = db.gastos.length + db.pagos.length + db.tareas.length;
  if (nDatos > 0 && (!db.ajustes.ultimoRespaldo || diasEntre(db.ajustes.ultimoRespaldo, hoy) >= 7)) {
    html += `<section class="aviso">
      <p><strong>Haz una copia de seguridad.</strong> ${db.ajustes.ultimoRespaldo ? 'La última fue hace ' + diasEntre(db.ajustes.ultimoRespaldo, hoy) + ' días.' : 'Aún no has guardado ninguna.'}</p>
      <button class="btn-sm primary" data-action="exportar">Descargar copia</button>
    </section>`;
  }

  const ymPrev = sumarMes(ym, -1);
  if (gastosDelMes(ymPrev).length && db.ajustes.reporteAvisado !== ymPrev) {
    html += `<section class="aviso info">
      <p><strong>Tu reporte de ${MESES[Number(ymPrev.slice(5)) - 1]} está listo.</strong> Descárgalo en Excel.</p>
      <div class="aviso-botones">
        <button class="btn-sm primary" data-action="excel" data-periodo="${ymPrev}">Descargar Excel</button>
        <button class="link" data-action="omitir-reporte" data-periodo="${ymPrev}">Ahora no</button>
      </div>
    </section>`;
  }

  html += `<section class="card resumen" data-action="tab" data-tab="gastos" role="button" tabindex="0">
    <p class="muted">Gastado en ${MESES[new Date().getMonth()]}</p>
    <p class="cifra">${soles(total)}</p>
    <p class="muted small">≈ ${dolares(total / db.ajustes.tc)} · ${nG} ${nG === 1 ? 'registro' : 'registros'} · mes anterior ${soles(prev)}</p>
  </section>`;

  html += `<section class="card">
    <div class="card-head"><h3>Pagos por vencer</h3><button class="link" data-action="tab" data-tab="pagos">Ver todos</button></div>
    ${proximos.length ? proximos.map(filaPago).join('')
      : db.pagos.length ? `<p class="muted small">Nada vence en los próximos 10 días.</p>`
        : vacio('Registra tus tarjetas y servicios para que te avise antes de cada vencimiento.', `<button class="btn-sm primary" data-action="nuevo-pago">Agregar tarjeta o servicio</button>`)}
  </section>`;

  html += `<section class="card">
    <div class="card-head"><h3>Para atender</h3><button class="link" data-action="tab" data-tab="tareas">Ver todos (${pend.length})</button></div>
    ${foco.length ? foco.map(filaTarea).join('')
      : pend.length ? `<p class="muted small">Nada urgente. Tienes ${pend.length} ${pend.length === 1 ? 'pendiente' : 'pendientes'} sin apuro.</p>`
        : vacio('Sin pendientes. Anota trabajos, tareas del hogar o encargos.', `<button class="btn-sm primary" data-action="nuevo-tarea">Agregar pendiente</button>`)}
  </section>`;

  html += `<section class="card">
    <div class="card-head"><h3>Últimos gastos</h3><button class="link" data-action="tab" data-tab="gastos">Ver todos</button></div>
    ${ultimos.length ? ultimos.map(filaGasto).join('') : vacio('Aún no hay gastos.', `<button class="btn-sm primary" data-action="nuevo-gasto">Registrar gasto</button>`)}
  </section>`;
  return html;
}

function vistaGastos() {
  const ym = estado.mesGastos;
  const gm = gastosDelMes(ym);
  const total = suma(gm.map(enSoles));
  const porCat = {};
  gm.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + enSoles(g); });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const max = cats.length ? cats[0][1] : 1;

  return `${selectorMes(ym, 'mes-gastos')}
  <section class="card resumen">
    <p class="muted">Total del mes</p>
    <p class="cifra">${soles(total)}</p>
    <p class="muted small">≈ ${dolares(total / db.ajustes.tc)} · ${gm.length} ${gm.length === 1 ? 'registro' : 'registros'}</p>
    <div class="acciones excel">
      <button class="btn-sm primary" data-action="excel" data-periodo="${ym}" ${gm.length ? '' : 'disabled'}>Excel de ${MESES[Number(ym.slice(5)) - 1]}</button>
      <button class="btn-sm ghost" data-action="excel" data-periodo="${ym.slice(0, 4)}">Excel del año ${ym.slice(0, 4)}</button>
    </div>
    ${cats.length ? `<div class="barras">${cats.map(([c, v]) => `
      <div class="barra">
        <div class="barra-txt"><span>${esc(c)}</span><span>${soles(v)} <span class="muted">· ${Math.round(v / total * 100)}%</span></span></div>
        <div class="barra-pista"><div class="barra-relleno" style="width:${Math.max(2, v / max * 100)}%"></div></div>
      </div>`).join('')}</div>` : ''}
  </section>
  <input class="buscar" id="buscar" type="search" placeholder="Buscar en ${MESES[Number(ym.slice(5)) - 1]}…" value="${esc(estado.busqueda)}">
  <div id="listaGastos"></div>`;
}
function renderListaGastos() {
  const cont = $('#listaGastos');
  if (!cont) return;
  const q = estado.busqueda.trim().toLowerCase();
  const lista = gastosDelMes(estado.mesGastos)
    .filter(g => !q || `${g.nota} ${g.categoria} ${g.monto}`.toLowerCase().includes(q))
    .sort(ordenGastos);
  if (!lista.length) {
    cont.innerHTML = q ? vacio('No hay resultados.') : vacio('No hay gastos en este mes.', `<button class="btn-sm primary" data-action="nuevo-gasto">Registrar gasto</button>`);
    return;
  }
  const grupos = {};
  lista.forEach(g => (grupos[g.fecha] = grupos[g.fecha] || []).push(g));
  cont.innerHTML = Object.entries(grupos).map(([f, gs]) => `
    <section class="grupo">
      <div class="grupo-head"><span>${fechaRelativa(f) === fechaCorta(f) ? fechaLarga(f) : fechaRelativa(f) + ' · ' + fechaCorta(f)}</span><span>${soles(suma(gs.map(enSoles)))}</span></div>
      <div class="card lista">${gs.map(filaGasto).join('')}</div>
    </section>`).join('');
}

function vistaPagos() {
  const ym = estado.mesPagos;
  const activos = db.pagos.filter(p => p.activo !== false);
  const inactivos = db.pagos.filter(p => p.activo === false);
  if (!db.pagos.length) {
    return vacio(`<strong>Tus pagos fijos del mes</strong><br>Agrega tarjetas de crédito, luz, agua, internet, celular, colegio, alquiler…
      Te avisaré cuándo vence cada uno y al marcarlo como pagado se registra solo como gasto.`,
      `<button class="btn primary" data-action="nuevo-pago">Agregar tarjeta o servicio</button>`);
  }
  const estados = activos.map(p => estadoPago(p, ym)).sort((a, b) => a.p.dia - b.p.dia);
  const pagado = suma(estados.filter(e => e.pagado).map(e => enSoles(e.gasto)));
  const porPagar = suma(estados.filter(e => !e.pagado && e.p.monto).map(e => enSoles({ monto: e.p.monto, moneda: e.p.moneda })));
  const nPend = estados.filter(e => !e.pagado).length;

  return `${selectorMes(ym, 'mes-pagos')}
  <section class="card resumen dos">
    <div><p class="muted">Pagado</p><p class="cifra sm txt-ok">${soles(pagado)}</p></div>
    <div><p class="muted">Por pagar (estimado)</p><p class="cifra sm">${soles(porPagar)}</p><p class="muted small">${nPend} ${nPend === 1 ? 'pendiente' : 'pendientes'}</p></div>
  </section>
  <section class="card lista">${estados.map(filaPago).join('')}</section>
  ${inactivos.length ? `<details class="card"><summary>Pausados (${inactivos.length})</summary>
    ${inactivos.map(p => `<button class="fila fila-main" data-action="editar-pago" data-id="${p.id}"><span class="fila-titulo">${esc(p.nombre)}</span><span class="fila-sub">${esc(p.tipo)} · día ${p.dia}</span></button>`).join('')}
  </details>` : ''}`;
}

function vistaTareas() {
  const hechas = estado.filtroTareas === 'hechas';
  let lista = db.tareas.filter(t => !!t.hecha === hechas);
  if (estado.areaTareas !== 'Todas') lista = lista.filter(t => t.area === estado.areaTareas);
  lista = hechas
    ? lista.sort((a, b) => (b.hechaEn || '').localeCompare(a.hechaEn || '')).slice(0, 100)
    : tareasOrdenadas(lista);
  const nPend = db.tareas.filter(t => !t.hecha).length;
  const nHechas = db.tareas.length - nPend;

  return `<form id="fRapida" class="rapida" autocomplete="off">
    <input name="titulo" placeholder="Escribe un pendiente y presiona Enter" aria-label="Nuevo pendiente" enterkeyhint="done">
    <select name="area" aria-label="Área">${opciones(AREAS.map(a => [a, a]), estado.areaTareas !== 'Todas' ? estado.areaTareas : 'Hogar')}</select>
    <button class="btn primary" type="submit">Agregar</button>
  </form>
  <div class="filtros">
    <div class="seg pequeno">
      <button class="${!hechas ? 'on' : ''}" data-action="filtro-tareas" data-v="pendientes">Pendientes (${nPend})</button>
      <button class="${hechas ? 'on' : ''}" data-action="filtro-tareas" data-v="hechas">Hechas (${nHechas})</button>
    </div>
    <div class="chips scroll">${['Todas', ...AREAS].map(a => `<button class="chip-btn ${estado.areaTareas === a ? 'on' : ''}" data-action="area-tareas" data-v="${a}">${a}</button>`).join('')}</div>
  </div>
  ${lista.length ? `<section class="card lista">${lista.map(filaTarea).join('')}</section>`
    : vacio(hechas ? 'Aún no has completado pendientes aquí.' : '¡Nada pendiente aquí! 🎉')}`;
}

function vistaAjustes() {
  const a = db.ajustes;
  const n = { g: db.gastos.length, p: db.pagos.length, t: db.tareas.length };
  return `<form id="fAjustes" class="card form">
    <h3>Tipo de cambio</h3>
    <p class="muted small">Se usa para convertir gastos en dólares a soles. ${a.tcFecha ? 'Actualizado el ' + fechaCorta(a.tcFecha) + '.' : 'Aún no lo has actualizado.'}</p>
    <div class="fila-form">
      <label class="lbl">US$ 1 = S/<input name="tc" inputmode="decimal" value="${a.tc}" required></label>
      <button type="button" class="btn ghost" data-action="tc-internet">Consultar en internet</button>
    </div>
    <h3>Categorías de gastos</h3>
    <p class="muted small">Una por línea. Puedes agregar, quitar o reordenar.</p>
    <textarea name="categorias" rows="8">${esc(a.categorias.join('\n'))}</textarea>
    <div class="acciones"><span class="spacer"></span><button class="btn primary" type="submit">Guardar ajustes</button></div>
  </form>

  <section class="card form">
    <h3>Copia de seguridad</h3>
    <p class="muted small">Tus datos se guardan <strong>solo en este dispositivo</strong>. Descarga una copia con frecuencia
      (guárdala en Google Drive o en tu correo). También sirve para pasar tus datos de la laptop al celular.
      ${a.ultimoRespaldo ? 'Última copia: ' + fechaCorta(a.ultimoRespaldo) + '.' : ''}</p>
    <p class="small">${n.g} gastos · ${n.p} pagos fijos · ${n.t} pendientes</p>
    <div class="acciones">
      <button class="btn primary" data-action="exportar">Descargar copia</button>
      <button class="btn ghost" data-action="importar">Restaurar copia</button>
      <input type="file" id="archivoImportar" accept="application/json,.json" hidden>
    </div>
  </section>

  <section class="card form">
    <h3>Zona de cuidado</h3>
    <p class="muted small">Borra todos los datos de este dispositivo. Descarga una copia antes.</p>
    <div class="acciones"><button class="btn danger" data-action="borrar-todo">Borrar todo</button></div>
  </section>
  <p class="muted small centro">Mi Secretaria v${APP_VERSION}</p>`;
}

const VISTAS = {
  inicio: ['Inicio', vistaInicio],
  gastos: ['Gastos', vistaGastos],
  pagos: ['Pagos fijos', vistaPagos],
  tareas: ['Pendientes', vistaTareas],
  ajustes: ['Ajustes', vistaAjustes]
};

function render() {
  const [titulo, fn] = VISTAS[estado.tab];
  $('#titulo').textContent = titulo;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('activo', b.dataset.tab === estado.tab));
  $('#vista').innerHTML = fn();
  $('#fab').hidden = estado.tab === 'ajustes';
  $('#fabVoz').hidden = estado.tab === 'ajustes';
  $('#tcChip').textContent = `US$ 1 = S/ ${Number(db.ajustes.tc).toFixed(3)}`;
  if (estado.tab === 'gastos') renderListaGastos();
}

/* ---------- formularios ---------- */
function formMenu() {
  return `<h2>¿Qué quieres anotar?</h2>
  <div class="menu-grande">
    <button data-action="nuevo-gasto"><strong>Gasto</strong><span>Compras, mercado, pasajes…</span></button>
    <button data-action="nuevo-tarea"><strong>Pendiente</strong><span>Trabajo, tarea del hogar, encargo…</span></button>
    <button data-action="nuevo-pago"><strong>Pago fijo</strong><span>Tarjeta, luz, agua, internet…</span></button>
  </div>`;
}

function formGasto(g, defaults = {}) {
  const nuevo = !g;
  g = g || { monto: defaults.monto || '', moneda: defaults.moneda || 'PEN', categoria: defaults.categoria || ultimaCategoria(), nota: defaults.nota || '', fecha: defaults.fecha || hoyStr() };
  const notas = [...new Set(db.gastos.slice(-200).map(x => x.nota).filter(Boolean))].slice(-30);
  const pago = g.pagoId ? db.pagos.find(p => p.id === g.pagoId) : null;
  return `<h2>${nuevo ? 'Nuevo gasto' : 'Editar gasto'}</h2>
  <form id="fGasto" class="form" data-id="${nuevo ? '' : g.id}" autocomplete="off">
    <div class="monto-box">
      ${segmento('moneda', [['PEN', 'S/'], ['USD', 'US$']], g.moneda)}
      <input class="monto-input" name="monto" inputmode="decimal" placeholder="0.00" value="${g.monto}" required aria-label="Monto" data-autofocus>
    </div>
    <p class="muted small" id="equiv">&nbsp;</p>
    <span class="lbl">Categoría</span>
    ${chipsRadio('categoria', categorias(g.categoria).map(c => [c, c]), g.categoria)}
    <label class="lbl">Detalle (opcional)
      <input name="nota" value="${esc(g.nota)}" placeholder="Ej. mercado, recibo de luz" list="sugNotas">
    </label>
    <datalist id="sugNotas">${notas.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <label class="lbl">Fecha<input type="date" name="fecha" value="${g.fecha}" required></label>
    ${pago ? `<p class="muted small">Vinculado al pago fijo “${esc(pago.nombre)}”.</p>` : ''}
    <div class="acciones">
      ${nuevo ? '' : `<button type="button" class="btn danger-ghost" data-action="eliminar-gasto" data-id="${g.id}">Eliminar</button>`}
      <span class="spacer"></span>
      ${nuevo ? `<button type="submit" class="btn ghost" name="otro" value="1">Guardar y otro</button>` : ''}
      <button type="submit" class="btn primary">Guardar</button>
    </div>
  </form>`;
}

function formTarea(t, pre = {}) {
  const nuevo = !t;
  t = t || { titulo: '', area: estado.areaTareas !== 'Todas' ? estado.areaTareas : 'Hogar', fecha: '', prioridad: 'media', repetir: 'no', nota: '', ...pre };
  return `<h2>${nuevo ? 'Nuevo pendiente' : 'Editar pendiente'}</h2>
  <form id="fTarea" class="form" data-id="${nuevo ? '' : t.id}" autocomplete="off">
    <label class="lbl">¿Qué hay que hacer?<input name="titulo" value="${esc(t.titulo)}" required placeholder="Ej. Arreglar la ducha" data-autofocus></label>
    <span class="lbl">Área</span>
    ${chipsRadio('area', AREAS.map(a => [a, a]), t.area)}
    <span class="lbl">¿Para cuándo?</span>
    <div class="chips">
      <button type="button" class="chip-btn" data-action="fecha-rapida" data-v="0">Hoy</button>
      <button type="button" class="chip-btn" data-action="fecha-rapida" data-v="1">Mañana</button>
      <button type="button" class="chip-btn" data-action="fecha-rapida" data-v="sab">Este sábado</button>
      <button type="button" class="chip-btn" data-action="fecha-rapida" data-v="7">En una semana</button>
      <button type="button" class="chip-btn" data-action="fecha-rapida" data-v="">Sin fecha</button>
    </div>
    <input type="date" name="fecha" value="${t.fecha || ''}" aria-label="Fecha">
    <span class="lbl">Prioridad</span>
    ${segmento('prioridad', PRIORIDADES, t.prioridad || 'media')}
    <label class="lbl">Repetir<select name="repetir">${opciones(REPETIR, t.repetir || 'no')}</select></label>
    <label class="lbl">Notas (opcional)<textarea name="nota" rows="2">${esc(t.nota)}</textarea></label>
    <div class="acciones">
      ${nuevo ? '' : `<button type="button" class="btn danger-ghost" data-action="eliminar-tarea" data-id="${t.id}">Eliminar</button>`}
      <span class="spacer"></span>
      <button type="submit" class="btn primary">Guardar</button>
    </div>
  </form>`;
}

function formPago(p) {
  const nuevo = !p;
  p = p || { nombre: '', tipo: 'Tarjeta', dia: '', monto: '', moneda: 'PEN', categoria: '', nota: '', activo: true };
  return `<h2>${nuevo ? 'Nuevo pago fijo' : 'Editar pago fijo'}</h2>
  <form id="fPago" class="form" data-id="${nuevo ? '' : p.id}" autocomplete="off">
    <label class="lbl">Nombre<input name="nombre" value="${esc(p.nombre)}" required placeholder="Ej. Visa BCP, Luz del Sur, Internet" data-autofocus></label>
    <span class="lbl">Tipo</span>
    ${chipsRadio('tipo', TIPOS_PAGO.map(t => [t, t]), p.tipo)}
    <label class="lbl">Día de vencimiento (cada mes)<input name="dia" type="number" min="1" max="31" inputmode="numeric" value="${p.dia}" required placeholder="Ej. 15"></label>
    <span class="lbl">Monto aproximado (opcional)</span>
    <div class="monto-box chico">
      ${segmento('moneda', [['PEN', 'S/'], ['USD', 'US$']], p.moneda)}
      <input class="monto-input" name="monto" inputmode="decimal" placeholder="0.00" value="${p.monto || ''}" aria-label="Monto aproximado">
    </div>
    <label class="lbl">Categoría del gasto
      <select name="categoria"><option value="">Automática según el tipo</option>${opciones(categorias(p.categoria || undefined).map(c => [c, c]), p.categoria)}</select>
    </label>
    <label class="lbl">Nota (opcional)<input name="nota" value="${esc(p.nota)}" placeholder="Ej. fecha de corte el 28"></label>
    <p class="muted small">No guardes números completos de tarjeta ni claves aquí.</p>
    ${nuevo ? '' : `<label class="check-lbl"><input type="checkbox" name="activo" ${p.activo !== false ? 'checked' : ''}> Activo (desmarca para pausarlo)</label>`}
    <div class="acciones">
      ${nuevo ? '' : `<button type="button" class="btn danger-ghost" data-action="eliminar-pago" data-id="${p.id}">Eliminar</button>`}
      <span class="spacer"></span>
      <button type="submit" class="btn primary">Guardar</button>
    </div>
  </form>`;
}

function formPagar(p, ym, pre = {}) {
  const e = estadoPago(p, ym);
  return `<h2>Pagar ${esc(p.nombre)}</h2>
  <p class="muted">Vence el ${fechaLarga(e.vence).toLowerCase()}. Se registrará como gasto.</p>
  <form id="fPagar" class="form" data-id="${p.id}" data-ym="${ym}" autocomplete="off">
    <div class="monto-box">
      ${segmento('moneda', [['PEN', 'S/'], ['USD', 'US$']], pre.moneda || p.moneda || 'PEN')}
      <input class="monto-input" name="monto" inputmode="decimal" placeholder="0.00" value="${pre.monto || p.monto || ''}" required aria-label="Monto pagado" data-autofocus>
    </div>
    <p class="muted small" id="equiv">&nbsp;</p>
    <label class="lbl">Fecha de pago<input type="date" name="fecha" value="${pre.fecha || hoyStr()}" required></label>
    <div class="acciones"><span class="spacer"></span><button type="submit" class="btn primary">Marcar como pagado</button></div>
  </form>`;
}

/* ---------- guardar ---------- */
function guardarGasto(f, fd, submitter) {
  const monto = parseMonto(fd.monto);
  if (!(monto > 0)) { toast('Escribe un monto válido'); f.monto.focus(); return; }
  const ahora = new Date().toISOString();
  const datos = { monto, moneda: fd.moneda, categoria: fd.categoria || 'Otros', nota: (fd.nota || '').trim(), fecha: fd.fecha || hoyStr(), actualizado: ahora };
  const id = f.dataset.id;
  if (id) {
    const g = db.gastos.find(x => x.id === id);
    datos.tc = fd.moneda === 'USD' ? (g.moneda === 'USD' && g.tc ? g.tc : db.ajustes.tc) : undefined;
    Object.assign(g, datos);
  } else {
    datos.tc = fd.moneda === 'USD' ? db.ajustes.tc : undefined;
    db.gastos.push({ id: uid(), ...datos, creado: ahora });
  }
  guardar();
  toast(`Gasto de ${fmt(monto, fd.moneda)} guardado`);
  if (submitter && submitter.name === 'otro') abrirSheet(formGasto(null, { fecha: datos.fecha, categoria: datos.categoria, moneda: datos.moneda }));
  else cerrarSheet();
  render();
}

function guardarTarea(f, fd) {
  const titulo = (fd.titulo || '').trim();
  if (!titulo) return;
  const ahora = new Date().toISOString();
  const datos = { titulo, area: fd.area || 'Hogar', fecha: fd.fecha || '', prioridad: fd.prioridad || 'media', repetir: fd.repetir || 'no', nota: (fd.nota || '').trim(), actualizado: ahora };
  const id = f.dataset.id;
  if (id) Object.assign(db.tareas.find(t => t.id === id), datos);
  else db.tareas.push({ id: uid(), ...datos, hecha: false, creado: ahora });
  guardar();
  toast('Pendiente guardado');
  cerrarSheet();
  render();
}

function guardarPagoFijo(f, fd) {
  const dia = parseInt(fd.dia, 10);
  if (!(dia >= 1 && dia <= 31)) { toast('El día debe estar entre 1 y 31'); return; }
  const monto = fd.monto ? parseMonto(fd.monto) : 0;
  if (Number.isNaN(monto)) { toast('El monto no es válido'); return; }
  const ahora = new Date().toISOString();
  const datos = { nombre: fd.nombre.trim(), tipo: fd.tipo || 'Otro', dia, monto: monto || 0, moneda: fd.moneda || 'PEN', categoria: fd.categoria || '', nota: (fd.nota || '').trim(), actualizado: ahora };
  const id = f.dataset.id;
  if (id) Object.assign(db.pagos.find(p => p.id === id), datos, { activo: fd.activo === 'on' });
  else db.pagos.push({ id: uid(), ...datos, activo: true, pagados: {}, creado: ahora });
  guardar();
  toast('Pago fijo guardado');
  cerrarSheet();
  render();
}

function registrarPago(f, fd) {
  const p = db.pagos.find(x => x.id === f.dataset.id);
  const monto = parseMonto(fd.monto);
  if (!(monto > 0)) { toast('Escribe el monto pagado'); return; }
  const ahora = new Date().toISOString();
  const g = {
    id: uid(), monto, moneda: fd.moneda, tc: fd.moneda === 'USD' ? db.ajustes.tc : undefined,
    categoria: p.categoria || CATEGORIA_POR_TIPO[p.tipo] || 'Otros', nota: p.nombre, fecha: fd.fecha || hoyStr(),
    pagoId: p.id, creado: ahora, actualizado: ahora
  };
  db.gastos.push(g);
  p.pagados = p.pagados || {};
  p.pagados[f.dataset.ym] = g.id;
  guardar();
  toast(`${p.nombre} pagado ✓`);
  cerrarSheet();
  render();
}

function toggleTarea(id) {
  const t = db.tareas.find(x => x.id === id);
  const hoy = hoyStr();
  if (!t.hecha) {
    t.hecha = true; t.hechaEn = hoy;
    if (t.repetir && t.repetir !== 'no') {
      let f = t.fecha || hoy;
      const avanzar = s => t.repetir === 'diaria' ? sumarDias(s, 1) : t.repetir === 'semanal' ? sumarDias(s, 7) : sumarMesesFecha(s, 1);
      do { f = avanzar(f); } while (f <= hoy);
      const nueva = { ...t, id: uid(), fecha: f, hecha: false, hechaEn: null, creado: new Date().toISOString() };
      delete nueva.siguienteId;
      db.tareas.push(nueva);
      t.siguienteId = nueva.id;
      toast(`Hecho ✓ Se repite el ${fechaCorta(f)}`);
    } else toast('Hecho ✓');
  } else {
    t.hecha = false; t.hechaEn = null;
    if (t.siguienteId) {
      const sig = db.tareas.find(x => x.id === t.siguienteId);
      if (sig && !sig.hecha) db.tareas = db.tareas.filter(x => x.id !== sig.id);
      delete t.siguienteId;
    }
  }
  t.actualizado = new Date().toISOString();
  guardar();
  render();
}

/* ---------- entrada por voz ---------- */
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const NUM = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300,
  cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900
};
const PALNUM = Object.keys(NUM).sort((a, b) => b.length - a.length).join('|');
const MESES_RE = MESES.map(norm).join('|');
const DIAS_N = DIAS.map(norm);

const CLAVES_CATEGORIA = {
  'Mercado y comida': 'mercado supermercado comida almuerzo cena desayuno lonche pollo carne pescado verdura verduras fruta frutas pan abarrotes bodega plaza vea tottus metro wong makro restaurante menu delivery chifa polleria cafe leche huevos arroz',
  'Servicios': 'luz agua internet cable telefono celular gas sedapal enel claro movistar entel bitel recibo recarga plan',
  'Tarjetas': 'tarjeta visa mastercard credito bcp interbank bbva scotiabank diners amex cuota',
  'Transporte': 'taxi pasaje pasajes combi bus micro gasolina combustible grifo uber cabify didi indriver estacionamiento cochera peaje carro auto mecanico taller',
  'Salud': 'farmacia medicina medicinas medicamento doctor medico clinica consulta inkafarma mifarma boticas dentista analisis hospital seguro',
  'Educación': 'colegio pension universidad curso cursos libro libros utiles matricula academia instituto clases',
  'Hogar': 'ferreteria limpieza detergente mueble muebles reparacion gasfitero electricista alquiler departamento casa sodimac promart',
  'Ocio': 'cine netflix spotify disney salida juego juegos viaje cumpleanos regalo fiesta paseo hbo youtube',
  'Ropa': 'ropa zapatillas zapatos polo polos pantalon camisa casaca vestido saga ripley oechsle'
};
const CLAVES_AREA = {
  'Trabajo': 'trabajo oficina cliente clientes informe reunion jefe proyecto cotizacion presupuesto plano planos obra correo email propuesta factura entrega',
  'Familia': 'hijo hija hijos mama papa esposa esposo abuela abuelo suegra familia sobrino colegio cumpleanos',
  'Hogar': 'casa ducha limpiar lavar cocina bano jardin arreglar planchar refrigeradora lavadora foco cuarto sala techo pintar ordenar basura compras'
};
function buscarClave(n, mapa, permitidas) {
  let mejor = null, pos = Infinity;
  for (const [cat, palabras] of Object.entries(mapa)) {
    if (permitidas && !permitidas.includes(cat)) continue;
    for (const w of palabras.split(' ')) {
      const m = n.match(new RegExp(`\\b${w}\\b`));
      if (m && m.index < pos) { pos = m.index; mejor = cat; }
    }
  }
  return mejor;
}

// Texto que se va recortando: se busca en la versión sin tildes y se corta en el original
function crearTexto(texto) {
  const o = texto.normalize('NFC').replace(/(\d)([a-zA-Záéíóú])/g, '$1 $2').replace(/(s\/\.?|us\$|\$)\s*(?=\d)/gi, '$1 ');
  const t = { o, n: norm(o) };
  t.quitar = re => {
    const m = t.n.match(re);
    if (!m) return null;
    const ini = m.index, fin = m.index + m[0].length;
    t.o = t.o.slice(0, ini) + ' ' + t.o.slice(fin);
    t.n = t.n.slice(0, ini) + ' ' + t.n.slice(fin);
    return m;
  };
  return t;
}
function valorPalabras(txt) {
  let total = 0, cur = 0;
  for (const w of txt.split(/\s+/)) {
    if (w === 'y') continue;
    if (w === 'mil') { total += (cur || 1) * 1000; cur = 0; } else cur += NUM[w] || 0;
  }
  return total + cur;
}
function extraerMonto(t) {
  const re = new RegExp(`(?:\\b(?:por|de|a|en)\\s+)?(?:(s\\/\\.?|us\\$|\\$|usd)\\s*)?\\b(\\d{1,3}(?:[.,]\\d{3})+|\\d+(?:[.,]\\d{1,2})?|(?:${PALNUM}|mil)(?:\\s+(?:y\\s+)?(?:${PALNUM}|mil))*)\\b(?:\\s*(soles|sol|lucas|luca|dolares|dolar|usd|cocos))?\\b(?:\\s+con\\s+(\\d{1,2})\\b(?:\\s+centimos?)?)?`, 'g');
  const cands = [];
  for (const m of t.n.matchAll(re)) {
    const [, pre, num, suf, dec] = m;
    let val;
    if (/^\d{1,3}([.,]\d{3})+$/.test(num)) val = Number(num.replace(/[.,]/g, ''));
    else if (/^\d/.test(num)) val = Number(num.replace(',', '.'));
    else {
      if (/^(un|uno|una)$/.test(num) && !pre && !suf) continue;
      val = valorPalabras(num);
    }
    if (dec) val += Number(dec) / (dec.length === 1 ? 10 : 100);
    let moneda = null;
    if (pre) moneda = /^s/.test(pre) ? 'PEN' : 'USD';
    if (suf) moneda = /^(soles|sol|lucas|luca)$/.test(suf) ? 'PEN' : 'USD';
    const antes = t.n.slice(0, m.index + (m[0].match(/^(?:(?:por|de|a|en)\s+)/) || [''])[0].length);
    const despues = t.n.slice(m.index + m[0].length);
    const esFecha = !moneda && (/\b(el|dia|los|las|del|para el|hasta el|cada)\s*$/.test(antes) || new RegExp(`^\\s*(de|del)\\s+(${MESES_RE})\\b`).test(despues) || /^\s*(dias|semanas|meses|horas|am|pm)\b/.test(despues));
    cands.push({ val: Math.round(val * 100) / 100, moneda, ini: m.index, fin: m.index + m[0].length, esFecha });
  }
  const c = cands.find(x => x.moneda) || cands.find(x => !x.esFecha);
  if (!c) return null;
  t.o = t.o.slice(0, c.ini) + ' ' + t.o.slice(c.fin);
  t.n = t.n.slice(0, c.ini) + ' ' + t.n.slice(c.fin);
  return c;
}
function proximoDia(nombreDia, saltarHoy) {
  const hoy = new Date();
  let d = (DIAS_N.indexOf(nombreDia) - hoy.getDay() + 7) % 7;
  if (d === 0 && saltarHoy) d = 7;
  return sumarDias(hoyStr(), d);
}
function extraerFecha(t, paraGasto) {
  const hoy = hoyStr();
  let m;
  if (paraGasto) {
    if (t.quitar(/\b(?:el dia de |el )?anteayer\b|\bantes de ayer\b/)) return sumarDias(hoy, -2);
    if (t.quitar(/\b(?:el dia de )?ayer\b/)) return sumarDias(hoy, -1);
    t.quitar(/\b(?:el dia de )?hoy\b/);
    return hoy;
  }
  if (t.quitar(/\b(?:para |hasta )?pasado manana\b/)) return sumarDias(hoy, 2);
  if (t.quitar(/\b(?:para |hasta )?(?<!(?:en|por|de) la )manana\b/)) return sumarDias(hoy, 1);
  if (t.quitar(/\b(?:para |hasta )?(?:hoy|esta noche|esta tarde)\b/)) return hoy;
  if ((m = t.quitar(new RegExp(`\\b(?:para |hasta )?(?:el )?(\\d{1,2}) de (${MESES_RE})(?: del? (\\d{4}))?\\b`)))) {
    const mes = MESES.map(norm).indexOf(m[2]);
    let y = m[3] ? Number(m[3]) : new Date().getFullYear();
    let f = `${y}-${pad(mes + 1)}-${pad(Math.min(Number(m[1]), new Date(y, mes + 1, 0).getDate()))}`;
    if (!m[3] && f < hoy) { y++; f = `${y}-${pad(mes + 1)}-${pad(Number(m[1]))}`; }
    return f;
  }
  if ((m = t.quitar(new RegExp(`\\b(?:para |hasta )?(?:el |este |esta |el proximo |este proximo |el otro |el siguiente )?(${DIAS_N.join('|')})(?: que viene)?\\b`)))) {
    return proximoDia(m[1], /proximo|otro|siguiente|que viene/.test(m[0]));
  }
  if ((m = t.quitar(/\b(?:para |hasta )?el (?:dia )?(\d{1,2})\b/))) {
    const dia = Number(m[1]);
    if (dia >= 1 && dia <= 31) {
      let ym = mesStr(new Date());
      if (dia < new Date().getDate()) ym = sumarMes(ym, 1);
      const [y, mm] = ym.split('-').map(Number);
      return `${ym}-${pad(Math.min(dia, new Date(y, mm, 0).getDate()))}`;
    }
  }
  if ((m = t.quitar(/\ben (\d{1,3}) dias\b/))) return sumarDias(hoy, Number(m[1]));
  if (t.quitar(/\b(?:para |hasta )?(?:la )?(?:proxima|siguiente|otra) semana\b/)) return sumarDias(hoy, 7);
  if (t.quitar(/\b(?:para |hasta )?(?:este |el )?fin de semana\b/)) return proximoDia('sabado', false);
  if (t.quitar(/\b(?:para |hasta |a )?(?:el )?fin de mes\b/)) { const d = new Date(); return fechaStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
  if (t.quitar(/\b(?:para |hasta )?esta semana\b/)) return proximoDia('viernes', false);
  return '';
}
function limpiarFrase(s) {
  const STOP = 'de|del|en|por|para|el|la|los|las|un|una|y|que|al|a|es|con|o';
  let r = s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  let prev;
  do {
    prev = r;
    r = r.replace(new RegExp(`^(?:${STOP})(?:[\\s,]+|$)`, 'i'), '')
      .replace(new RegExp(`(?:^|[\\s,]+)(?:${STOP})$`, 'i'), '')
      .replace(/^[\s,.;:¿¡-]+|[\s,.;:?!-]+$/g, '');
  } while (r !== prev);
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : '';
}

const RE_TAREA = /\b(recuerdame|recordarme|recordar|recuerda|acuerdame|tengo que|tenemos que|hay que|debo|debemos|pendiente|tarea|no olvidar|no olvides|no me olvide|agendar|agenda|anota que|apunta que)\b/;
const RE_PAGO_VERBO = /\b(pague|he pagado|ya pague|pagado|cancele|pago de|pagar|abone)\b/;

// Devuelve el pago fijo mencionado. Con verbo de pago basta una palabra del nombre;
// sin él, deben aparecer todas (así "gasté 85 en luz" no se confunde con "Luz del Sur").
function buscarPagoFijo(n) {
  const conVerbo = RE_PAGO_VERBO.test(n);
  let mejor = null, puntos = 0;
  for (const p of db.pagos) {
    const palabras = norm(p.nombre).split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^(del|las|los|por|para|con)$/.test(w));
    const pts = palabras.filter(w => new RegExp(`\\b${w}\\b`).test(n)).length;
    if (!pts || (!conVerbo && pts < palabras.length)) continue;
    if (pts > puntos) { puntos = pts; mejor = p; }
  }
  return mejor;
}

function interpretar(texto, forzar) {
  const t = crearTexto(texto);
  const n0 = t.n;
  let tipo = forzar;
  const pago = buscarPagoFijo(n0);
  if (!tipo) {
    if (RE_TAREA.test(n0)) tipo = 'tarea';
    else if (pago && (RE_PAGO_VERBO.test(n0) || extraerMonto(crearTexto(texto)))) tipo = 'pagar';
    else if (extraerMonto(crearTexto(texto))) tipo = 'gasto';
    else if (/\b(gaste|compre|me costo|pague)\b/.test(n0)) tipo = 'gasto';
    else tipo = 'tarea';
  }
  if (tipo === 'pagar' && !pago) tipo = 'gasto';

  if (tipo === 'gasto' || tipo === 'pagar') {
    const monto = extraerMonto(t);
    const fecha = extraerFecha(t, true);
    while (t.quitar(/\b(?:hoy |ya )?(?:he gastado|gaste|gasto de|gasto|he pagado|pague|pago de|pago|compre|me costo|costo|me salio|salio|cancele|abone|registra(?:r)?|anota(?:r)?|apunta(?:r)?|un gasto(?: de)?)\b/)) { /* quitar todas */ }
    const datos = {
      monto: monto ? monto.val : '',
      moneda: monto && monto.moneda === 'USD' ? 'USD' : 'PEN',
      fecha
    };
    if (tipo === 'pagar') return { tipo, pago, datos };
    datos.categoria = buscarClave(n0, CLAVES_CATEGORIA, db.ajustes.categorias) || (db.ajustes.categorias.includes('Otros') ? 'Otros' : db.ajustes.categorias[0]);
    datos.nota = limpiarFrase(t.o).slice(0, 80);
    return { tipo: 'gasto', datos };
  }

  // Pendiente
  let repetir = 'no';
  if (t.quitar(/\b(?:todos los dias|cada dia|diariamente|a diario)\b/)) repetir = 'diaria';
  else if (t.quitar(/\b(?:cada mes|todos los meses|mensualmente)\b/)) repetir = 'mensual';
  else if (t.quitar(/\b(?:cada semana|todas las semanas|semanalmente)\b/)) repetir = 'semanal';
  let fecha = '';
  const diaFijo = t.quitar(new RegExp(`\\b(?:todos los|cada) (${DIAS_N.join('|')})s?\\b`));
  if (diaFijo) { repetir = 'semanal'; fecha = proximoDia(diaFijo[1], false); }
  if (!fecha) fecha = extraerFecha(t, false);
  if (repetir !== 'no' && !fecha) fecha = hoyStr();
  let prioridad = 'media';
  if (t.quitar(/\b(?:es |muy )*(?:urgente(?:mente)?|importante|prioridad alta|lo antes posible|cuanto antes|sin falta)\b/)) prioridad = 'alta';
  else if (t.quitar(/\b(?:sin apuro|cuando pueda|cuando se pueda|no es urgente|prioridad baja)\b/)) prioridad = 'baja';
  let prev;
  do {
    prev = t.n;
    t.quitar(/^\s*(?:oye|por favor|porfa|ok|bueno|claude|secretaria)?[\s,]*(?:recuerdame|recordarme|recuerda(?:me)?|acuerdame|no (?:me )?olvides(?: de)?|no olvidar|no me olvide(?: de)?|anota(?:r)?(?: que)?|apunta(?:r)?(?: que)?|agrega(?:r)?(?: una tarea| un pendiente)?|agendar|agenda|nueva tarea|nuevo pendiente|pendiente|tarea|tengo que|tenemos que|hay que|debo|debemos|que|de|para)\b[\s,:]*/);
  } while (t.n !== prev);
  const area = buscarClave(n0, CLAVES_AREA) || 'Personal';
  return { tipo: 'tarea', datos: { titulo: limpiarFrase(t.o).slice(0, 120), fecha, prioridad, repetir, area } };
}

function ecoVoz(texto, tipo) {
  const otros = [['gasto', 'Gasto'], ['tarea', 'Pendiente']].filter(([v]) => v !== tipo && !(tipo === 'pagar' && v === 'gasto'));
  return `<div class="voz-eco">
    <span>🎤 “${esc(texto)}”</span>
    <span class="small">¿Era otra cosa? ${otros.map(([v, l]) => `<button type="button" class="link" data-action="voz-como" data-tipo="${v}">${l}</button>`).join(' · ')}</span>
  </div>`;
}

function procesarVoz(texto, forzar) {
  texto = (texto || '').trim();
  if (!texto) { toast('No escuché nada. Intenta de nuevo.'); return; }
  detenerVoz();
  estado.vozTexto = texto;
  const r = interpretar(texto, forzar);
  if (r.tipo === 'pagar') {
    const ym = mesStr(new Date());
    const e = estadoPago(r.pago, ym);
    abrirSheet(ecoVoz(texto, 'pagar') + formPagar(r.pago, e.pagado ? sumarMes(ym, 1) : ym, r.datos));
  } else if (r.tipo === 'gasto') {
    abrirSheet(ecoVoz(texto, 'gasto') + formGasto(null, r.datos));
  } else {
    abrirSheet(ecoVoz(texto, 'tarea') + formTarea(null, r.datos));
  }
  const btn = $('#sheetBody button.primary[type=submit]');
  if (btn && (r.tipo === 'tarea' ? r.datos.titulo : r.datos.monto)) setTimeout(() => btn.focus(), 80);
}

const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
let reconocedor = null;
function detenerVoz() {
  if (reconocedor) { const r = reconocedor; reconocedor = null; try { r.abort(); } catch (e) { /* nada */ } }
}
function formVoz() {
  return `<h2>Dime qué anotar</h2>
  <form id="fVoz" class="form" autocomplete="off">
    <button type="button" class="voz-mic" id="vozMic" data-action="voz-reintentar" aria-label="Hablar">
      <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/></svg>
    </button>
    <p class="muted centro" id="vozEstado">${Reconocimiento ? 'Te escucho…' : 'Este navegador no permite dictar. Escribe la frase o usa el micrófono del teclado.'}</p>
    <textarea name="texto" id="vozTexto" rows="2" placeholder="O escríbelo aquí…"></textarea>
    <p class="small muted">Ejemplos: “Gasté 85 soles en luz” · “Ayer compré medicinas por 40 soles” · “Pagué la Visa 450” · “Recuérdame arreglar la ducha el sábado” · “Tengo que enviar el informe mañana, es urgente”</p>
    <div class="acciones">
      <span class="spacer"></span>
      <button type="submit" class="btn primary">Continuar</button>
    </div>
  </form>`;
}
function escuchar() {
  detenerVoz();
  if (!$('#fVoz')) abrirSheet(formVoz());
  if (!Reconocimiento) return;
  const mic = $('#vozMic'), est = $('#vozEstado'), area = $('#vozTexto');
  const r = new Reconocimiento();
  reconocedor = r;
  r.lang = 'es-PE';
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let final = '';
  mic.classList.add('escuchando');
  est.textContent = 'Te escucho…';
  area.value = '';
  r.onresult = e => {
    let txt = '';
    final = '';
    for (const res of e.results) { txt += res[0].transcript; if (res.isFinal) final += res[0].transcript; }
    area.value = txt;
  };
  r.onerror = e => {
    if (reconocedor !== r) return;
    const msj = {
      'not-allowed': 'Permite el uso del micrófono para esta app (ícono del candado o ajustes del sitio).',
      'service-not-allowed': 'Permite el uso del micrófono para esta app.',
      'no-speech': 'No te escuché. Toca el micrófono para intentar de nuevo.',
      'audio-capture': 'No se encontró un micrófono.',
      'network': 'El dictado necesita internet. Puedes escribir la frase.',
      'language-not-supported': 'Idioma no disponible; prueba de nuevo.'
    }[e.error] || 'No se pudo escuchar. Toca el micrófono para intentar de nuevo.';
    if (e.error === 'language-not-supported') r.lang = 'es-ES';
    est.textContent = msj;
  };
  r.onend = () => {
    if (reconocedor !== r) return;
    reconocedor = null;
    mic.classList.remove('escuchando');
    const texto = (final || area.value).trim();
    if (texto) { est.textContent = 'Entendido ✓'; setTimeout(() => { if ($('#fVoz')) procesarVoz(texto); }, 450); }
    else if (est.textContent === 'Te escucho…') est.textContent = 'No te escuché. Toca el micrófono para intentar de nuevo.';
  };
  try { r.start(); } catch (e) { mic.classList.remove('escuchando'); est.textContent = 'Toca el micrófono para hablar.'; reconocedor = null; }
}

/* ---------- descargas ---------- */
function descargarBlob(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- reporte en Excel ---------- */
function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve();
  return new Promise((ok, falla) => {
    const s = document.createElement('script');
    s.src = 'lib/exceljs.min.js';
    s.onload = ok;
    s.onerror = () => falla(new Error('No se pudo cargar ExcelJS'));
    document.head.appendChild(s);
  });
}

// periodo: 'AAAA-MM' (un mes) o 'AAAA' (un año)
async function descargarExcel(periodo) {
  toast('Preparando Excel…');
  try { await cargarExcelJS(); } catch (e) { toast('No se pudo preparar el Excel. Revisa tu conexión.'); return; }

  const esAnio = periodo.length === 4;
  const anterior = esAnio ? String(Number(periodo) - 1) : sumarMes(periodo, -1);
  const delPeriodo = per => db.gastos.filter(g => g.fecha.startsWith(per));
  const gastos = delPeriodo(periodo).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.creado || '').localeCompare(b.creado || ''));
  const gastosAnt = delPeriodo(anterior);
  const nombre = esAnio ? 'año ' + periodo : nombreMes(periodo);
  const nombreAnt = esAnio ? anterior : MESES[Number(anterior.slice(5)) - 1];
  const tc = db.ajustes.tc;

  const total = suma(gastos.map(enSoles));
  const totalAnt = suma(gastosAnt.map(enSoles));
  const hoy = hoyStr();
  let dias;
  if (esAnio) {
    const y = Number(periodo);
    dias = hoy.startsWith(periodo) ? diasEntre(`${periodo}-01-01`, hoy) + 1 : (new Date(y, 1, 29).getDate() === 29 ? 366 : 365);
  } else {
    const [y, m] = periodo.split('-').map(Number);
    dias = hoy.startsWith(periodo) ? Number(hoy.slice(8)) : new Date(y, m, 0).getDate();
  }

  const VERDE = 'FF0F766E', ZEBRA = 'FFF1F6F5', GRIS = 'FF5D6A66';
  const F_S = '"S/" #,##0.00', F_U = '"US$" #,##0.00', F_P = '0.0%', F_N = '0', F_TC = '0.000';
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Mi Secretaria';
  wb.created = new Date();

  /* Hoja 1: Resumen */
  const ws = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 18 }];
  const t = ws.addRow([`Reporte de gastos — ${nombre}`]);
  t.font = { bold: true, size: 16, color: { argb: VERDE } };
  ws.addRow([`Generado el ${fechaLarga(hoy).toLowerCase()} · Tipo de cambio: US$ 1 = S/ ${tc.toFixed(3)}`]).font = { color: { argb: GRIS } };
  ws.addRow([]);

  const kv = (etiqueta, valor, formato) => {
    const r = ws.addRow([etiqueta, valor]);
    r.getCell(1).font = { color: { argb: GRIS } };
    r.getCell(2).font = { bold: true };
    if (formato) r.getCell(2).numFmt = formato;
  };
  kv('Total gastado', total, F_S);
  kv('Equivalente en dólares', total / tc, F_U);
  kv('Número de registros', gastos.length, F_N);
  kv('Promedio por día', dias ? total / dias : 0, F_S);
  kv(`Total ${esAnio ? 'del año' : 'de'} ${nombreAnt}`, totalAnt, F_S);
  if (totalAnt > 0) kv('Variación frente al período anterior', (total - totalAnt) / totalAnt, '+0.0%;-0.0%;0.0%');

  function tabla(titulo, encabezados, filas, formatos, filaTotal) {
    ws.addRow([]);
    ws.addRow([titulo]).font = { bold: true, size: 12 };
    const h = ws.addRow(encabezados);
    h.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    });
    const inicio = h.number + 1;
    filas.forEach((f, i) => {
      const r = ws.addRow(f);
      formatos.forEach((fm, j) => { if (fm) r.getCell(j + 1).numFmt = fm; });
      if (i % 2) for (let j = 1; j <= encabezados.length; j++) r.getCell(j).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
    });
    if (filaTotal && filas.length) {
      const r = ws.addRow(filaTotal(inicio, inicio + filas.length - 1));
      r.font = { bold: true };
      formatos.forEach((fm, j) => { if (fm) r.getCell(j + 1).numFmt = fm; });
      for (let j = 1; j <= encabezados.length; j++) r.getCell(j).border = { top: { style: 'thin', color: { argb: VERDE } } };
    }
  }
  const sumaCol = (col, i, f, valor) => ({ formula: `SUM(${col}${i}:${col}${f})`, result: valor });

  // Por categoría
  const porCat = {}, porCatAnt = {}, nCat = {};
  gastos.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + enSoles(g); nCat[g.categoria] = (nCat[g.categoria] || 0) + 1; });
  gastosAnt.forEach(g => { porCatAnt[g.categoria] = (porCatAnt[g.categoria] || 0) + enSoles(g); });
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  tabla('Gastos por categoría',
    ['Categoría', 'Total (S/)', '% del total', 'Registros', `${capital(nombreAnt)} (S/)`],
    cats.map(([c, v]) => [c, v, total ? v / total : 0, nCat[c], porCatAnt[c] || 0]),
    [null, F_S, F_P, F_N, F_S],
    (i, f) => ['Total', sumaCol('B', i, f, total), total ? 1 : 0, sumaCol('D', i, f, gastos.length), sumaCol('E', i, f, suma(cats.map(([c]) => porCatAnt[c] || 0)))]);

  if (esAnio) {
    const filas = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `${periodo}-${pad(m)}`;
      const gm = delPeriodo(ym);
      filas.push([capital(MESES[m - 1]), suma(gm.map(enSoles)), gm.length]);
    }
    tabla('Gastos por mes', ['Mes', 'Total (S/)', 'Registros'], filas, [null, F_S, F_N],
      (i, f) => ['Total', sumaCol('B', i, f, total), sumaCol('C', i, f, gastos.length)]);
  } else {
    const pagos = db.pagos.filter(p => p.activo !== false || (p.pagados && p.pagados[periodo]))
      .map(p => estadoPago(p, periodo)).sort((a, b) => a.p.dia - b.p.dia);
    if (pagos.length) {
      const pagado = suma(pagos.filter(e => e.pagado).map(e => enSoles(e.gasto)));
      tabla('Pagos fijos del mes', ['Pago', 'Vence', 'Estado', 'Tipo', 'Monto pagado (S/)'],
        pagos.map(e => [e.p.nombre, fechaCorta(e.vence), e.pagado ? 'Pagado' : 'Pendiente', e.p.tipo, e.pagado ? enSoles(e.gasto) : null]),
        [null, null, null, null, F_S],
        (i, f) => ['Total pagado', '', '', '', sumaCol('E', i, f, pagado)]);
    }
  }

  /* Hoja 2: Detalle */
  const wd = wb.addWorksheet('Detalle', { views: [{ state: 'frozen', ySplit: 1 }] });
  wd.columns = [
    { header: 'Fecha', key: 'fecha', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Categoría', key: 'categoria', width: 20 },
    { header: 'Detalle', key: 'nota', width: 32 },
    { header: 'Moneda', key: 'moneda', width: 9 },
    { header: 'Monto original', key: 'monto', width: 16 },
    { header: 'Tipo de cambio', key: 'tc', width: 15, style: { numFmt: F_TC } },
    { header: 'Monto en S/', key: 'soles', width: 15, style: { numFmt: F_S } },
    { header: 'Pago fijo', key: 'fijo', width: 10 }
  ];
  wd.getRow(1).eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
  });
  gastos.forEach(g => {
    const [y, m, d] = g.fecha.split('-').map(Number);
    const r = wd.addRow({
      fecha: new Date(Date.UTC(y, m - 1, d)),
      categoria: g.categoria, nota: g.nota || '', moneda: g.moneda === 'USD' ? 'US$' : 'S/',
      monto: g.monto, tc: g.moneda === 'USD' ? (g.tc || tc) : null, soles: enSoles(g), fijo: g.pagoId ? 'Sí' : ''
    });
    r.getCell('monto').numFmt = g.moneda === 'USD' ? F_U : F_S;
  });
  if (gastos.length) {
    const fin = gastos.length + 1;
    wd.autoFilter = { from: 'A1', to: `H${fin}` };
    const r = wd.addRow({ categoria: 'Total', soles: { formula: `SUBTOTAL(9,G2:G${fin})`, result: total } });
    r.font = { bold: true };
    r.getCell('soles').numFmt = F_S;
    r.eachCell({ includeEmpty: true }, c => { c.border = { top: { style: 'thin', color: { argb: VERDE } } }; });
  }

  const buf = await wb.xlsx.writeBuffer();
  descargarBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `Gastos-${periodo}.xlsx`);
  if (!esAnio && sumarMes(mesStr(new Date()), -1) === periodo) { db.ajustes.reporteAvisado = periodo; guardar(); render(); }
  toast(`Reporte de ${nombre} descargado`);
}

/* ---------- respaldo ---------- */
function exportar() {
  db.ajustes.ultimoRespaldo = hoyStr();
  guardar();
  const blob = new Blob([JSON.stringify({ app: 'mi-secretaria', exportado: new Date().toISOString(), datos: db }, null, 2)], { type: 'application/json' });
  descargarBlob(blob, `mi-secretaria-respaldo-${hoyStr()}.json`);
  toast('Copia descargada');
  render();
}
function importar(archivo) {
  const lector = new FileReader();
  lector.onload = () => {
    try {
      const j = JSON.parse(lector.result);
      const datos = j.datos || j;
      if (!Array.isArray(datos.gastos) || !Array.isArray(datos.tareas) || !Array.isArray(datos.pagos)) throw new Error('formato');
      const resumen = `${datos.gastos.length} gastos, ${datos.pagos.length} pagos fijos y ${datos.tareas.length} pendientes`;
      if (!confirm(`La copia tiene ${resumen}.\n\nEsto REEMPLAZA todos los datos actuales de este dispositivo. ¿Continuar?`)) return;
      db = normalizar(datos);
      guardar();
      toast('Datos restaurados');
      render();
    } catch (e) { alert('El archivo no es una copia válida de Mi Secretaria.'); }
  };
  lector.readAsText(archivo);
}

async function tcInternet() {
  toast('Consultando…');
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const j = await r.json();
    const v = j && j.rates && j.rates.PEN;
    if (!v) throw new Error('sin dato');
    db.ajustes.tc = Math.round(v * 1000) / 1000;
    db.ajustes.tcFecha = hoyStr();
    guardar();
    toast(`Tipo de cambio: S/ ${db.ajustes.tc.toFixed(3)}`);
    render();
  } catch (e) { toast('No se pudo consultar. Escríbelo a mano.'); }
}

/* ---------- hoja inferior (formularios) ---------- */
const sheet = $('#sheet');
function abrirSheet(html) {
  $('#sheetBody').innerHTML = html;
  const yaAbierta = !sheet.hidden;
  sheet.hidden = false;
  document.body.classList.add('sin-scroll');
  if (!yaAbierta) history.pushState({ sheet: true }, '');
  actualizarEquiv();
  const foco = $('#sheetBody [data-autofocus]');
  if (foco) setTimeout(() => foco.focus(), 50);
}
function cerrarSheet(desdeHistorial) {
  detenerVoz();
  if (sheet.hidden) return;
  sheet.hidden = true;
  $('#sheetBody').innerHTML = '';
  document.body.classList.remove('sin-scroll');
  if (!desdeHistorial && history.state && history.state.sheet) history.back();
}
window.addEventListener('popstate', () => cerrarSheet(true));

function actualizarEquiv() {
  const f = $('#sheetBody form');
  const el = $('#equiv');
  if (!f || !el || !f.monto) return;
  const m = parseMonto(f.monto.value);
  const moneda = (f.querySelector('input[name=moneda]:checked') || {}).value;
  el.innerHTML = m > 0 ? (moneda === 'USD' ? `≈ ${soles(m * db.ajustes.tc)}` : `≈ ${dolares(m / db.ajustes.tc)}`) : '&nbsp;';
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  if (e.target === sheet) { cerrarSheet(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id, ym } = el.dataset;
  switch (action) {
    case 'tab':
      estado.tab = el.dataset.tab; estado.busqueda = '';
      render(); window.scrollTo(0, 0); break;
    case 'fab': {
      const porTab = { inicio: formMenu, gastos: () => formGasto(), pagos: () => formPago(), tareas: () => formTarea() };
      abrirSheet((porTab[estado.tab] || formMenu)()); break;
    }
    case 'cerrar': cerrarSheet(); break;
    case 'nuevo-gasto': abrirSheet(formGasto()); break;
    case 'nuevo-tarea': abrirSheet(formTarea()); break;
    case 'nuevo-pago': abrirSheet(formPago()); break;
    case 'editar-gasto': abrirSheet(formGasto(db.gastos.find(g => g.id === id))); break;
    case 'editar-tarea': abrirSheet(formTarea(db.tareas.find(t => t.id === id))); break;
    case 'editar-pago': abrirSheet(formPago(db.pagos.find(p => p.id === id))); break;
    case 'pagar': abrirSheet(formPagar(db.pagos.find(p => p.id === id), ym)); break;
    case 'deshacer-pago': {
      const p = db.pagos.find(x => x.id === id);
      if (!confirm(`¿Desmarcar el pago de ${p.nombre}? También se borrará el gasto registrado.`)) return;
      const gid = p.pagados[ym];
      db.gastos = db.gastos.filter(g => g.id !== gid);
      delete p.pagados[ym];
      guardar(); render(); break;
    }
    case 'toggle-tarea': toggleTarea(id); break;
    case 'eliminar-gasto': {
      if (!confirm('¿Eliminar este gasto?')) return;
      const g = db.gastos.find(x => x.id === id);
      if (g && g.pagoId) {
        const p = db.pagos.find(x => x.id === g.pagoId);
        if (p && p.pagados) Object.keys(p.pagados).forEach(k => { if (p.pagados[k] === id) delete p.pagados[k]; });
      }
      db.gastos = db.gastos.filter(x => x.id !== id);
      guardar(); cerrarSheet(); toast('Gasto eliminado'); render(); break;
    }
    case 'eliminar-tarea':
      if (!confirm('¿Eliminar este pendiente?')) return;
      db.tareas = db.tareas.filter(x => x.id !== id);
      guardar(); cerrarSheet(); toast('Pendiente eliminado'); render(); break;
    case 'eliminar-pago':
      if (!confirm('¿Eliminar este pago fijo? Los gastos ya registrados se conservan.')) return;
      db.pagos = db.pagos.filter(x => x.id !== id);
      db.gastos.forEach(g => { if (g.pagoId === id) delete g.pagoId; });
      guardar(); cerrarSheet(); toast('Pago fijo eliminado'); render(); break;
    case 'mes-gastos': estado.mesGastos = sumarMes(estado.mesGastos, Number(el.dataset.delta)); estado.busqueda = ''; render(); break;
    case 'mes-pagos': estado.mesPagos = sumarMes(estado.mesPagos, Number(el.dataset.delta)); render(); break;
    case 'filtro-tareas': estado.filtroTareas = el.dataset.v; render(); break;
    case 'area-tareas': estado.areaTareas = el.dataset.v; render(); break;
    case 'fecha-rapida': {
      const v = el.dataset.v;
      let f = '';
      if (v === 'sab') { const d = new Date(); f = sumarDias(hoyStr(), ((6 - d.getDay()) + 7) % 7 || 7); }
      else if (v !== '') f = sumarDias(hoyStr(), Number(v));
      el.closest('form').fecha.value = f; break;
    }
    case 'exportar': exportar(); break;
    case 'voz': case 'voz-reintentar': escuchar(); break;
    case 'voz-como': procesarVoz(estado.vozTexto, el.dataset.tipo); break;
    case 'excel': descargarExcel(el.dataset.periodo); break;
    case 'omitir-reporte': db.ajustes.reporteAvisado = el.dataset.periodo; guardar(); render(); break;
    case 'importar': $('#archivoImportar').click(); break;
    case 'tc-internet': tcInternet(); break;
    case 'borrar-todo':
      if (!confirm('¿Borrar TODOS los datos de este dispositivo?')) return;
      if (prompt('Escribe BORRAR para confirmar') !== 'BORRAR') return;
      db = nuevoDb(); guardar(); toast('Datos borrados'); estado.tab = 'inicio'; render(); break;
  }
});

document.addEventListener('submit', e => {
  const f = e.target;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(f));
  switch (f.id) {
    case 'fGasto': guardarGasto(f, fd, e.submitter); break;
    case 'fTarea': guardarTarea(f, fd); break;
    case 'fPago': guardarPagoFijo(f, fd); break;
    case 'fPagar': registrarPago(f, fd); break;
    case 'fVoz': procesarVoz(fd.texto); break;
    case 'fRapida': {
      const titulo = (fd.titulo || '').trim();
      if (!titulo) return;
      const ahora = new Date().toISOString();
      db.tareas.push({ id: uid(), titulo, area: fd.area, fecha: '', prioridad: 'media', repetir: 'no', nota: '', hecha: false, creado: ahora, actualizado: ahora });
      guardar(); estado.filtroTareas = 'pendientes'; render();
      $('#fRapida input[name=titulo]').focus();
      toast('Pendiente agregado'); break;
    }
    case 'fAjustes': {
      const tc = parseMonto(fd.tc);
      if (!(tc > 0)) { toast('Tipo de cambio no válido'); return; }
      if (tc !== db.ajustes.tc) { db.ajustes.tc = tc; db.ajustes.tcFecha = hoyStr(); }
      const cats = [...new Set(fd.categorias.split('\n').map(s => s.trim()).filter(Boolean))];
      db.ajustes.categorias = cats.length ? cats : [...CATEGORIAS_BASE];
      guardar(); toast('Ajustes guardados'); render(); break;
    }
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'buscar') { estado.busqueda = e.target.value; renderListaGastos(); }
  if (e.target.closest('#sheetBody form')) actualizarEquiv();
});
document.addEventListener('change', e => {
  if (e.target.id === 'archivoImportar' && e.target.files[0]) { importar(e.target.files[0]); e.target.value = ''; }
  if (e.target.closest('#sheetBody form')) actualizarEquiv();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') cerrarSheet();
  if (e.key === 'Enter' && e.target.matches('.card.resumen[data-action]')) e.target.click();
});

/* ---------- inicio ---------- */
render();
(() => {
  const accion = new URLSearchParams(location.search).get('accion');
  if (!accion) return;
  history.replaceState(null, '', location.pathname);
  if (accion === 'voz') escuchar();
  else if (accion === 'gasto') abrirSheet(formGasto());
  else if (accion === 'tarea') abrirSheet(formTarea());
})();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Al volver a la app otro día, refrescar fechas
document.addEventListener('visibilitychange', () => { if (!document.hidden && sheet.hidden) render(); });
