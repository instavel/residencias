/**
 * Residências da Instável — Instável – Centro Coreográfico
 * Motor (Google Apps Script) ligado ao Google Calendar onde ficam as reservas dos estúdios.
 *
 * Como funciona a disponibilidade:
 *  - Há CAPACITY estúdios (2). Cada evento no calendário ocupa UM estúdio.
 *  - Um horário está disponível enquanto houver menos de CAPACITY eventos ao mesmo tempo.
 *  - Contam todos os eventos do calendário: as reservas já marcadas à mão pela equipa,
 *    os pedidos pendentes (amarelo) e as reservas aprovadas (verde).
 *
 * Idiomas: a página pública e os e-mails para quem reserva existem em português e inglês.
 * Os e-mails e a página da equipa são sempre em português.
 */

// ============ CONFIGURAÇÃO (alterar aqui) ============
const CONFIG = {
  CALENDAR_ID: 'faicc.program@gmail.com',           // calendário Google onde ficam as reservas
  TEAM_EMAIL: 'palcosinstaveis@gmail.com',          // recebe os avisos de novos pedidos e as respostas das pessoas
  PROJECT_NAME: 'Residências da Instável',          // nome que aparece como remetente dos e-mails
  ORG_NAME: 'Instável – Centro Coreográfico',
  SITE_URL: 'https://palcosinstaveis.github.io/residencias-lugar-instavel/',
  CAPACITY: 2,                // número de estúdios = grupos em simultâneo
  EVENT_TITLE_PREFIX: 'Reserva estúdio', // título no calendário: "Reserva estúdio / Nome da pessoa"
  OPEN_HOUR: 7,               // abre às 7h
  CLOSE_HOUR: 23,             // fecha às 23h
  MAX_HOURS_PER_DAY: 10,      // máximo de horas por dia
  MAX_DAYS_PER_REQUEST: 15,   // máximo de dias por pedido
  STEP_MINUTES: 30,           // horários de meia em meia hora
  MAX_MONTHS_AHEAD: 6,        // até quantos meses à frente se pode reservar
  // Manual de regras de utilização, anexado ao e-mail de confirmação.
  // Colar o ID do ficheiro no Google Drive (ver guia). Deixar '' para não anexar.
  // Se não houver versão em inglês, as pessoas que reservam em inglês recebem a portuguesa.
  MANUAL_FILE_ID_PT: '',
  MANUAL_FILE_ID_EN: ''
};
// A senha da página de aprovação NÃO fica aqui: guarda-se em
// Definições do projeto > Propriedades do script > ADMIN_PASSWORD
// ======================================================

const COLOR_PENDING = CalendarApp.EventColor.YELLOW;
const COLOR_APPROVED = CalendarApp.EventColor.GREEN;

// ------------------ Textos (PT / EN) ------------------
const DATES = {
  pt: { wd: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], mo: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] },
  en: { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], mo: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }
};

