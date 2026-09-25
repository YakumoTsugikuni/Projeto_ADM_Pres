/**
 * Gerenciador de Presença de Alunos - Frontend Vanilla JavaScript
 */

// Estado global da aplicação
const state = {
  currentUser: null,
  currentSection: 'dashboard',
  students: [],
  courses: [],
  historyPagination: { page: 1, totalPages: 1 },
  auditPagination: { page: 1, totalPages: 1 },
  confirmCallback: null
};

/**
 * Escapa HTML para prevenir ataques XSS
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const str = String(text);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Exibe notificação toast flutuante
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button class="btn-icon" onclick="this.parentElement.remove()" style="padding: 2px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 4500);
}

/**
 * Data de hoje formatada em YYYY-MM-DD
 */
function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formata data ISO para pt-BR
 */
function formatDateBr(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Formata timestamp ISO para pt-BR com horário
 */
function formatDateTimeBr(dateTimeStr) {
  if (!dateTimeStr) return '-';
  try {
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return dateTimeStr;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateTimeStr;
  }
}

// ============================================================
// INICIALIZAÇÃO E AUTENTICAÇÃO
// ============================================================

window.addEventListener('DOMContentLoaded', async () => {
  setupDateInputs();
  await checkAuth();
});

function setupDateInputs() {
  const today = getTodayString();
  const dateInputs = ['dash-quick-date', 'call-date-input'];
  dateInputs.forEach(id => {
    const input = document.getElementById(id);
    if (input) {
      input.value = today;
      input.max = today; // Bloqueia datas futuras no calendário
    }
  });

  // Atualizar data da topbar
  const topDate = document.getElementById('topbar-date');
  if (topDate) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    topDate.textContent = new Date().toLocaleDateString('pt-BR', options);
  }
}

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      state.currentUser = data.user;
      setupAppUI();
      navigate('dashboard');
    } else {
      showAuthScreen();
    }
  } catch (err) {
    console.error('Erro ao verificar sessão:', err);
    showAuthScreen();
  }
}

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-layout').classList.add('hidden');
}

function setupAppUI() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-layout').classList.remove('hidden');

  const user = state.currentUser;
  if (!user) return;

  // Atualizar informações na sidebar
  const nameEl = document.getElementById('sidebar-name');
  const roleEl = document.getElementById('sidebar-role');
  const avatarEl = document.getElementById('sidebar-avatar');

  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) {
    roleEl.textContent = user.role === 'admin' ? 'Administrador' : 'Professor/Operador';
    roleEl.className = `user-role-badge ${user.role === 'admin' ? 'admin' : ''}`;
  }
  if (avatarEl) {
    avatarEl.textContent = user.name.charAt(0).toUpperCase();
  }

  // Exibir ou ocultar menus administrativos
  const adminElements = document.querySelectorAll('.admin-only');
  adminElements.forEach(el => {
    if (user.role === 'admin') {
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });

  // Carregar dados de base
  loadBaseLists();
}

async function loadBaseLists() {
  try {
    const [studentsRes, coursesRes] = await Promise.all([
      fetch('/api/students'),
      fetch('/api/courses')
    ]);

    if (studentsRes.ok) state.students = await studentsRes.json();
    if (coursesRes.ok) state.courses = await coursesRes.json();

    populateCourseAndStudentSelects();
  } catch (err) {
    console.error('Erro ao carregar listas base:', err);
  }
}