const MSG = {
  pt: {
    generic: 'Ocorreu um erro inesperado. Tenta novamente ou contacta a equipa.',
    fill: 'Preenche nome, e-mail, contacto telefónico e equipa.',
    email: 'O e-mail não parece válido.',
    pickDay: 'Escolhe pelo menos um dia.',
    maxDays: function (n) { return 'Cada pedido pode ter no máximo ' + n + ' dias.'; },
    badSlot: 'Há um dia ou horário inválido no pedido.',
    dup: function (d) { return 'O dia ' + d + ' aparece repetido.'; },
    step: function (n) { return 'Os horários têm de ser de ' + n + ' em ' + n + ' minutos.'; },
    hours: function (d, o, c) { return 'Em ' + d + ': o horário tem de estar entre as ' + o + 'h e as ' + c + 'h.'; },
    maxH: function (d, h) { return 'Em ' + d + ': máximo de ' + h + ' horas por dia.'; },
    past: function (d) { return 'O horário de ' + d + ' já passou.'; },
    ahead: function (m) { return 'Só é possível reservar até ' + m + ' meses de antecedência.'; },
    full: function (l) { return 'Entretanto deixou de haver estúdio livre em: ' + l + '. Atualiza a página e escolhe outro horário.'; },
    cancelBad: 'Link de cancelamento inválido.',
    cancelGone: 'Este pedido já não existe ou já foi cancelado.',
    // e-mails para quem reserva
    hello: function (n) { return 'Olá ' + n + ','; },
    subjReceived: 'Pedido de reserva de estúdio recebido',
    bodyReceived: 'Recebemos o teu pedido de reserva de estúdio para os seguintes dias:',
    pending: 'O pedido está <b>pendente de aprovação</b> pela equipa da Instável. Receberás um novo e-mail quando for aprovado.',
    cancelLink: function (u) { return 'Se já não precisares destes horários, podes <a href="' + u + '">cancelar o pedido aqui</a>.'; },
    thanks: 'Obrigado,',
    subjApproved: 'Reserva de estúdio confirmada',
    bodyApproved: 'A tua reserva de estúdio foi <b>aprovada</b> para os seguintes dias:',
    manual: 'Em anexo segue o <b>manual de regras de utilização</b> dos estúdios da Instável. Pedimos que o leias com atenção antes da tua residência.',
    teamOnly: 'Lembramos que só as pessoas indicadas no pedido poderão entrar no estúdio.',
    changes: function (m) { return '<b>Nota:</b> se algo se alterar (dias, horários ou equipa), entra em contacto com a nossa equipa através de ' + m + '.'; },
    seeYou: 'Até breve,',
    subjRejected: 'Pedido de reserva de estúdio não aprovado',
    bodyRejected: 'Lamentamos, mas o teu pedido de reserva de estúdio para os dias abaixo não pôde ser aprovado:',
    subjCancelled: 'Reserva de estúdio cancelada',
    bodyCancelledTeam: 'A tua reserva de estúdio para os dias abaixo foi cancelada:',
    bodyCancelledSelf: 'Confirmamos o cancelamento da tua reserva de estúdio para:',
    reason: 'Motivo',
    questions: function (m) { return 'Para qualquer dúvida, contacta-nos através de ' + m + '.'; }
  },
  en: {
    generic: 'An unexpected error occurred. Please try again or contact the team.',
    fill: 'Please fill in name, e-mail, phone number and team.',
    email: 'The e-mail address does not seem valid.',
    pickDay: 'Please choose at least one day.',
    maxDays: function (n) { return 'Each request can include at most ' + n + ' days.'; },
    badSlot: 'There is an invalid day or time in the request.',
    dup: function (d) { return 'The day ' + d + ' appears twice.'; },
    step: function (n) { return 'Times must be in ' + n + '-minute steps.'; },
    hours: function (d, o, c) { return 'On ' + d + ': times must be between ' + o + ':00 and ' + c + ':00.'; },
    maxH: function (d, h) { return 'On ' + d + ': maximum of ' + h + ' hours per day.'; },
    past: function (d) { return 'The time on ' + d + ' has already passed.'; },
    ahead: function (m) { return 'Bookings can only be made up to ' + m + ' months in advance.'; },
    full: function (l) { return 'There is no longer a studio available on: ' + l + '. Please refresh the page and choose another time.'; },
    cancelBad: 'Invalid cancellation link.',
    cancelGone: 'This request no longer exists or has already been cancelled.',
    hello: function (n) { return 'Hello ' + n + ','; },
    subjReceived: 'Studio booking request received',
    bodyReceived: 'We have received your studio booking request for the following days:',
    pending: 'Your request is <b>pending approval</b> by the Instável team. You will receive another e-mail once it has been approved.',
    cancelLink: function (u) { return 'If you no longer need these times, you can <a href="' + u + '">cancel your request here</a>.'; },
    thanks: 'Thank you,',
    subjApproved: 'Studio booking confirmed',
    bodyApproved: 'Your studio booking has been <b>approved</b> for the following days:',
    manual: 'Please find attached the <b>studio rules and guidelines</b> of Instável. We kindly ask you to read them carefully before your residency.',
    teamOnly: 'Please note that only the people listed in your request will be allowed into the studio.',
    changes: function (m) { return '<b>Note:</b> if anything changes (days, times or team), please contact our team at ' + m + '.'; },
    seeYou: 'See you soon,',
    subjRejected: 'Studio booking request not approved',
    bodyRejected: 'We are sorry, but your studio booking request for the days below could not be approved:',
    subjCancelled: 'Studio booking cancelled',
    bodyCancelledTeam: 'Your studio booking for the days below has been cancelled:',
    bodyCancelledSelf: 'We confirm the cancellation of your studio booking for:',
    reason: 'Reason',
    questions: function (m) { return 'If you have any questions, please contact us at ' + m + '.'; }
  }
};

let LANG = 'pt'; // idioma do pedido em curso (pt/en)
function lang_(l) { return l === 'en' ? 'en' : 'pt'; }
function M_(l) { return MSG[lang_(l || LANG)]; }

// ------------------ Entradas da web ------------------
function doGet(e) {
  return handle_(function () {
    const p = (e && e.parameter) || {};
    LANG = lang_(p.lang);
    if (p.action === 'availability') return availability_(p.from, p.to);
    if (p.action === 'config') return { ok: true, config: publicConfig_() };
    throw userError_('Ação desconhecida.');
  });
}

function doPost(e) {
  return handle_(function () {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    LANG = lang_(body.lang);
    switch (body.action) {
      case 'request': return createRequest_(body);
      case 'cancel': return cancelByRequester_(body.requestId, body.token);
      case 'adminList': LANG = 'pt'; checkPassword_(body.password); return adminList_();
      case 'approve': LANG = 'pt'; checkPassword_(body.password); return approve_(body.requestId);
      case 'reject': LANG = 'pt'; checkPassword_(body.password); return reject_(body.requestId, body.reason);
      default: throw userError_('Ação desconhecida.');
    }
  });
}

function handle_(fn) {
  let out;
  try {
    out = fn();
  } catch (err) {
    out = { ok: false, error: err.userMessage || M_().generic };
    if (!err.userMessage) console.error(err && err.stack ? err.stack : err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function userError_(msg) { const e = new Error(msg); e.userMessage = msg; return e; }

function publicConfig_() {
  return {
    capacity: CONFIG.CAPACITY,
    openHour: CONFIG.OPEN_HOUR, closeHour: CONFIG.CLOSE_HOUR,
    maxHoursPerDay: CONFIG.MAX_HOURS_PER_DAY, maxDaysPerRequest: CONFIG.MAX_DAYS_PER_REQUEST,
    stepMinutes: CONFIG.STEP_MINUTES, maxMonthsAhead: CONFIG.MAX_MONTHS_AHEAD
  };
}

// ------------------ Disponibilidade ------------------
// Devolve, para cada dia, os períodos ocupados por cada evento (em minutos desde a meia-noite).
// Não devolve nomes nem detalhes dos eventos.
function availability_(fromStr, toStr) {
  const from = parseDate_(fromStr), to = parseDate_(toStr);
  if (!from || !to || to < from) throw userError_(M_().badSlot);
  if ((to - from) / 86400000 > 62) throw userError_(M_().badSlot);
  const byDay = eventsByDay_(from, addDays_(to, 1));
  const days = {};
  Object.keys(byDay).forEach(function (k) { days[k] = byDay[k].map(function (x) { return x.iv; }); });
  return { ok: true, days: days, config: publicConfig_() };
}

// Agrupa os eventos do calendário por dia: { 'AAAA-MM-DD': [{ev, id, title, iv:[ini,fim]}] }
function eventsByDay_(from, end) {
  const events = calendar_().getEvents(from, end);
  const out = {};
  for (let d = from; d < end; d = addDays_(d, 1)) out[fmtKey_(d)] = [];
  events.forEach(function (ev) {
    const s = ev.getStartTime(), e = ev.getEndTime();
    for (let d = from; d < end; d = addDays_(d, 1)) {
      const iv = clipToDay_(s, e, d);
      if (iv) out[fmtKey_(d)].push({ ev: ev, id: ev.getTag('requestId'), title: ev.getTitle(), iv: iv });
    }
  });
  return out;
}

// Recorta um evento ao horário de abertura de um dia: [início, fim] em minutos.
function clipToDay_(evStart, evEnd, day) {
  const open = atTime_(day, CONFIG.OPEN_HOUR * 60);
  const close = atTime_(day, CONFIG.CLOSE_HOUR * 60);
  const s = evStart > open ? evStart : open;
  const e = evEnd < close ? evEnd : close;
  if (s >= e) return null;
  const sm = (s.getTime() === open.getTime()) ? CONFIG.OPEN_HOUR * 60 : s.getHours() * 60 + s.getMinutes();
  const em = (e.getTime() === close.getTime()) ? CONFIG.CLOSE_HOUR * 60 : e.getHours() * 60 + e.getMinutes();
  return [sm, em];
}

// Número máximo de eventos em simultâneo entre a e b (minutos), verificado de meia em meia hora.
function maxOverlap_(intervals, a, b) {
  let max = 0;
  for (let t = a; t < b; t += CONFIG.STEP_MINUTES) {
    const t2 = Math.min(t + CONFIG.STEP_MINUTES, b);
    let n = 0;
    intervals.forEach(function (iv) { if (iv[0] < t2 && iv[1] > t) n++; });
    if (n > max) max = n;
  }
  return max;
}

// ------------------ Novo pedido ------------------
function createRequest_(b) {
  const L = M_();
  const name = clean_(b.name, 120), email = clean_(b.email, 160).toLowerCase(),
        phone = clean_(b.phone, 40), team = clean_(b.team, 1000), notes = clean_(b.notes, 1000);
  if (!name || !email || !phone || !team) throw userError_(L.fill);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw userError_(L.email);

  const slots = Array.isArray(b.slots) ? b.slots : [];
  if (!slots.length) throw userError_(L.pickDay);
  if (slots.length > CONFIG.MAX_DAYS_PER_REQUEST) throw userError_(L.maxDays(CONFIG.MAX_DAYS_PER_REQUEST));

  const now = new Date();
  const limit = addMonths_(today_(), CONFIG.MAX_MONTHS_AHEAD);
  const seen = {};
  const parsed = slots.map(function (s) {
    const d = parseDate_(s.date), sm = parseTime_(s.start), em = parseTime_(s.end);
    if (!d || sm === null || em === null) throw userError_(L.badSlot);
    const dh = fmtHuman_(d);
    if (seen[s.date]) throw userError_(L.dup(dh));
    seen[s.date] = true;
    if (sm % CONFIG.STEP_MINUTES || em % CONFIG.STEP_MINUTES) throw userError_(L.step(CONFIG.STEP_MINUTES));
    if (sm < CONFIG.OPEN_HOUR * 60 || em > CONFIG.CLOSE_HOUR * 60 || sm >= em) throw userError_(L.hours(dh, CONFIG.OPEN_HOUR, CONFIG.CLOSE_HOUR));
    if (em - sm > CONFIG.MAX_HOURS_PER_DAY * 60) throw userError_(L.maxH(dh, CONFIG.MAX_HOURS_PER_DAY));
    const start = atTime_(d, sm), end = atTime_(d, em);
    if (start <= now) throw userError_(L.past(dh));
    if (d > limit) throw userError_(L.ahead(CONFIG.MAX_MONTHS_AHEAD));
    return { date: s.date, day: d, sm: sm, em: em, start: start, end: end };
  }).sort(function (a, b) { return a.start - b.start; });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cal = calendar_();
    const conflicts = parsed.filter(function (s) {
      const ivs = (eventsByDay_(s.day, addDays_(s.day, 1))[s.date] || []).map(function (x) { return x.iv; });
      return maxOverlap_(ivs, s.sm, s.em) >= CONFIG.CAPACITY;
    });
    if (conflicts.length) throw userError_(L.full(conflicts.map(function (c) { return fmtHuman_(c.day); }).join(', ')));

    const requestId = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    const token = Utilities.getUuid().replace(/-/g, '');
    const created = new Date().toISOString();
    // Descrição do evento: a equipa presente primeiro, depois os contactos de quem marcou.
    const description = [
      'Equipa presente:',
      team,
      '',
      'Marcado por: ' + name,
      'E-mail: ' + email,
      'Telefone: ' + phone,
      notes ? 'Observações: ' + notes : null,
      '',
      'Estado: PENDENTE de aprovação',
      'Pedido feito na plataforma online (' + LANG.toUpperCase() + ') · ' + parsed.length + (parsed.length === 1 ? ' dia' : ' dias') + ' · ref. ' + requestId
    ].filter(function (l) { return l !== null; }).join('\n');

    parsed.forEach(function (s) {
      const ev = cal.createEvent(eventTitle_(name), s.start, s.end, { description: description });
      ev.setColor(COLOR_PENDING);
      ev.setTag('requestId', requestId);
      ev.setTag('token', token);
      ev.setTag('status', 'pendente');
      ev.setTag('lang', LANG);
      ev.setTag('name', name);
      ev.setTag('email', email);
      ev.setTag('phone', phone);
      ev.setTag('team', team);
      ev.setTag('notes', notes);
      ev.setTag('created', created);
    });

    const cancelUrl = CONFIG.SITE_URL + '?cancelar=' + requestId + '&t=' + token + (LANG === 'en' ? '&lang=en' : '');
    sendMail_(email, L.subjReceived,
      p_(L.hello(esc_(name))) + p_(L.bodyReceived) + slotsHtml_(parsed, LANG) +
      p_(L.pending) + p_(L.cancelLink(cancelUrl)) + p_(L.thanks + '<br>' + signature_()));
    sendMail_(CONFIG.TEAM_EMAIL, 'Novo pedido de reserva · ' + name,
      '<p>Novo pedido de reserva de estúdio' + (LANG === 'en' ? ' (feito em inglês)' : '') + '.</p>' +
      '<p><b>Nome:</b> ' + esc_(name) + '<br><b>E-mail:</b> ' + esc_(email) + '<br><b>Telefone:</b> ' + esc_(phone) +
      '<br><b>Equipa:</b> ' + esc_(team) + (notes ? '<br><b>Observações:</b> ' + esc_(notes) : '') + '</p>' + slotsHtml_(parsed, 'pt') +
      '<p>Aprovar ou recusar: <a href="' + CONFIG.SITE_URL + 'admin.html">página de aprovação</a></p>', null, email);

    return { ok: true, requestId: requestId };
  } finally {
    lock.releaseLock();
  }
}

// ------------------ Área da equipa ------------------
function checkPassword_(pw) {
  const real = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!real) throw userError_('A senha de administração ainda não foi definida no Apps Script.');
  if (!pw || pw !== real) { Utilities.sleep(800); throw userError_('Senha incorreta.'); }
}

function adminList_() {
  const from = today_();
  const to = addMonths_(from, CONFIG.MAX_MONTHS_AHEAD + 1);
  const byDay = eventsByDay_(from, to);
  const byId = {};
  Object.keys(byDay).forEach(function (k) {
    const dayEvents = byDay[k];
    dayEvents.forEach(function (x) {
      if (!x.id) return;
      const ev = x.ev;
      if (!byId[x.id]) {
        byId[x.id] = {
          requestId: x.id, status: ev.getTag('status'), lang: ev.getTag('lang') || 'pt',
          name: ev.getTag('name'), email: ev.getTag('email'), phone: ev.getTag('phone'),
          team: ev.getTag('team'), notes: ev.getTag('notes'), created: ev.getTag('created'), slots: []
        };
      }
      // Outros eventos nesse dia que se sobrepõem a este horário
      const others = dayEvents.filter(function (o) { return o.id !== x.id && o.iv[0] < x.iv[1] && o.iv[1] > x.iv[0]; });
      const full = maxOverlap_(others.map(function (o) { return o.iv; }), x.iv[0], x.iv[1]) >= CONFIG.CAPACITY;
      byId[x.id].slots.push({
        date: k, label: fmtHuman_(parseDate_(k), 'pt'),
        start: hhmm_(ev.getStartTime()), end: hhmm_(ev.getEndTime()),
        overlaps: others.map(function (o) { return o.title; }),
        full: full
      });
    });
  });
  const all = Object.keys(byId).map(function (k) { return byId[k]; });
  all.forEach(function (r) { r.slots.sort(function (a, b) { return (a.date + a.start).localeCompare(b.date + b.start); }); });
  return {
    ok: true, capacity: CONFIG.CAPACITY,
    pending: all.filter(function (r) { return r.status === 'pendente'; })
      .sort(function (a, b) { return String(a.created).localeCompare(String(b.created)); }),
    approved: all.filter(function (r) { return r.status === 'aprovado'; })
      .sort(function (a, b) { return a.slots[0].date.localeCompare(b.slots[0].date); })
  };
}

function approve_(requestId) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const evs = eventsOfRequest_(requestId);
    if (!evs.length) throw userError_('Pedido não encontrado (pode ter sido cancelado).');
    const first = evs[0], name = first.getTag('name'), l = lang_(first.getTag('lang')), L = MSG[l];
    evs.forEach(function (ev) {
      ev.setColor(COLOR_APPROVED);
      ev.setTag('status', 'aprovado');
      ev.setDescription(ev.getDescription().replace('Estado: PENDENTE de aprovação', 'Estado: APROVADO'));
    });
    const manual = manualBlob_(l);
    sendMail_(first.getTag('email'), L.subjApproved,
      p_(L.hello(esc_(name))) + p_(L.bodyApproved) + slotsHtmlFromEvents_(evs, l) +
      (manual ? p_(L.manual) : '') + p_(L.teamOnly) + p_(L.changes(mailLink_())) +
      p_(L.seeYou + '<br>' + signature_()), manual ? [manual] : null);
    return { ok: true, manualAttached: !!manual };
  } finally { lock.releaseLock(); }
}