function populateCourseAndStudentSelects() {
  // Preencher seletores de curso
  const courseSelectIds = [
    'dash-quick-course',
    'call-course-select',
    'hist-course',
    'rep-course'
  ];

  courseSelectIds.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const currentVal = select.value;
    const isFilter = id === 'hist-course' || id === 'rep-course';
    
    select.innerHTML = isFilter 
      ? '<option value="">Todos os cursos</option>'
      : '<option value="">Selecione um curso...</option>';

    state.courses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.title} (${c.duration}h)`;
      select.appendChild(opt);
    });

    if (currentVal) select.value = currentVal;
  });

  // Preencher seletor de aluno no dashboard
  const studentQuickSelect = document.getElementById('dash-quick-student');
  if (studentQuickSelect) {
    const currentVal = studentQuickSelect.value;
    studentQuickSelect.innerHTML = '<option value="">Selecione o aluno...</option>';
    state.students.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.email})`;
      studentQuickSelect.appendChild(opt);
    });
    if (currentVal) studentQuickSelect.value = currentVal;
  }
}

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('form-login').classList.toggle('hidden', !isLogin);
  document.getElementById('form-register').classList.toggle('hidden', isLogin);
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  const btn = document.getElementById('btn-submit-login');
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Falha ao autenticar', 'error');
      btn.disabled = false;
      return;
    }

    state.currentUser = data.user;
    showToast(`Bem-vindo, ${data.user.name}!`);
    setupAppUI();
    navigate('dashboard');
  } catch (err) {
    showToast('Erro ao conectar ao servidor', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;

  if (password.length < 6) {
    showToast('A senha deve ter no mínimo 6 caracteres', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-register');
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Falha no cadastro', 'error');
      btn.disabled = false;
      return;
    }

    showToast('Conta criada com sucesso! Faça login para continuar.');
    switchAuthTab('login');
    document.getElementById('login-username').value = username;
    document.getElementById('login-password').value = '';
    document.getElementById('form-register').reset();
  } catch (err) {
    showToast('Erro ao realizar cadastro', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {}
  state.currentUser = null;
  showToast('Sessão encerrada');
  showAuthScreen();
}

// ============================================================
// NAVEGAÇÃO E SIDEBAR
// ============================================================

function toggleSidebar(open) {
  const sidebar = document.getElementById('app-sidebar');
  if (open !== undefined) {
    sidebar.classList.toggle('open', open);
  } else {
    sidebar.classList.toggle('open');
  }
}

function navigate(section) {
  state.currentSection = section;

  // Fechar sidebar mobile se aberta
  toggleSidebar(false);

  // Esconder todas as seções
  const sections = document.querySelectorAll('.content-section');
  sections.forEach(sec => sec.classList.add('hidden'));

  // Ativar link da sidebar
  const navLinks = document.querySelectorAll('.sidebar-nav .nav-item');
  navLinks.forEach(link => {
    link.classList.toggle('active', link.getAttribute('data-section') === section);
  });

  // Exibir seção alvo
  const targetSection = document.getElementById(`section-${section}`);
  if (targetSection) {
    targetSection.classList.remove('hidden');
  }

  // Atualizar título do cabeçalho
  const titles = {
    dashboard: 'Dashboard Acadêmico',
    attendance: 'Controle de Chamadas',
    students: 'Alunos Matriculados',
    courses: 'Cursos e Disciplinas',
    history: 'Histórico de Presenças',
    reports: 'Relatórios e Métricas',
    users: 'Gestão de Usuários',
    audit: 'Auditoria de Alterações',
    profile: 'Meu Perfil'
  };

  const topTitle = document.getElementById('topbar-title');
  if (topTitle) topTitle.textContent = titles[section] || 'Painel Escolar';

  // Carregar dados específicos da seção
  switch (section) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'attendance':
      // Se não tiver selecionado curso, tenta selecionar o primeiro
      const courseSelect = document.getElementById('call-course-select');
      if (courseSelect && !courseSelect.value && state.courses.length > 0) {
        courseSelect.value = state.courses[0].id;
        loadClassRollCall();
      }
      break;
    case 'students':
      loadStudents();
      break;
    case 'courses':
      loadCourses();
      break;
    case 'history':
      loadHistory(1);
      break;
    case 'reports':
      loadReports();
      break;
    case 'users':
      if (state.currentUser?.role === 'admin') loadUsers();
      break;
    case 'audit':
      if (state.currentUser?.role === 'admin') loadAudit(1);
      break;
    case 'profile':
      loadProfile();
      break;
  }
}

// ============================================================
// DASHBOARD
// ============================================================

async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error('Falha ao obter dashboard');
    const data = await res.json();

    document.getElementById('dash-students').textContent = data.totalStudents;
    document.getElementById('dash-courses').textContent = data.totalCourses;
    document.getElementById('dash-present').textContent = data.totalPresent;
    document.getElementById('dash-absent').textContent = data.totalAbsent;
    document.getElementById('dash-rate').textContent = `${data.generalRate}%`;

    // Renderizar tabela de registros recentes
    const tableBody = document.getElementById('dash-recent-records');
    if (tableBody) {
      if (!data.recentRecords || data.recentRecords.length === 0) {
        tableBody.innerHTML = `
          <tr><td colspan="5" class="table-empty-state">Nenhum registro de presença realizado ainda. Faça a primeira chamada!</td></tr>
        `;
      } else {
        tableBody.innerHTML = data.recentRecords.map(r => `
          <tr>
            <td class="font-mono text-sm">${escapeHtml(formatDateBr(r.date))}</td>
            <td><strong>${escapeHtml(r.student_name)}</strong></td>
            <td>${escapeHtml(r.course_title)}</td>
            <td>
              <span class="badge ${r.status === 'present' ? 'badge-present' : 'badge-absent'}">
                ${r.status === 'present' ? 'Presente' : 'Ausente'}
              </span>
            </td>
            <td class="text-sm text-slate-500">${escapeHtml(r.registered_by)}</td>
          </tr>
        `).join('');
      }
    }

    // Renderizar barras de frequência por curso
    const courseBarsContainer = document.getElementById('dash-course-bars');
    if (courseBarsContainer) {
      if (!data.courseSummary || data.courseSummary.length === 0) {
        courseBarsContainer.innerHTML = '<p class="text-sm text-slate-400">Nenhum dado de curso disponível.</p>';
      } else {
        courseBarsContainer.innerHTML = data.courseSummary.map(c => `
          <div class="mb-4">
            <div class="flex-between text-sm mb-1">
              <span class="font-semibold text-slate-700">${escapeHtml(c.title)}</span>
              <span class="font-mono text-xs font-bold text-slate-600">${c.rate}% (${c.present}/${c.total})</span>
            </div>
            <div class="progress-container">
              <div class="progress-bar-fill ${c.rate >= 75 ? 'bg-emerald' : 'bg-amber'}" style="width: ${c.rate}%"></div>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

async function handleDashboardQuickAttendance(e) {
  e.preventDefault();
  const student_id = document.getElementById('dash-quick-student').value;
  const course_id = document.getElementById('dash-quick-course').value;
  const date = document.getElementById('dash-quick-date').value;
  const status = document.getElementById('dash-quick-status').value;
  const notes = document.getElementById('dash-quick-notes').value.trim();

  if (date > getTodayString()) {
    showToast('Não é permitido registrar presença em datas futuras', 'error');
    return;
  }

  try {
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id,
        course_id,
        date,
        status,
        notes: notes || null,
        allow_update: true
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Erro ao registrar presença', 'error');
      return;
    }

    showToast(data.message || 'Presença registrada com sucesso!');
    document.getElementById('dash-quick-notes').value = '';
    loadDashboard();
  } catch (err) {
    showToast('Erro ao enviar requisição', 'error');
  }
}

function openQuickAttendanceModal() {
  navigate('attendance');
}

// ============================================================
// FAZER CHAMADA (TURMA / BATCH & INDIVIDUAL)
// ============================================================

async function loadClassRollCall() {
  const courseId = document.getElementById('call-course-select').value;
  const date = document.getElementById('call-date-input').value;
  const tableBody = document.getElementById('roll-call-table-body');
  const countLabel = document.getElementById('roll-call-count-label');
  const quickButtons = document.getElementById('roll-call-quick-buttons');
  const footer = document.getElementById('roll-call-footer');

  if (!courseId || !date) {
    tableBody.innerHTML = `
      <tr><td colspan="6" class="table-empty-state">Por favor, selecione um curso e uma data para carregar os alunos.</td></tr>
    `;
    quickButtons.style.display = 'none';
    footer.style.display = 'none';
    countLabel.textContent = 'Selecione o curso e a data acima';
    return;
  }

  if (date > getTodayString()) {
    showToast('Não é permitido registrar presença em datas futuras', 'error');
    tableBody.innerHTML = `
      <tr><td colspan="6" class="table-empty-state text-rose-600">A data selecionada é no futuro. Escolha hoje ou uma data anterior.</td></tr>
    `;
    quickButtons.style.display = 'none';
    footer.style.display = 'none';
    return;
  }

  try {
    // 1. Obter todos os alunos
    const studentsRes = await fetch('/api/students');
    const students = await studentsRes.json();

    if (!students || students.length === 0) {
      tableBody.innerHTML = `
        <tr><td colspan="6" class="table-empty-state">Nenhum aluno cadastrado no sistema. Cadastre alunos na aba "Alunos" primeiro.</td></tr>
      `;
      quickButtons.style.display = 'none';
      footer.style.display = 'none';
      return;
    }

    // 2. Verificar presenças já gravadas para esse curso e data
    const historyRes = await fetch(`/api/history/details?course_id=${courseId}&date=${date}`);
    let existingMap = {};
    if (historyRes.ok) {
      const histData = await historyRes.json();
      if (histData.records) {
        histData.records.forEach(r => {
          existingMap[r.student_id] = r;
        });
      }
    }

    countLabel.textContent = `${students.length} alunos matriculados`;
    quickButtons.style.display = 'inline-flex';
    footer.style.display = 'flex';

    tableBody.innerHTML = students.map((s, index) => {
      const existing = existingMap[s.id];
      const currentStatus = existing ? existing.status : 'present'; // Default presente
      const currentNotes = existing ? (existing.notes || '') : '';

      return `
        <tr data-student-id="${s.id}">
          <td class="text-slate-400 text-xs">${index + 1}</td>
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td class="text-sm text-slate-500">${escapeHtml(s.email)}</td>
          <td>${s.age} anos</td>
          <td class="text-center">
            <div class="btn-group">
              <label class="btn btn-xs ${currentStatus === 'present' ? 'btn-emerald' : 'btn-outline'} cursor-pointer" onclick="toggleStudentRowStatus(this, 'present')">
                <input type="radio" name="status-${s.id}" value="present" ${currentStatus === 'present' ? 'checked' : ''} style="display:none;">
                Presente
              </label>
              <label class="btn btn-xs ${currentStatus === 'absent' ? 'btn-danger' : 'btn-outline'} cursor-pointer" onclick="toggleStudentRowStatus(this, 'absent')">
                <input type="radio" name="status-${s.id}" value="absent" ${currentStatus === 'absent' ? 'checked' : ''} style="display:none;">
                Ausente
              </label>
            </div>
          </td>
          <td>
            <input type="text" class="form-input text-xs roll-notes" placeholder="Observações..." value="${escapeHtml(currentNotes)}">
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Erro ao carregar lista de chamada:', err);
    showToast('Erro ao carregar lista de alunos', 'error');
  }
}

function toggleStudentRowStatus(labelEl, status) {
  const group = labelEl.parentElement;
  const labels = group.querySelectorAll('label');
  labels.forEach(l => {
    l.className = 'btn btn-xs btn-outline cursor-pointer';
  });

  const radio = labelEl.querySelector('input');
  if (radio) radio.checked = true;

  if (status === 'present') {
    labelEl.className = 'btn btn-xs btn-emerald cursor-pointer';
  } else {
    labelEl.className = 'btn btn-xs btn-danger cursor-pointer';
  }
}

function markAllStudents(status) {
  const rows = document.querySelectorAll('#roll-call-table-body tr[data-student-id]');
  rows.forEach(row => {
    const radio = row.querySelector(`input[value="${status}"]`);
    if (radio) {
      radio.checked = true;
      const label = radio.parentElement;
      toggleStudentRowStatus(label, status);
    }
  });
  showToast(`Todos os alunos marcados como ${status === 'present' ? 'Presentes' : 'Ausentes'}`);
}

async function submitClassRollCall() {
  const course_id = document.getElementById('call-course-select').value;
  const date = document.getElementById('call-date-input').value;

  if (!course_id || !date) {
    showToast('Selecione o curso e a data da chamada', 'error');
    return;
  }

  if (date > getTodayString()) {
    showToast('Não é permitido registrar presença em datas futuras', 'error');
    return;
  }

  const rows = document.querySelectorAll('#roll-call-table-body tr[data-student-id]');
  if (rows.length === 0) {
    showToast('Nenhum aluno para registrar chamada', 'error');
    return;
  }

  const records = [];
  rows.forEach(row => {
    const studentId = row.getAttribute('data-student-id');
    const checkedRadio = row.querySelector(`input[name="status-${studentId}"]:checked`);
    const status = checkedRadio ? checkedRadio.value : 'present';
    const notesInput = row.querySelector('.roll-notes');
    const notes = notesInput ? notesInput.value.trim() : '';

    records.push({
      student_id: Number(studentId),
      status,
      notes: notes || null
    });
  });

  try {
    const res = await fetch('/api/attendance/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        course_id: Number(course_id),
        date,
        records,
        allow_update: true
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Erro ao processar chamada', 'error');
      return;
    }

    showToast(data.message || 'Chamada salva com sucesso!');
    loadBaseLists();
    loadDashboard();
  } catch (err) {
    showToast('Erro de conexão ao salvar chamada', 'error');
  }
}

// ============================================================
// ALUNOS (CRUD)
// ============================================================

async function loadStudents() {
  try {
    const search = document.getElementById('students-search')?.value || '';
    const res = await fetch(`/api/students?search=${encodeURIComponent(search)}`);
    if (!res.ok) throw new Error('Erro ao carregar alunos');
    state.students = await res.json();

    const badge = document.getElementById('students-count-badge');
    if (badge) badge.textContent = `${state.students.length} alunos cadastrados`;

    renderStudentsTable(state.students);
  } catch (err) {
    console.error('Erro ao listar alunos:', err);
    showToast('Erro ao listar alunos', 'error');
  }
}

function handleStudentSearch(val) {
  loadStudents();
}

function renderStudentsTable(students) {
  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;

  if (students.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="9" class="table-empty-state">Nenhum aluno encontrado. Clique em "Novo Aluno" para cadastrar.</td></tr>
    `;
    return;
  }

  tbody.innerHTML = students.map(s => {
    const rate = s.attendance_rate || 0;
    const rateClass = rate >= 75 ? 'badge-present' : 'badge-absent';

    return `
      <tr>
        <td class="font-mono text-xs text-slate-400">#${s.id}</td>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td><a href="mailto:${escapeHtml(s.email)}" class="text-primary hover:underline text-sm">${escapeHtml(s.email)}</a></td>
        <td>${s.age} anos</td>
        <td>${s.total_attendance}</td>
        <td class="text-emerald-700 font-semibold">${s.present_count}</td>
        <td class="text-rose-700 font-semibold">${s.absent_count}</td>
        <td>
          <span class="badge ${rateClass}">
            ${rate}%
          </span>
        </td>
        <td class="text-right">
          <div class="btn-group">
            <button type="button" class="btn-icon" title="Editar Aluno" onclick="openStudentModal(${s.id})">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button type="button" class="btn-icon text-rose-600" title="Excluir Aluno" onclick="confirmDeleteStudent(${s.id}, '${escapeHtml(s.name)}')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openStudentModal(id = null) {
  const modal = document.getElementById('modal-student');
  const title = document.getElementById('modal-student-title');
  const form = document.getElementById('form-student');
  form.reset();

  if (id) {
    const student = state.students.find(s => s.id === id);
    if (!student) return;
    title.textContent = 'Editar Dados do Aluno';
    document.getElementById('student-id').value = student.id;
    document.getElementById('student-name').value = student.name;
    document.getElementById('student-email').value = student.email;
    document.getElementById('student-age').value = student.age;
  } else {
    title.textContent = 'Cadastrar Novo Aluno';
    document.getElementById('student-id').value = '';
  }

  modal.classList.remove('hidden');
}

function closeStudentModal() {
  document.getElementById('modal-student').classList.add('hidden');
}

async function handleSaveStudent(e) {
  e.preventDefault();
  const id = document.getElementById('student-id').value;
  const name = document.getElementById('student-name').value.trim();
  const email = document.getElementById('student-email').value.trim();
  const age = parseInt(document.getElementById('student-age').value, 10);

  if (age < 1 || age > 129) {
    showToast('A idade deve estar entre 1 e 129 anos', 'error');
    return;
  }

  const isEdit = Boolean(id);
  const url = isEdit ? `/api/students/${id}` : '/api/students';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, age })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Erro ao salvar aluno', 'error');
      return;
    }

    showToast(isEdit ? 'Aluno atualizado com sucesso!' : 'Aluno cadastrado com sucesso!');
    closeStudentModal();
    loadStudents();
    loadBaseLists();
    loadDashboard();
  } catch (err) {
    showToast('Erro ao comunicar com o servidor', 'error');
  }
}