// Recusa um pedido pendente ou cancela uma reserva aprovada (pela equipa).
function reject_(requestId, reason) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const evs = eventsOfRequest_(requestId);
    if (!evs.length) throw userError_('Pedido não encontrado (pode já ter sido removido).');
    const first = evs[0], name = first.getTag('name'), l = lang_(first.getTag('lang')), L = MSG[l];
    const wasApproved = first.getTag('status') === 'aprovado';
    const list = slotsHtmlFromEvents_(evs, l);
    const r = clean_(reason, 1000);
    evs.forEach(function (ev) { ev.deleteEvent(); });
    sendMail_(first.getTag('email'), wasApproved ? L.subjCancelled : L.subjRejected,
      p_(L.hello(esc_(name))) + p_(wasApproved ? L.bodyCancelledTeam : L.bodyRejected) + list +
      (r ? p_('<b>' + L.reason + ':</b> ' + esc_(r)) : '') +
      p_(L.questions(mailLink_())) + p_(signature_()));
    return { ok: true };
  } finally { lock.releaseLock(); }
}

// ------------------ Cancelamento pela pessoa ------------------
function cancelByRequester_(requestId, token) {
  if (!requestId || !token) throw userError_(M_().cancelBad);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const evs = eventsOfRequest_(requestId).filter(function (ev) { return ev.getTag('token') === token; });
    if (!evs.length) throw userError_(M_().cancelGone);
    const first = evs[0], name = first.getTag('name'), email = first.getTag('email'),
          l = lang_(first.getTag('lang')), L = MSG[l];
    const listL = slotsHtmlFromEvents_(evs, l), listPt = slotsHtmlFromEvents_(evs, 'pt');
    evs.forEach(function (ev) { ev.deleteEvent(); });
    sendMail_(email, L.subjCancelled, p_(L.hello(esc_(name))) + p_(L.bodyCancelledSelf) + listL + p_(signature_()));
    sendMail_(CONFIG.TEAM_EMAIL, 'Reserva cancelada pela pessoa · ' + name,
      '<p>' + esc_(name) + ' (' + esc_(email) + ') cancelou o pedido/reserva de estúdio:</p>' + listPt, null, email);
    return { ok: true, count: evs.length };
  } finally { lock.releaseLock(); }
}

// ------------------ Auxiliares ------------------
function calendar_() {
  const cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!cal) throw userError_('Calendário não encontrado. Verifique o CALENDAR_ID na configuração.');
  return cal;
}

// Eventos futuros (a partir de hoje) de um pedido.
function eventsOfRequest_(requestId) {
  if (!requestId) return [];
  const from = today_(), to = addMonths_(from, CONFIG.MAX_MONTHS_AHEAD + 1);
  return calendar_().getEvents(from, to)
    .filter(function (ev) { return ev.getTag('requestId') === String(requestId); })
    .sort(function (a, b) { return a.getStartTime() - b.getStartTime(); });
}

// Manual de regras (ficheiro do Google Drive) no idioma da pessoa; PT como alternativa.
function manualBlob_(l) {
  const id = (l === 'en' && CONFIG.MANUAL_FILE_ID_EN) ? CONFIG.MANUAL_FILE_ID_EN : CONFIG.MANUAL_FILE_ID_PT;
  if (!id) return null;
  try { return DriveApp.getFileById(id).getBlob(); }
  catch (err) { console.error('Não foi possível ler o manual (' + id + '): ' + err); return null; }
}

function sendMail_(to, subject, html, attachments, replyTo) {
  if (!to || to.indexOf('@') === -1) return;
  const opts = { to: to, subject: subject, htmlBody: html, name: CONFIG.PROJECT_NAME };
  const rt = replyTo || CONFIG.TEAM_EMAIL;
  if (rt && rt.indexOf('@') !== -1) opts.replyTo = rt;
  if (attachments && attachments.length) opts.attachments = attachments;
  try { MailApp.sendEmail(opts); } catch (err) { console.error('Falha no e-mail para ' + to + ': ' + err); }
}