function confirmDeleteStudent(id, name) {
  showConfirmModal({
    title: 'Excluir Aluno',
    message: `Tem certeza que deseja excluir o aluno "${name}"? Todo o histórico de presenças dele também será removido permanentemente.`,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Erro ao excluir aluno', 'error');
          return;
        }
        showToast(data.message || 'Aluno excluído com sucesso');
        loadStudents();
        loadBaseLists();
        loadDashboard();
      } catch (err) {
        showToast('Erro ao excluir aluno', 'error');
      }
    }
  });
}

// ============================================================
// CURSOS (CRUD)
// ============================================================

async function loadCourses() {
  try {
    const res = await fetch('/api/courses');
    if (!res.ok) throw new Error('Erro ao listar cursos');
    state.courses = await res.json();
    renderCoursesGrid(state.courses);
  } catch (err) {
    console.error('Erro ao carregar cursos:', err);
    showToast('Erro ao carregar cursos', 'error');
  }
}

function renderCoursesGrid(courses) {
  const container = document.getElementById('courses-cards-container');
  if (!container) return;

  if (courses.length === 0) {
    container.innerHTML = `
      <div class="col-span-full table-empty-state">
        Nenhum curso cadastrado ainda. Clique em "Novo Curso" para criar o primeiro.
      </div>
    `;
    return;
  }

  container.innerHTML = courses.map(c => `
    <div class="course-card">
      <div class="course-card-header">
        <h3 class="course-card-title">${escapeHtml(c.title)}</h3>
        <span class="course-card-duration">${c.duration}h aula</span>
      </div>
      <p class="course-card-desc">${escapeHtml(c.description || 'Sem descrição cadastrada.')}</p>
      
      <div class="stats-mini-row mb-3">
        <div class="stat-mini">Presenças: <strong class="text-emerald-700">${c.present_count || 0}</strong></div>
        <div class="stat-mini">Faltas: <strong class="text-rose-700">${c.absent_count || 0}</strong></div>
        <div class="stat-mini">Taxa: <strong class="text-primary">${c.attendance_rate || 0}%</strong></div>
      </div>

      <div class="course-card-footer">
        <span class="text-xs text-slate-400">Criado em ${formatDateBr(c.created_at)}</span>
        <div class="btn-group">
          <button type="button" class="btn btn-xs btn-outline" onclick="openCourseModal(${c.id})">
            Editar
          </button>
          <button type="button" class="btn btn-xs btn-outline-rose" onclick="confirmDeleteCourse(${c.id}, '${escapeHtml(c.title)}')">
            Excluir
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function openCourseModal(id = null) {
  const modal = document.getElementById('modal-course');
  const title = document.getElementById('modal-course-title');
  const form = document.getElementById('form-course');
  form.reset();

  if (id) {
    const course = state.courses.find(c => c.id === id);
    if (!course) return;
    title.textContent = 'Editar Curso';
    document.getElementById('course-id').value = course.id;
    document.getElementById('course-title').value = course.title;
    document.getElementById('course-duration').value = course.duration;
    document.getElementById('course-description').value = course.description || '';
  } else {
    title.textContent = 'Cadastrar Novo Curso';
    document.getElementById('course-id').value = '';
  }

  modal.classList.remove('hidden');
}

function closeCourseModal() {
  document.getElementById('modal-course').classList.add('hidden');
}

async function handleSaveCourse(e) {
  e.preventDefault();
  const id = document.getElementById('course-id').value;
  const title = document.getElementById('course-title').value.trim();
  const duration = parseInt(document.getElementById('course-duration').value, 10);
  const description = document.getElementById('course-description').value.trim();

  if (isNaN(duration) || duration <= 0) {
    showToast('A carga horária/duração deve ser maior que zero', 'error');
    return;
  }

  const isEdit = Boolean(id);
  const url = isEdit ? `/api/courses/${id}` : '/api/courses';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, duration, description })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Erro ao salvar curso', 'error');
      return;
    }

    showToast(isEdit ? 'Curso atualizado com sucesso!' : 'Curso cadastrado com sucesso!');
    closeCourseModal();
    loadCourses();
    loadBaseLists();
    loadDashboard();
  } catch (err) {
    showToast('Erro ao comunicar com o servidor', 'error');
  }
}

function confirmDeleteCourse(id, title) {
  showConfirmModal({
    title: 'Excluir Curso',
    message: `Tem certeza que deseja excluir o curso "${title}"? Todas as presenças registradas neste curso serão excluídas em cascata.`,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/courses/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Erro ao excluir curso', 'error');
          return;
        }
        showToast(data.message || 'Curso excluído com sucesso');
        loadCourses();
        loadBaseLists();
        loadDashboard();
      } catch (err) {
        showToast('Erro ao excluir curso', 'error');
      }
    }
  });
}

// ============================================================
// HISTÓRICO
// ============================================================

async function loadHistory(page = 1) {
  state.historyPagination.page = page;

  const course_id = document.getElementById('hist-course')?.value || '';
  const start_date = document.getElementById('hist-start-date')?.value || '';
  const end_date = document.getElementById('hist-end-date')?.value || '';
  const status = document.getElementById('hist-status')?.value || '';

  const queryParams = new URLSearchParams({
    page,
    limit: 10,
    course_id,
    start_date,
    end_date,
    status
  });

  try {
    const res = await fetch(`/api/history?${queryParams.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar histórico');
    const result = await res.json();

    state.historyPagination = result.pagination;
    renderHistoryTable(result.data);
    renderHistoryPagination(result.pagination);
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
    showToast('Erro ao carregar histórico', 'error');
  }
}

function renderHistoryTable(sessions) {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  if (sessions.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="8" class="table-empty-state">Nenhum registro histórico atende aos filtros selecionados.</td></tr>
    `;
    return;
  }

  tbody.innerHTML = sessions.map(s => {
    const rate = s.attendance_percentage;
    const badgeClass = rate >= 75 ? 'badge-present' : 'badge-absent';

    return `
      <tr>
        <td class="font-mono text-sm font-semibold">${formatDateBr(s.date)}</td>
        <td><strong>${escapeHtml(s.course_title)}</strong></td>
        <td>${s.course_duration}h</td>
        <td>${s.total_students} alunos</td>
        <td class="text-emerald-700 font-semibold">${s.present_count}</td>
        <td class="text-rose-700 font-semibold">${s.absent_count}</td>
        <td>
          <span class="badge ${badgeClass}">${rate}%</span>
        </td>
        <td class="text-right">
          <button type="button" class="btn btn-xs btn-outline" onclick="openHistoryDetails(${s.course_id}, '${s.date}')">
            Ver Detalhes
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderHistoryPagination(pagination) {
  const info = document.getElementById('hist-pagination-info');
  const buttons = document.getElementById('hist-pagination-buttons');
  if (!info || !buttons) return;

  info.textContent = `Página ${pagination.page} de ${pagination.totalPages} (${pagination.total} chamadas)`;

  buttons.innerHTML = `
    <button type="button" class="btn btn-xs btn-outline" ${pagination.page <= 1 ? 'disabled' : ''} onclick="loadHistory(${pagination.page - 1})">
      Anterior
    </button>
    <button type="button" class="btn btn-xs btn-outline" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} onclick="loadHistory(${pagination.page + 1})">
      Próxima
    </button>
  `;
}

function resetHistoryFilters() {
  document.getElementById('hist-course').value = '';
  document.getElementById('hist-start-date').value = '';
  document.getElementById('hist-end-date').value = '';
  document.getElementById('hist-status').value = '';
  loadHistory(1);
}

async function openHistoryDetails(courseId, date) {
  try {
    const res = await fetch(`/api/history/details?course_id=${courseId}&date=${date}`);
    if (!res.ok) throw new Error('Erro ao obter detalhes da chamada');
    const data = await res.json();

    document.getElementById('modal-details-title').textContent = data.course.title;
    document.getElementById('modal-details-subtitle').textContent = `Sessão de ${formatDateBr(data.date)} • Duração: ${data.course.duration}h`;

    document.getElementById('details-total').textContent = data.summary.total;
    document.getElementById('details-present').textContent = data.summary.presentCount;
    document.getElementById('details-absent').textContent = data.summary.absentCount;
    document.getElementById('details-rate').textContent = `${data.summary.percentage}%`;

    const tbody = document.getElementById('modal-details-body');
    tbody.innerHTML = data.records.map(r => `
      <tr>
        <td>
          <strong>${escapeHtml(r.student_name)}</strong>
          <span class="block text-xs text-slate-400">${escapeHtml(r.student_email)} (${r.student_age} anos)</span>
        </td>
        <td>
          <span class="badge ${r.status === 'present' ? 'badge-present' : 'badge-absent'}">
            ${r.status === 'present' ? 'Presente' : 'Ausente'}
          </span>
        </td>
        <td class="text-sm text-slate-600">${escapeHtml(r.notes || '-')}</td>
        <td class="text-xs text-slate-500">${escapeHtml(r.updated_by_name || r.created_by_name || 'Sistema')}</td>
        <td class="text-right">
          <button type="button" class="btn-icon text-rose-600" title="Excluir Registro" onclick="deleteHistoryRecord(${r.id}, ${courseId}, '${date}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </td>
      </tr>
    `).join('');

    document.getElementById('modal-history-details').classList.remove('hidden');
  } catch (err) {
    showToast('Falha ao abrir detalhes da chamada', 'error');
  }
}

function closeHistoryDetailsModal() {
  document.getElementById('modal-history-details').classList.add('hidden');
}

function deleteHistoryRecord(attendanceId, courseId, date) {
  showConfirmModal({
    title: 'Excluir Registro de Presença',
    message: 'Deseja excluir este registro de presença específico? A alteração será auditada no sistema.',
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/attendance/${attendanceId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Erro ao excluir');
        showToast('Presença excluída com sucesso');
        openHistoryDetails(courseId, date);
        loadHistory(state.historyPagination.page);
        loadDashboard();
      } catch (err) {
        showToast('Erro ao excluir registro de presença', 'error');
      }
    }
  });
}

// ============================================================
// RELATÓRIOS E EXPORTAÇÃO CSV
// ============================================================

async function loadReports() {
  const course_id = document.getElementById('rep-course')?.value || '';
  const start_date = document.getElementById('rep-start-date')?.value || '';
  const end_date = document.getElementById('rep-end-date')?.value || '';
  const status = document.getElementById('rep-status')?.value || '';

  const params = new URLSearchParams({
    course_id,
    start_date,
    end_date,
    status
  });

  try {
    const res = await fetch(`/api/reports/students?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao carregar relatórios');
    const studentsReport = await res.json();

    const countBadge = document.getElementById('rep-students-count');
    if (countBadge) countBadge.textContent = `${studentsReport.length} alunos listados`;

    const tbody = document.getElementById('report-students-body');
    if (!tbody) return;

    if (studentsReport.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="8" class="table-empty-state">Nenhum dado encontrado para os filtros selecionados.</td></tr>
      `;
      return;
    }

    tbody.innerHTML = studentsReport.map(item => {
      const isGood = item.attendance_rate >= 75;
      const badgeClass = isGood ? 'badge-present' : 'badge-absent';

      return `
        <tr>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td class="text-sm text-slate-500">${escapeHtml(item.email)}</td>
          <td>${item.age} anos</td>
          <td>${item.total_records} sessões</td>
          <td class="text-emerald-700 font-semibold">${item.present_count}</td>
          <td class="text-rose-700 font-semibold">${item.absent_count}</td>
          <td>
            <div class="flex items-center gap-2">
              <span class="font-mono text-xs font-bold">${item.attendance_rate}%</span>
              <div class="progress-container" style="width: 80px;">
                <div class="progress-bar-fill ${isGood ? 'bg-emerald' : 'bg-rose'}" style="width: ${item.attendance_rate}%"></div>
              </div>
            </div>
          </td>
          <td>
            <span class="badge ${badgeClass}">${item.situation}</span>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar relatórios:', err);
    showToast('Erro ao carregar relatórios', 'error');
  }
}

function resetReportFilters() {
  document.getElementById('rep-course').value = '';
  document.getElementById('rep-start-date').value = '';
  document.getElementById('rep-end-date').value = '';
  document.getElementById('rep-status').value = '';
  loadReports();
}

function exportAttendanceCSV() {
  const course_id = document.getElementById('rep-course')?.value || '';
  const start_date = document.getElementById('rep-start-date')?.value || '';
  const end_date = document.getElementById('rep-end-date')?.value || '';
  const status = document.getElementById('rep-status')?.value || '';

  const params = new URLSearchParams({
    course_id,
    start_date,
    end_date,
    status
  });

  const downloadUrl = `/api/reports/export-csv?${params.toString()}`;
  showToast('Iniciando exportação CSV...', 'success');
  window.location.href = downloadUrl;
}

// ============================================================
// ADMINISTRAÇÃO: USUÁRIOS
// ============================================================

async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) throw new Error('Falha ao listar usuários');
    const users = await res.json();

    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    tbody.innerHTML = users.map(u => {
      const isSelf = u.id === state.currentUser?.id;
      const statusBadge = u.is_active === 1
        ? '<span class="badge badge-present">Ativo</span>'
        : '<span class="badge badge-absent">Inativo</span>';

      return `
        <tr>
          <td class="font-mono text-xs text-slate-400">#${u.id}</td>
          <td><strong>${escapeHtml(u.name)}</strong> ${isSelf ? '<span class="badge badge-neutral text-xs">Você</span>' : ''}</td>
          <td class="font-mono text-sm">${escapeHtml(u.username)}</td>
          <td>
            <span class="user-role-badge ${u.role === 'admin' ? 'admin' : ''}">
              ${u.role === 'admin' ? 'Administrador' : 'Usuário Padrão'}
            </span>
          </td>
          <td>${statusBadge}</td>
          <td class="text-sm text-slate-500">${formatDateBr(u.created_at)}</td>
          <td class="text-right">
            <div class="btn-group">
              <button type="button" class="btn btn-xs btn-outline" onclick="openUserModal(${u.id}, '${escapeHtml(u.name)}', '${escapeHtml(u.username)}', '${u.role}')">
                Editar
              </button>
              <button type="button" class="btn btn-xs btn-outline" onclick="openResetPasswordModal(${u.id}, '${escapeHtml(u.username)}')">
                Redefinir Senha
              </button>
              ${!isSelf ? `
                <button type="button" class="btn btn-xs ${u.is_active === 1 ? 'btn-outline-rose' : 'btn-outline-emerald'}" onclick="toggleUserStatus(${u.id}, ${u.is_active})">
                  ${u.is_active === 1 ? 'Desativar' : 'Ativar'}
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    showToast('Erro ao listar usuários', 'error');
  }
}

function openUserModal(id = null, name = '', username = '', role = 'user') {
  const modal = document.getElementById('modal-user');
  const title = document.getElementById('modal-user-title');
  const passGroup = document.getElementById('group-user-password');
  const passInput = document.getElementById('user-pass');

  if (id) {
    title.textContent = 'Editar Usuário';
    document.getElementById('manage-user-id').value = id;
    document.getElementById('user-fullname').value = name;
    document.getElementById('user-login').value = username;
    document.getElementById('user-role-select').value = role;
    passGroup.classList.add('hidden');
    passInput.required = false;
  } else {
    title.textContent = 'Novo Usuário';
    document.getElementById('manage-user-id').value = '';
    document.getElementById('form-user').reset();
    passGroup.classList.remove('hidden');
    passInput.required = true;
  }

  modal.classList.remove('hidden');
}

function closeUserModal() {
  document.getElementById('modal-user').classList.add('hidden');
}

async function handleSaveUser(e) {
  e.preventDefault();
  const id = document.getElementById('manage-user-id').value;
  const name = document.getElementById('user-fullname').value.trim();
  const username = document.getElementById('user-login').value.trim();
  const role = document.getElementById('user-role-select').value;
  const password = document.getElementById('user-pass').value;

  const isEdit = Boolean(id);
  const url = isEdit ? `/api/users/${id}` : '/api/users';
  const method = isEdit ? 'PUT' : 'POST';

  const payload = { name, username, role };
  if (!isEdit) {
    if (password.length < 6) {
      showToast('A senha deve ter no mínimo 6 caracteres', 'error');
      return;
    }
    payload.password = password;
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Erro ao salvar usuário', 'error');
      return;
    }

    showToast(isEdit ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!');
    closeUserModal();
    loadUsers();
  } catch (err) {
    showToast('Erro de conexão com o servidor', 'error');
  }
}

async function toggleUserStatus(userId, currentStatus) {
  const newStatus = currentStatus === 1 ? 0 : 1;
  const actionText = newStatus === 1 ? 'ativar' : 'desativar';

  showConfirmModal({
    title: `${newStatus === 1 ? 'Ativar' : 'Desativar'} Conta de Usuário`,
    message: `Tem certeza que deseja ${actionText} este usuário? Contas inativas não poderão autenticar no sistema.`,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/users/${userId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: newStatus })
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Erro ao alterar status', 'error');
          return;
        }
        showToast(data.message || `Usuário ${actionText}do com sucesso!`);
        loadUsers();
      } catch (err) {
        showToast('Erro ao atualizar status do usuário', 'error');
      }
    }
  });
}

function openResetPasswordModal(userId, username) {
  document.getElementById('reset-target-user-id').value = userId;
  document.getElementById('reset-target-username').textContent = username;
  document.getElementById('reset-new-password').value = '';
  document.getElementById('modal-reset-password').classList.remove('hidden');
}

function closeResetPasswordModal() {
  document.getElementById('modal-reset-password').classList.add('hidden');
}

async function handleResetPassword(e) {
  e.preventDefault();
  const userId = document.getElementById('reset-target-user-id').value;
  const new_password = document.getElementById('reset-new-password').value;

  if (new_password.length < 6) {
    showToast('A nova senha deve ter no mínimo 6 caracteres', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Erro ao redefinir senha', 'error');
      return;
    }

    showToast(data.message || 'Senha redefinida com sucesso!');
    closeResetPasswordModal();
  } catch (err) {
    showToast('Erro ao comunicar com o servidor', 'error');
  }
}

// ============================================================
// ADMINISTRAÇÃO: AUDITORIA
// ============================================================

async function loadAudit(page = 1) {
  state.auditPagination.page = page;

  const action = document.getElementById('audit-action')?.value || '';
  const start_date = document.getElementById('audit-start-date')?.value || '';
  const end_date = document.getElementById('audit-end-date')?.value || '';

  const params = new URLSearchParams({
    page,
    limit: 15,
    action,
    start_date,
    end_date
  });

  try {
    const res = await fetch(`/api/audit?${params.toString()}`);
    if (!res.ok) throw new Error('Falha ao listar auditoria');
    const result = await res.json();

    state.auditPagination = result.pagination;
    renderAuditTable(result.data);
    renderAuditPagination(result.pagination);
  } catch (err) {
    console.error('Erro ao carregar auditoria:', err);
    showToast('Erro ao carregar auditoria', 'error');
  }
}

function renderAuditTable(logs) {
  const tbody = document.getElementById('audit-table-body');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="9" class="table-empty-state">Nenhum evento de auditoria encontrado.</td></tr>
    `;
    return;
  }

  tbody.innerHTML = logs.map(l => {
    let actionBadge = `<span class="badge badge-action-create">CRIADO</span>`;
    if (l.action === 'UPDATE') actionBadge = `<span class="badge badge-action-update">ALTERADO</span>`;
    if (l.action === 'DELETE') actionBadge = `<span class="badge badge-action-delete">EXCLUÍDO</span>`;

    let transition = '-';
    if (l.action === 'CREATE') {
      transition = `<span class="badge ${l.new_status === 'present' ? 'badge-present' : 'badge-absent'}">Novo: ${l.new_status === 'present' ? 'Presente' : 'Ausente'}</span>`;
    } else if (l.action === 'UPDATE') {
      transition = `
        <span class="badge ${l.previous_status === 'present' ? 'badge-present' : 'badge-absent'}">${l.previous_status === 'present' ? 'Presente' : 'Ausente'}</span>
        →
        <span class="badge ${l.new_status === 'present' ? 'badge-present' : 'badge-absent'}">${l.new_status === 'present' ? 'Presente' : 'Ausente'}</span>
      `;
    } else if (l.action === 'DELETE') {
      transition = `<span class="badge badge-neutral">Removido (${l.previous_status === 'present' ? 'Presente' : 'Ausente'})</span>`;
    }

    return `
      <tr>
        <td class="font-mono text-xs text-slate-400">#${l.id}</td>
        <td class="text-xs text-slate-600 font-mono">${formatDateTimeBr(l.created_at)}</td>
        <td>${actionBadge}</td>
        <td><strong>${escapeHtml(l.user_name || 'Desconhecido')}</strong></td>
        <td>${escapeHtml(l.student_name || 'Aluno excluído')}</td>
        <td>${escapeHtml(l.course_title || 'Curso excluído')}</td>
        <td class="font-mono text-xs">${formatDateBr(l.date)}</td>
        <td>${transition}</td>
        <td class="text-xs text-slate-500">${escapeHtml(l.notes || '-')}</td>
      </tr>
    `;
  }).join('');
}

function renderAuditPagination(pagination) {
  const info = document.getElementById('audit-pagination-info');
  const buttons = document.getElementById('audit-pagination-buttons');
  if (!info || !buttons) return;

  info.textContent = `Página ${pagination.page} de ${pagination.totalPages} (${pagination.total} registros)`;

  buttons.innerHTML = `
    <button type="button" class="btn btn-xs btn-outline" ${pagination.page <= 1 ? 'disabled' : ''} onclick="loadAudit(${pagination.page - 1})">
      Anterior
    </button>
    <button type="button" class="btn btn-xs btn-outline" ${pagination.page >= pagination.totalPages ? 'disabled' : ''} onclick="loadAudit(${pagination.page + 1})">
      Próxima
    </button>
  `;
}

function resetAuditFilters() {
  document.getElementById('audit-action').value = '';
  document.getElementById('audit-start-date').value = '';
  document.getElementById('audit-end-date').value = '';
  loadAudit(1);
}

// ============================================================
// PERFIL DO USUÁRIO
// ============================================================

function loadProfile() {
  const user = state.currentUser;
  if (!user) return;

  document.getElementById('profile-name').textContent = user.name;
  document.getElementById('profile-username').textContent = user.username;
  document.getElementById('profile-role').textContent = user.role === 'admin' ? 'Administrador do Sistema' : 'Professor / Operador Padrão';
}

async function handleChangePassword(e) {
  e.preventDefault();
  const current_password = document.getElementById('curr-password').value;
  const new_password = document.getElementById('new-password').value;
  const conf_password = document.getElementById('conf-password').value;

  if (new_password !== conf_password) {
    showToast('A confirmação da nova senha não confere', 'error');
    return;
  }

  if (new_password.length < 6) {
    showToast('A nova senha deve ter no mínimo 6 caracteres', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password, new_password })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Erro ao alterar senha', 'error');
      return;
    }

    showToast('Senha alterada com sucesso!');
    document.getElementById('form-change-password').reset();
  } catch (err) {
    showToast('Erro ao comunicar com o servidor', 'error');
  }
}

// ============================================================
// MODAL DE CONFIRMAÇÃO GENÉRICO
// ============================================================

function showConfirmModal({ title, message, onConfirm }) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;

  const btnConfirm = document.getElementById('btn-confirm-action');
  
  // Substitui event listener clonando o botão
  const newBtn = btnConfirm.cloneNode(true);
  btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);

  newBtn.addEventListener('click', async () => {
    closeConfirmModal();
    if (typeof onConfirm === 'function') {
      await onConfirm();
    }
  });

  document.getElementById('modal-confirm').classList.remove('hidden');
}

function closeConfirmModal() {
  document.getElementById('modal-confirm').classList.add('hidden');
}