function slotsHtml_(parsed, l) {
  return '<ul>' + parsed.map(function (s) {
    return '<li>' + fmtHuman_(s.day, l) + ', ' + minToHhmm_(s.sm) + '–' + minToHhmm_(s.em) + '</li>';
  }).join('') + '</ul>';
}
function slotsHtmlFromEvents_(evs, l) {
  return '<ul>' + evs.map(function (ev) {
    return '<li>' + fmtHuman_(ev.getStartTime(), l) + ', ' + hhmm_(ev.getStartTime()) + '–' + hhmm_(ev.getEndTime()) + '</li>';
  }).join('') + '</ul>';
}

// Título no Google Calendar: "Reserva estúdio / Nome da pessoa"
function eventTitle_(personName) { return CONFIG.EVENT_TITLE_PREFIX + ' / ' + personName; }
function signature_() { return esc_(CONFIG.PROJECT_NAME) + '<br>' + esc_(CONFIG.ORG_NAME); }
function mailLink_() { return '<a href="mailto:' + CONFIG.TEAM_EMAIL + '">' + CONFIG.TEAM_EMAIL + '</a>'; }
function p_(html) { return '<p>' + html + '</p>'; }

function clean_(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
function esc_(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}
function parseDate_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return (d.getMonth() === +m[2] - 1) ? d : null;
}
function parseTime_(s) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(s || ''));
  return m ? (+m[1]) * 60 + (+m[2]) : null;
}
function atTime_(day, minutes) { return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60); }
function addDays_(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function addMonths_(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); }
function today_() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
function pad_(n) { return (n < 10 ? '0' : '') + n; }
function fmtKey_(d) { return d.getFullYear() + '-' + pad_(d.getMonth() + 1) + '-' + pad_(d.getDate()); }
function fmtHuman_(d, l) {
  const D = DATES[lang_(l || LANG)];
  return D.wd[d.getDay()] + ', ' + d.getDate() + ' ' + D.mo[d.getMonth()] + ' ' + d.getFullYear();
}
function hhmm_(d) { return pad_(d.getHours()) + ':' + pad_(d.getMinutes()); }
function minToHhmm_(m) { return pad_(Math.floor(m / 60)) + ':' + pad_(m % 60); }

// Executar no editor para autorizar o acesso (calendário, e-mail e Drive) e testar a ligação.
function testarLigacao() {
  const cal = calendar_();
  console.log('Calendário encontrado: ' + cal.getName());
  console.log('Senha definida: ' + (PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD') ? 'sim' : 'NÃO'));
  console.log('E-mails restantes hoje: ' + MailApp.getRemainingDailyQuota());
  ['pt', 'en'].forEach(function (l) {
    const id = l === 'en' ? CONFIG.MANUAL_FILE_ID_EN : CONFIG.MANUAL_FILE_ID_PT;
    if (!id) { console.log('Manual ' + l.toUpperCase() + ': não definido'); return; }
    const b = manualBlob_(l);
    console.log('Manual ' + l.toUpperCase() + ': ' + (b ? b.getName() + ' (ok)' : 'NÃO foi possível ler o ficheiro — verifique o ID'));
  });
}
