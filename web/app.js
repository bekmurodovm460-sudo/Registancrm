    // =========================================================
    // 1. ASOSIY HOLAT (STATE), SAQLASH VA 711 O'QUVCHI BAZASI
    // =========================================================
    const STORAGE_KEY = 'registon_12maktab_crm_v1';
    let currentTab = 'dashboard';
    let openedClassName = null;
    let classInsideSearch = '';
    let classGradeFilter = 'ALL';
    let studentClassFilter = 'ALL';
    let studentSearch = '';
    let studentPage = 1;
    let mockRoomFilter = 'ALL';
    let mockSearch = '';
    let mockExamSession = '2026-11 (Noyabr Mock)';
    let winnersGradeFilter = 'ALL';
    let winnersSearch = '';
    let callFilter = 'ALL';
    let callSearch = '';
    let callPage = 1;
    let selectedCardPreviewStudentId = null;
    let grantGradeFilter = 'ALL';
    let pendingHtmlImportPayload = null;
    let pendingHtmlSelectedClasses = {};

    let state = {
      classes: [],
      students: [],
      mockStudents: [],
      payments: [],
      usedCards: {},
      schoolRules: { q1: 40, w1: 1.5, q2: 40, w2: 1 },
      mockRules: { q1: 20, w1: 3, q2: 20, w2: 2 },
      tgConfig: { token: '', chatId: '' },
      gdriveConfig: { scriptUrl: '' },
      gformsConfig: {
        viewUrl: '',
        submitUrl: '',
        entryName: '',
        entryClass: '',
        entryPhone: '',
        entryScore: '',
        lastSyncedAt: ''
      },
      kidsMockFormConfig: {
        viewUrl: '',
        submitUrl: '',
        entryName: '',
        entryRoom: '',
        entrySession: '',
        entryScore: '',
        lastSyncedAt: ''
      },
      sbConfig: { url: '', key: '' }
    };

    function escapeHtml(str) {
      return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function formatMoney(num) {
      return (Number(num) || 0).toLocaleString('ru-RU') + ' so‘m';
    }

    function getPromoCode(id) {
      return 'RGN12-' + String(id).padStart(4, '0');
    }

    function showToast(msg, icon = '✅') {
      const toast = document.getElementById('toast');
      const msgEl = document.getElementById('toast-msg');
      const iconEl = document.getElementById('toast-icon');
      if (!toast || !msgEl || !iconEl) return;
      msgEl.textContent = msg;
      iconEl.textContent = icon;
      toast.classList.remove('hidden');
      clearTimeout(window._toastTimer);
      window._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
    }

    function calcScore(q1, q2, rules) {
      const r = rules || state.schoolRules || { q1: 40, w1: 1.5, q2: 40, w2: 1 };
      const total = (Number(q1) || 0) * (Number(r.w1) || 1) + (Number(q2) || 0) * (Number(r.w2) || 1);
      return Math.round(total * 10) / 10;
    }

    function getGradeKey(className) {
      const m = String(className || '').match(/\d+/);
      return m ? `${m[0]}-sinflar` : 'Boshqa sinflar';
    }

    function generateDefault711Data() {
      const classDefs = [
        { name: '2-G', teacher: 'Xolmatova Nilufar', phone: '+998 90 112-02-01', count: 36 },
        { name: '3-B', teacher: 'Karimova Dilnoza', phone: '+998 90 112-03-01', count: 30 },
        { name: '3-V', teacher: 'Raximova Gulnoza', phone: '+998 90 112-03-02', count: 29 },
        { name: '3-G', teacher: 'Toshpo‘latova Madina', phone: '+998 90 112-03-03', count: 28 },
        { name: '4-A', teacher: 'Saidova Shahnoza', phone: '+998 90 112-04-01', count: 31 },
        { name: '4-B', teacher: 'Nazarova Feruza', phone: '+998 90 112-04-02', count: 30 },
        { name: '4-V', teacher: 'Qodirova Zulfiya', phone: '+998 90 112-04-03', count: 29 },
        { name: '4-G', teacher: 'Ergasheva Malika', phone: '+998 90 112-04-04', count: 28 },
        { name: '4-D', teacher: 'Jo‘rayeva Sevara', phone: '+998 90 112-04-05', count: 27 },
        { name: '5-B', teacher: 'Olimova Kamola', phone: '+998 90 112-05-01', count: 30 },
        { name: '5-V', teacher: 'Yusupova Munira', phone: '+998 90 112-05-02', count: 29 },
        { name: '5-G', teacher: 'Aliyeva Nodira', phone: '+998 90 112-05-03', count: 28 },
        { name: '5-E', teacher: 'Bozorova Umida', phone: '+998 90 112-05-04', count: 27 },
        { name: '6-A', teacher: 'Sultonova Barno', phone: '+998 90 112-06-01', count: 30 },
        { name: '6-G', teacher: 'Mamatova Dildora', phone: '+998 90 112-06-02', count: 29 },
        { name: '7-A', teacher: 'Xasanova Lola', phone: '+998 90 112-07-01', count: 29 },
        { name: '7-B', teacher: 'Normurodova Nigora', phone: '+998 90 112-07-02', count: 28 },
        { name: '7-V', teacher: 'Shukurova Sanobar', phone: '+998 90 112-07-03', count: 27 },
        { name: '7-G', teacher: 'Pardayeva Mohira', phone: '+998 90 112-07-04', count: 28 },
        { name: '8-A', teacher: 'Rustamova Zamira', phone: '+998 90 112-08-01', count: 28 },
        { name: '8-B', teacher: 'Abdurahmonova Surayyo', phone: '+998 90 112-08-02', count: 27 },
        { name: '8-V', teacher: 'Xo‘jayeva Maftuna', phone: '+998 90 112-08-03', count: 26 },
        { name: '8-D', teacher: 'Ismoilova Gulbahor', phone: '+998 90 112-08-04', count: 27 },
        { name: '9-B', teacher: 'G‘aniyeva Oygul', phone: '+998 90 112-09-01', count: 25 },
        { name: '9-V', teacher: 'Mirzayeva Shoira', phone: '+998 90 112-09-02', count: 25 }
      ];

      const firstNames = ['Azizbek', 'Jasmina', 'Muhammadali', 'Madina', 'Sardorbek', 'Sevinch', 'Behruz', 'Mubina', 'Diyorbek', 'Ziyoda', 'Shohrux', 'Ruxshona', 'Amirxon', 'Gulsanam', 'Bobur', 'Charos', 'Islombek', 'Dilnura', 'Samandar', 'Nozima'];
      const lastNames = ['Karimov', 'Toshmatov', 'Raximov', 'Saidov', 'Nazarov', 'Qodirov', 'Ergashev', 'Jo‘rayev', 'Olimov', 'Yusupov', 'Aliyev', 'Bozorov', 'Sultonov', 'Mamatov', 'Xasanov', 'Normurodov', 'Shukurov', 'Pardayev', 'Rustamov', 'Abdurahmonov'];

      const classes = classDefs.map(c => ({
        name: c.name,
        teacher: c.teacher,
        phone: c.phone,
        expected: c.count
      }));

      const students = [];
      let id = 1;
      classDefs.forEach((c, cIdx) => {
        for (let i = 0; i < c.count; i++) {
          const fn = firstNames[(id + cIdx) % firstNames.length];
          const lnBase = lastNames[(id * 3 + i) % lastNames.length];
          const isGirl = fn.endsWith('a') || fn === 'Sevinch' || fn === 'Charos' || fn === 'Gulsanam';
          const ln = isGirl ? lnBase + 'a' : lnBase;
          const q1 = 14 + ((id * 7 + i * 3) % 27);
          const q2 = 15 + ((id * 5 + i * 4) % 26);
          const hasPhone = (id % 4 !== 0);
          const phone = hasPhone ? `+998 9${id % 9} ${String(100 + (id % 899)).padStart(3, '0')}-${String(10 + (id % 89)).padStart(2, '0')}-${String(10 + ((id * 3) % 89)).padStart(2, '0')}` : '';
          students.push({
            id: id++,
            fullName: `${ln} ${fn}`,
            className: c.name,
            phone,
            q1,
            q2,
            score: calcScore(q1, q2, { q1: 40, w1: 1.5, q2: 40, w2: 1 }),
            callStatus: hasPhone ? 'Yangi' : 'Raqamsiz',
            note: ''
          });
        }
      });

      return { classes, students };
    }

    function ensureAllStudentClassesExist() {
      const existing = new Set((state.classes || []).map(c => c.name));
      (state.students || []).forEach(s => {
        if (s.className && !existing.has(s.className)) {
          existing.add(s.className);
          state.classes.push({
            name: s.className,
            teacher: `${s.className} Sinf Rahbari`,
            phone: '',
            expected: 30
          });
        }
      });
    }

    function saveState() {
      // Bulutli baza: o'zgarishlar db.js orqali Supabase'ga sinxronlanadi
      updateHeaderStats();
      if (window.crmQueueSync) window.crmQueueSync();
    }

    function loadState() {
      // Ma'lumotlar db.js tomonidan Supabase'dan yuklanadi (state to'ldiriladi)
      if (!Array.isArray(state.classes)) state.classes = [];
      if (!Array.isArray(state.students)) state.students = [];
      if (!Array.isArray(state.mockStudents)) state.mockStudents = [];
      if (!Array.isArray(state.payments)) state.payments = [];
      if (!state.usedCards || typeof state.usedCards !== 'object') state.usedCards = {};
      ensureAllStudentClassesExist();
      updateHeaderStats();
    }

    // Ko'p foydalanuvchili rejimda to'qnashmaydigan yangi ID (server ajratgan blokdan)
    function crmNextId() {
      const blk = window.__crmIdBlock;
      const all = [...(state.students || []), ...(state.mockStudents || [])].map(x => Number(x.id) || 0);
      if (!blk) return all.reduce((m, v) => Math.max(m, v), 0) + 1;
      const inBlock = all.filter(v => v >= blk.start && v < blk.end);
      const next = inBlock.length ? Math.max(...inBlock) + 1 : blk.start;
      if (next > blk.end - 100 && window.crm && !blk.refilling) {
        blk.refilling = true;
        window.crm.reserveIdBlock();
      }
      return next;
    }

    function updateHeaderStats() {
      const badge = document.getElementById('header-count-badge');
      if (badge) {
        badge.textContent = `${state.students.length} O‘quvchi · ${state.classes.length} Sinf · Parallel TOP-3`;
      }
    }

    // =========================================================
    // 2. PARALLEL SINFLAR KESIMIDA REYTING VA TOP-3 SOVRINDORLAR
    // =========================================================
    function getParallelRankMap() {
      const byGrade = {};
      (state.students || []).forEach(st => {
        const gKey = getGradeKey(st.className);
        if (!byGrade[gKey]) byGrade[gKey] = [];
        byGrade[gKey].push(st);
      });

      const rankMap = new Map();
      Object.keys(byGrade).forEach(gKey => {
        const sorted = [...byGrade[gKey]].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
        sorted.forEach((st, idx) => {
          rankMap.set(st.id, {
            gradeKey: gKey,
            rank: idx + 1,
            totalInParallel: sorted.length
          });
        });
      });
      return rankMap;
    }

    function getStudentPrizeInfo(student, rankMap) {
      const map = rankMap || getParallelRankMap();
      const info = map.get(student.id) || { gradeKey: getGradeKey(student.className), rank: 999, totalInParallel: 1 };
      if (info.rank === 1) {
        return {
          ...info,
          tier: '🥇 1-o‘rin (Parallel TOP-3)',
          amount: 150000,
          badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
          quote: 'Birinchi qadam — eng katta ilhom! Bilimingiz bilan yangi cho‘qqilarni zabt eting!'
        };
      }
      if (info.rank === 2) {
        return {
          ...info,
          tier: '🥈 2-o‘rin (Parallel TOP-3)',
          amount: 100000,
          badgeClass: 'bg-slate-200 text-slate-900 border-slate-400',
          quote: 'Kuchli natija va yuksak intilish! Keyingi marra albatta 1-o‘rin!'
        };
      }
      if (info.rank === 3) {
        return {
          ...info,
          tier: '🥉 3-o‘rin (Parallel TOP-3)',
          amount: 75000,
          badgeClass: 'bg-orange-100 text-orange-900 border-orange-300',
          quote: 'Ajoyib yutuq! Har bir mehnat kelajakdagi katta g‘alabaga yo‘l ochadi!'
        };
      }
      return {
        ...info,
        tier: 'Ishtirokchi',
        amount: 0,
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        quote: 'Bilim olishda davom eting — keyingi bosqichda siz ham TOP-3 safida bo‘lasiz!'
      };
    }

    function getAllParallelTop3Winners() {
      const rankMap = getParallelRankMap();
      const winners = [];
      (state.students || []).forEach(st => {
        const prize = getStudentPrizeInfo(st, rankMap);
        if (prize.rank >= 1 && prize.rank <= 3) {
          winners.push({ student: st, prize });
        }
      });
      return winners.sort((a, b) => {
        if (a.prize.gradeKey !== b.prize.gradeKey) return a.prize.gradeKey.localeCompare(b.prize.gradeKey);
        return a.prize.rank - b.prize.rank;
      });
    }

    function getTeacherLeaderboard() {
      const rankMap = getParallelRankMap();
      return (state.classes || []).map(cls => {
        const clsStudents = (state.students || []).filter(s => s.className === cls.name);
        const count = clsStudents.length;
        const expected = Number(cls.expected) || Math.max(count, 25);
        const attendancePct = Math.min(100, Math.round((count / expected) * 100));
        const withPhone = clsStudents.filter(s => s.phone && s.phone.trim()).length;
        const phonePct = count ? Math.round((withPhone / count) * 100) : 0;
        const avgScore = count ? Math.round((clsStudents.reduce((acc, s) => acc + (Number(s.score) || 0), 0) / count) * 10) / 10 : 0;
        const top3Count = clsStudents.filter(s => {
          const p = getStudentPrizeInfo(s, rankMap);
          return p.rank >= 1 && p.rank <= 3;
        }).length;
        const activityScore = Math.round((attendancePct * 0.4 + phonePct * 0.3 + Math.min(100, avgScore) * 0.3 + top3Count * 3) * 10) / 10;
        return {
          ...cls,
          gradeKey: getGradeKey(cls.name),
          studentCount: count,
          attendancePct,
          phonePct,
          avgScore,
          top3Count,
          activityScore
        };
      }).sort((a, b) => b.activityScore - a.activityScore);
    }

    // =========================================================
    // 3. DASHBOARD (BOSHQARUV PANELI)
    // =========================================================
    function renderDashboardTab() {
      const container = document.getElementById('tab-dashboard');
      const totalStudents = state.students.length;
      const totalClasses = state.classes.length;
      const avgScore = totalStudents ? (state.students.reduce((a, b) => a + (Number(b.score) || 0), 0) / totalStudents).toFixed(1) : '0.0';
      const phoneCount = state.students.filter(s => s.phone && s.phone.trim()).length;
      const phonePct = totalStudents ? Math.round((phoneCount / totalStudents) * 100) : 0;
      const winners = getAllParallelTop3Winners();
      const totalPrizeFund = winners.reduce((a, w) => a + w.prize.amount, 0);
      const totalPayments = (state.payments || []).reduce((a, p) => a + (Number(p.finalAmount) || 0), 0);

      const band80 = state.students.filter(s => Number(s.score) >= 80).length;
      const band60 = state.students.filter(s => Number(s.score) >= 60 && Number(s.score) < 80).length;
      const band40 = state.students.filter(s => Number(s.score) >= 40 && Number(s.score) < 60).length;
      const bandLow = state.students.filter(s => Number(s.score) < 40).length;

      const teachersTop5 = getTeacherLeaderboard().slice(0, 5);

      const gradesMap = {};
      state.students.forEach(s => {
        const gk = getGradeKey(s.className);
        if (!gradesMap[gk]) gradesMap[gk] = { count: 0, sum: 0 };
        gradesMap[gk].count++;
        gradesMap[gk].sum += Number(s.score) || 0;
      });
      const gradeStats = Object.keys(gradesMap).sort().map(gk => ({
        gk,
        count: gradesMap[gk].count,
        avg: gradesMap[gk].count ? (gradesMap[gk].sum / gradesMap[gk].count).toFixed(1) : '0.0'
      }));

      container.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3.5">
          <div onclick="switchTab('students')" class="cursor-pointer bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:border-orange-300 transition">
            <div class="text-[11px] font-bold text-slate-500">Jami O‘quvchilar</div>
            <div class="text-2xl font-black text-slate-900 mt-1">${totalStudents}</div>
            <div class="text-[11px] text-indigo-700 font-bold mt-1">${totalClasses} ta sinf bazada</div>
          </div>
          <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
            <div class="text-[11px] font-bold text-slate-500">O‘rtacha Ball</div>
            <div class="text-2xl font-black text-indigo-700 mt-1">${avgScore}</div>
            <div class="text-[11px] text-slate-500 mt-1">12-maktab ko‘rsatkichi</div>
          </div>
          <div onclick="switchTab('calls')" class="cursor-pointer bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:border-sky-300 transition">
            <div class="text-[11px] font-bold text-slate-500">Telefonli Lidlar</div>
            <div class="text-2xl font-black text-sky-700 mt-1">${phoneCount} <span class="text-xs font-bold">(${phonePct}%)</span></div>
            <div class="text-[11px] text-slate-500 mt-1">Call CRM tayyor</div>
          </div>
          <div onclick="switchTab('winners')" class="cursor-pointer bg-white rounded-2xl p-4 border border-amber-300 shadow-sm hover:bg-amber-50/40 transition">
            <div class="text-[11px] font-bold text-amber-800">Parallel TOP-3 G‘oliblar</div>
            <div class="text-2xl font-black text-amber-600 mt-1">${winners.length}</div>
            <div class="text-[11px] text-amber-700 font-bold mt-1">Har paralleldan 3 o‘rin</div>
          </div>
          <div onclick="switchTab('cards')" class="cursor-pointer bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:border-emerald-300 transition">
            <div class="text-[11px] font-bold text-slate-500">Yutuqli Kartalar Fondi</div>
            <div class="text-lg font-black text-emerald-700 mt-1">${formatMoney(totalPrizeFund)}</div>
            <div class="text-[11px] text-slate-500 mt-1">2 oy amal qiladi</div>
          </div>
          <div onclick="switchTab('kassa')" class="cursor-pointer bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:border-purple-300 transition">
            <div class="text-[11px] font-bold text-slate-500">Kassa Tushumi</div>
            <div class="text-lg font-black text-purple-700 mt-1">${formatMoney(totalPayments)}</div>
            <div class="text-[11px] text-slate-500 mt-1">${(state.payments || []).length} ta to‘lov</div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div class="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="font-black text-base text-slate-900">📈 Ballar Taqsimoti</h3>
              <span class="text-xs font-bold text-slate-500">${totalStudents} o‘quvchi</span>
            </div>
            ${[
              { label: '🔥 80+ ball (A’lo)', val: band80, color: 'bg-emerald-500' },
              { label: '⚡ 60–79 ball (Yaxshi)', val: band60, color: 'bg-indigo-500' },
              { label: '📘 40–59 ball (O‘rta)', val: band40, color: 'bg-amber-500' },
              { label: '🌱 0–39 ball (Boshlang‘ich)', val: bandLow, color: 'bg-rose-500' }
            ].map(item => {
              const pct = totalStudents ? Math.round((item.val / totalStudents) * 100) : 0;
              return `
                <div class="space-y-1">
                  <div class="flex justify-between text-xs font-bold">
                    <span>${item.label}</span>
                    <span>${item.val} nafar (${pct}%)</span>
                  </div>
                  <div class="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div class="${item.color} h-full rounded-full" style="width:${pct}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="lg:col-span-7 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="font-black text-base text-slate-900">👑 Eng Faol Sinf Rahbarlari (TOP-5)</h3>
              <button onclick="switchTab('classes')" class="text-xs font-extrabold text-orange-600 hover:underline">Barcha sinflar →</button>
            </div>
            <div class="divide-y divide-slate-100">
              ${teachersTop5.map((t, idx) => `
                <div onclick="openClassInside('${escapeHtml(t.name)}')" class="py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 px-2 rounded-xl transition">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="w-7 h-7 rounded-full bg-amber-100 text-amber-900 font-black text-xs flex items-center justify-center shrink-0">${idx + 1}</span>
                    <div class="min-w-0">
                      <div class="font-extrabold text-xs text-slate-900 truncate">${escapeHtml(t.teacher)} <span class="text-indigo-700">(${escapeHtml(t.name)})</span></div>
                      <div class="text-[11px] text-slate-500">${t.studentCount} o‘quvchi · O‘rtacha: <b>${t.avgScore}</b> · Tel: ${t.phonePct}%</div>
                    </div>
                  </div>
                  <span class="px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black shrink-0">${t.activityScore} ball</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 class="font-black text-base text-slate-900">📊 Parallel Sinflar Ko‘rsatkichlari (Birlashtirilgan TOP-3 Tizimi)</h3>
          <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            ${gradeStats.map(g => `
              <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                <div class="text-xs font-black text-slate-900">${escapeHtml(g.gk)}</div>
                <div class="text-lg font-black text-indigo-700 mt-0.5">${g.avg}</div>
                <div class="text-[10px] font-bold text-slate-500">${g.count} o‘quvchi</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // =========================================================
    // 4. 12-MAKTAB SINFLARI VA SINF ICHKI OYNALARI
    // =========================================================
    function openClassInside(className) {
      openedClassName = className;
      classInsideSearch = '';
      switchTab('classes');
    }

    function renderClassesTab() {
      const container = document.getElementById('tab-classes');
      const rankMap = getParallelRankMap();
      const leaderboard = getTeacherLeaderboard();
      const grades = ['ALL', ...Array.from(new Set((state.classes || []).map(c => getGradeKey(c.name)))).sort()];

      if (openedClassName) {
        const clsObj = (state.classes || []).find(c => c.name === openedClassName) || { name: openedClassName, teacher: `${openedClassName} Sinf Rahbari`, phone: '', expected: 30 };
        const gradeKey = getGradeKey(clsObj.name);
        const parallelClasses = (state.classes || []).filter(c => getGradeKey(c.name) === gradeKey);
        const classStudents = (state.students || [])
          .filter(s => s.className === clsObj.name)
          .filter(s => !classInsideSearch || s.fullName.toLowerCase().includes(classInsideSearch.toLowerCase()) || (s.phone || '').includes(classInsideSearch))
          .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

        const allInClass = (state.students || []).filter(s => s.className === clsObj.name);
        const avgClsScore = allInClass.length ? (allInClass.reduce((a, b) => a + (Number(b.score) || 0), 0) / allInClass.length).toFixed(1) : '0.0';
        const avgQ1 = allInClass.length ? (allInClass.reduce((a, b) => a + (Number(b.q1) || 0), 0) / allInClass.length).toFixed(1) : '0.0';
        const avgQ2 = allInClass.length ? (allInClass.reduce((a, b) => a + (Number(b.q2) || 0), 0) / allInClass.length).toFixed(1) : '0.0';

        container.innerHTML = `
          <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div class="flex items-center gap-2.5 flex-wrap">
              <button onclick="openedClassName=null; renderClassesTab()" class="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-xs font-extrabold">← Barcha sinflar</button>
              <h2 class="text-lg font-black text-slate-900">📂 ${escapeHtml(clsObj.name)} Sinfi Ichki Oynasi</h2>
              <span class="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-extrabold">${escapeHtml(gradeKey)}</span>
            </div>
            <div class="flex items-center gap-1.5 flex-wrap">
              ${parallelClasses.map(pc => `
                <button onclick="openClassInside('${escapeHtml(pc.name)}')" class="px-2.5 py-1.5 rounded-xl text-xs font-extrabold transition ${pc.name === clsObj.name ? 'bg-[#F2642A] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">${escapeHtml(pc.name)}</button>
              `).join('')}
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <!-- 1-OYNA: Sinf ko'rsatkichlari -->
            <div class="lg:col-span-4 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
              <div class="text-xs font-black uppercase text-indigo-700">1-Oyna · Sinf Ko‘rsatkichlari</div>
              <div class="grid grid-cols-2 gap-2.5">
                <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div class="text-[11px] text-slate-500 font-bold">O‘quvchilar</div>
                  <div class="text-xl font-black text-slate-900">${allInClass.length}</div>
                </div>
                <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div class="text-[11px] text-slate-500 font-bold">O‘rtacha ball</div>
                  <div class="text-xl font-black text-indigo-700">${avgClsScore}</div>
                </div>
                <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div class="text-[11px] text-slate-500 font-bold">1-fan o‘rtacha</div>
                  <div class="text-lg font-black text-slate-800">${avgQ1}</div>
                </div>
                <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <div class="text-[11px] text-slate-500 font-bold">2-fan o‘rtacha</div>
                  <div class="text-lg font-black text-slate-800">${avgQ2}</div>
                </div>
              </div>
              <div class="pt-2 border-t border-slate-100 space-y-2 text-xs">
                <div class="font-bold text-slate-700">Sinf rahbari ma’lumotlari</div>
                <input id="cls-teacher-inp" value="${escapeHtml(clsObj.teacher || '')}" placeholder="Sinf rahbari F.I.Sh." class="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold" />
                <input id="cls-phone-inp" value="${escapeHtml(clsObj.phone || '')}" placeholder="Telefon raqami" class="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold" />
                <button onclick="saveClassTeacherInfo('${escapeHtml(clsObj.name)}')" class="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold">💾 Rahbar ma’lumotini saqlash</button>
              </div>
            </div>

            <!-- 2-OYNA: Yangi o'quvchi qo'shish -->
            <div class="lg:col-span-4 bg-white rounded-3xl p-5 border border-emerald-200 shadow-sm space-y-3">
              <div class="text-xs font-black uppercase text-emerald-700">2-Oyna · ${escapeHtml(clsObj.name)} Sinfga O‘quvchi Qo‘shish</div>
              <div class="space-y-2.5 text-xs">
                <div>
                  <label class="font-bold text-slate-600">O‘quvchi F.I.Sh.</label>
                  <input id="add-st-name" placeholder="Masalan: Karimov Azizbek" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-bold" />
                </div>
                <div>
                  <label class="font-bold text-slate-600">Ota-ona telefoni</label>
                  <input id="add-st-phone" placeholder="+998 90 123-45-67" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-semibold" />
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="font-bold text-slate-600">1-fan to‘g‘ri javob</label>
                    <input type="number" id="add-st-q1" value="25" min="0" oninput="updateLiveAddedScore()" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-bold" />
                  </div>
                  <div>
                    <label class="font-bold text-slate-600">2-fan to‘g‘ri javob</label>
                    <input type="number" id="add-st-q2" value="25" min="0" oninput="updateLiveAddedScore()" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-bold" />
                  </div>
                </div>
                <div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <span class="font-bold text-emerald-900">Hisoblangan ball:</span>
                  <span id="live-added-score" class="text-base font-black text-emerald-700">${calcScore(25, 25, state.schoolRules)}</span>
                </div>
                <button onclick="addStudentToClass('${escapeHtml(clsObj.name)}')" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow">➕ O‘quvchini qo‘shish</button>
              </div>
            </div>

            <!-- 3-OYNA: Parallel sinflar taqqoslash -->
            <div class="lg:col-span-4 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
              <div class="text-xs font-black uppercase text-amber-700">3-Oyna · ${escapeHtml(gradeKey)} Parallel Taqqoslash</div>
              <div class="space-y-2.5">
                ${parallelClasses.map(pc => {
                  const pSt = (state.students || []).filter(s => s.className === pc.name);
                  const pAvg = pSt.length ? (pSt.reduce((a, b) => a + (Number(b.score) || 0), 0) / pSt.length).toFixed(1) : '0.0';
                  const pct = Math.min(100, Math.round(Number(pAvg)));
                  return `
                    <div class="space-y-1">
                      <div class="flex justify-between text-xs font-bold">
                        <span>${escapeHtml(pc.name)} (${pSt.length} o‘quvchi)</span>
                        <span class="text-indigo-700">${pAvg} ball</span>
                      </div>
                      <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div class="bg-[#F2642A] h-full rounded-full" style="width:${pct}%"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>

          <!-- 4-OYNA: Sinf o'quvchilari jadvali -->
          <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="text-sm font-black text-slate-900">4-Oyna · ${escapeHtml(clsObj.name)} Sinfi O‘quvchilari (${classStudents.length})</div>
              <input value="${escapeHtml(classInsideSearch)}" oninput="classInsideSearch=this.value; renderClassesTab()" placeholder="Ism yoki telefon bo‘yicha qidirish..." class="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold w-full sm:w-64" />
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                    <th class="py-2.5 px-2">#</th>
                    <th class="py-2.5 px-2">F.I.Sh.</th>
                    <th class="py-2.5 px-2">Telefon</th>
                    <th class="py-2.5 px-2">1-fan</th>
                    <th class="py-2.5 px-2">2-fan</th>
                    <th class="py-2.5 px-2">Ball</th>
                    <th class="py-2.5 px-2">Parallel TOP-3</th>
                    <th class="py-2.5 px-2 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${classStudents.map((st, idx) => {
                    const prize = getStudentPrizeInfo(st, rankMap);
                    return `
                      <tr class="hover:bg-slate-50">
                        <td class="py-2 px-2 font-bold">${idx + 1}</td>
                        <td class="py-2 px-2 font-extrabold text-slate-900">${escapeHtml(st.fullName)}</td>
                        <td class="py-2 px-2 text-slate-600">${escapeHtml(st.phone || '—')}</td>
                        <td class="py-2 px-2 font-semibold">${st.q1}</td>
                        <td class="py-2 px-2 font-semibold">${st.q2}</td>
                        <td class="py-2 px-2 font-black text-indigo-700">${st.score}</td>
                        <td class="py-2 px-2"><span class="px-2 py-0.5 rounded-full border text-[11px] font-bold ${prize.badgeClass}">${prize.rank <= 3 ? prize.tier : `#${prize.rank} (${prize.gradeKey})`}</span></td>
                        <td class="py-2 px-2 text-right">
                          <button onclick="deleteStudentById(${st.id})" class="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold">🗑️</button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
        return;
      }

      const filteredClasses = (state.classes || []).filter(c => classGradeFilter === 'ALL' || getGradeKey(c.name) === classGradeFilter);

      container.innerHTML = `
        <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-black text-slate-900">👑 Eng Faol Sinf Rahbarlari Reytingi</h2>
              <p class="text-xs text-slate-500">Qatnashish foizi, telefon raqamlari, o‘rtacha ball va parallel TOP-3 sovrindorlar asosida hisoblanadi</p>
            </div>
            <button onclick="openAddClassModal()" class="px-4 py-2 rounded-xl bg-[#F2642A] hover:bg-orange-600 text-white text-xs font-black shadow">➕ Yangi sinf qo‘shish</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
            ${leaderboard.slice(0, 5).map((t, i) => `
              <div onclick="openClassInside('${escapeHtml(t.name)}')" class="cursor-pointer p-3.5 rounded-2xl border ${i === 0 ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'} hover:shadow transition">
                <div class="flex items-center justify-between text-xs font-black">
                  <span>#${i + 1} · ${escapeHtml(t.name)}</span>
                  <span class="text-indigo-700">${t.activityScore}</span>
                </div>
                <div class="font-extrabold text-xs text-slate-900 mt-1 truncate">${escapeHtml(t.teacher)}</div>
                <div class="text-[11px] text-slate-500 mt-1">${t.studentCount} o‘quvchi · O‘rt: ${t.avgScore}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          ${grades.map(g => `
            <button onclick="classGradeFilter='${escapeHtml(g)}'; renderClassesTab()" class="px-3 py-1.5 rounded-xl text-xs font-extrabold transition ${classGradeFilter === g ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}">${g === 'ALL' ? 'Barcha parallellar' : escapeHtml(g)}</button>
          `).join('')}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          ${filteredClasses.map(cls => {
            const stList = (state.students || []).filter(s => s.className === cls.name);
            const avg = stList.length ? (stList.reduce((a, b) => a + (Number(b.score) || 0), 0) / stList.length).toFixed(1) : '0.0';
            const top3 = [...stList].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)).slice(0, 3);
            return `
              <div onclick="openClassInside('${escapeHtml(cls.name)}')" class="cursor-pointer bg-white rounded-3xl p-4 border border-slate-200 shadow-sm hover:border-orange-400 hover:shadow-md transition flex flex-col justify-between gap-3">
                <div>
                  <div class="flex items-center justify-between">
                    <span class="px-2.5 py-1 rounded-xl bg-slate-900 text-white text-xs font-black">${escapeHtml(cls.name)}</span>
                    <span class="text-xs font-black text-indigo-700">O‘rt: ${avg}</span>
                  </div>
                  <div class="font-extrabold text-sm text-slate-900 mt-2 truncate">${escapeHtml(cls.teacher)}</div>
                  <div class="text-[11px] text-slate-500">${stList.length} nafar o‘quvchi</div>
                  <div class="mt-2.5 space-y-1">
                    ${top3.map((s, idx) => `
                      <div class="text-[11px] flex justify-between bg-slate-50 px-2 py-1 rounded-lg">
                        <span class="truncate font-semibold">${['🥇','🥈','🥉'][idx]} ${escapeHtml(s.fullName)}</span>
                        <span class="font-black text-slate-800 ml-1">${s.score}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
                <button type="button" class="w-full py-2 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-800 text-xs font-black border border-orange-200">📂 Sinfga kirish / + Qo‘shish</button>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    function updateLiveAddedScore() {
      const q1 = document.getElementById('add-st-q1')?.value || 0;
      const q2 = document.getElementById('add-st-q2')?.value || 0;
      const el = document.getElementById('live-added-score');
      if (el) el.textContent = calcScore(q1, q2, state.schoolRules);
    }

    function addStudentToClass(className) {
      const fullName = (document.getElementById('add-st-name')?.value || '').trim();
      const phone = (document.getElementById('add-st-phone')?.value || '').trim();
      const q1 = Number(document.getElementById('add-st-q1')?.value || 0);
      const q2 = Number(document.getElementById('add-st-q2')?.value || 0);
      if (!fullName) {
        showToast('O‘quvchi F.I.Sh. ni kiriting!', '⚠️');
        return;
      }
      const nextId = crmNextId();
      state.students.push({
        id: nextId,
        fullName,
        className,
        phone,
        q1,
        q2,
        score: calcScore(q1, q2, state.schoolRules),
        callStatus: phone ? 'Yangi' : 'Raqamsiz',
        note: ''
      });
      saveState();
      renderClassesTab();
      showToast(`${fullName} (${className}) bazaga qo‘shildi!`);
    }

    function saveClassTeacherInfo(className) {
      const teacher = (document.getElementById('cls-teacher-inp')?.value || '').trim();
      const phone = (document.getElementById('cls-phone-inp')?.value || '').trim();
      const cls = state.classes.find(c => c.name === className);
      if (cls) {
        if (teacher) cls.teacher = teacher;
        cls.phone = phone;
        saveState();
        showToast(`${className} sinf rahbari ma’lumotlari saqlandi!`);
      }
    }

    function deleteStudentById(id) {
      state.students = state.students.filter(s => s.id !== id);
      saveState();
      renderCurrentTab();
      showToast('O‘quvchi o‘chirildi', '🗑️');
    }

    // =========================================================
    // 5. O'QUVCHILAR BAZASI
    // =========================================================
    function renderStudentsTab() {
      const container = document.getElementById('tab-students');
      const rankMap = getParallelRankMap();
      const filtered = (state.students || [])
        .filter(s => studentClassFilter === 'ALL' || s.className === studentClassFilter)
        .filter(s => !studentSearch || s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) || (s.phone || '').includes(studentSearch))
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

      const pageSize = 30;
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (studentPage > totalPages) studentPage = totalPages;
      const slice = filtered.slice((studentPage - 1) * pageSize, studentPage * pageSize);

      container.innerHTML = `
        <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-lg font-black text-slate-900">🎓 O‘quvchilar Bazasi (${filtered.length} ta)</h2>
            <div class="flex flex-wrap gap-2">
              <select onchange="studentClassFilter=this.value; studentPage=1; renderStudentsTab()" class="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white">
                <option value="ALL">Barcha sinflar</option>
                ${(state.classes || []).map(c => `<option value="${escapeHtml(c.name)}" ${studentClassFilter === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
              <input value="${escapeHtml(studentSearch)}" oninput="studentSearch=this.value; studentPage=1; renderStudentsTab()" placeholder="Ism yoki telefon..." class="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold" />
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                  <th class="py-2.5 px-2">ID</th>
                  <th class="py-2.5 px-2">F.I.Sh.</th>
                  <th class="py-2.5 px-2">Sinf</th>
                  <th class="py-2.5 px-2">Telefon</th>
                  <th class="py-2.5 px-2">Ball</th>
                  <th class="py-2.5 px-2">Parallel O‘rni</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${slice.map(st => {
                  const p = getStudentPrizeInfo(st, rankMap);
                  return `
                    <tr class="hover:bg-slate-50">
                      <td class="py-2 px-2 font-bold text-slate-500">#${st.id}</td>
                      <td class="py-2 px-2 font-extrabold text-slate-900">${escapeHtml(st.fullName)}</td>
                      <td class="py-2 px-2 font-bold text-indigo-700">${escapeHtml(st.className)}</td>
                      <td class="py-2 px-2 text-slate-600">${escapeHtml(st.phone || '—')}</td>
                      <td class="py-2 px-2 font-black text-slate-900">${st.score}</td>
                      <td class="py-2 px-2"><span class="px-2 py-0.5 rounded-full border text-[11px] font-bold ${p.badgeClass}">${p.rank <= 3 ? p.tier : `#${p.rank} (${p.gradeKey})`}</span></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="flex items-center justify-between text-xs pt-2">
            <span class="text-slate-500 font-bold">Sahifa ${studentPage} / ${totalPages}</span>
            <div class="flex gap-2">
              <button ${studentPage <= 1 ? 'disabled' : ''} onclick="studentPage--; renderStudentsTab()" class="px-3 py-1.5 rounded-xl bg-slate-100 disabled:opacity-40 font-bold">← Oldingi</button>
              <button ${studentPage >= totalPages ? 'disabled' : ''} onclick="studentPage++; renderStudentsTab()" class="px-3 py-1.5 rounded-xl bg-slate-100 disabled:opacity-40 font-bold">Keyingi →</button>
            </div>
          </div>
        </div>
      `;
    }

    // =========================================================
    // 6. KIDS MOCK BO'LIMI
    // =========================================================
    function renderKidsMockTab() {
      const container = document.getElementById('tab-kidsmock');
      const mCfg = state.kidsMockFormConfig || {};
      const list = (state.mockStudents || [])
        .filter(m => mockRoomFilter === 'ALL' || m.room === mockRoomFilter)
        .filter(m => !mockSearch || m.fullName.toLowerCase().includes(mockSearch.toLowerCase()))
        .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
      const topMock = list[0] || null;

      container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div class="lg:col-span-4 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="font-black text-base text-slate-900">➕ Kids Mock Natija Qo‘shish</h3>
              <button onclick="openMockRulesModal()" class="text-xs font-extrabold text-indigo-600 hover:underline">⚖️ Mezon</button>
            </div>
            <input id="mock-session-inp" value="${escapeHtml(mockExamSession)}" onchange="mockExamSession=this.value" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold" />
            <input id="mock-name-inp" placeholder="O‘quvchi F.I.Sh." class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold" />
            <select id="mock-room-inp" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white">
              <option value="1-xona">1-xona</option>
              <option value="2-xona">2-xona</option>
              <option value="3-xona">3-xona</option>
            </select>
            <div class="grid grid-cols-2 gap-2">
              <input type="number" id="mock-q1-inp" value="15" min="0" placeholder="1-fan" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold" />
              <input type="number" id="mock-q2-inp" value="15" min="0" placeholder="2-fan" class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold" />
            </div>
            <button onclick="addKidsMockStudent()" class="w-full py-2.5 rounded-xl bg-[#F2642A] hover:bg-orange-600 text-white text-xs font-black shadow">➕ Mock natijani saqlash</button>
          </div>

          <div class="lg:col-span-8 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="font-black text-base text-slate-900">🏆 Kids Mock Reytingi (${list.length})</h3>
              <div class="flex gap-2">
                <select onchange="mockRoomFilter=this.value; renderKidsMockTab()" class="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-white">
                  <option value="ALL">Barcha xonalar</option>
                  <option value="1-xona">1-xona</option>
                  <option value="2-xona">2-xona</option>
                  <option value="3-xona">3-xona</option>
                </select>
                <input value="${escapeHtml(mockSearch)}" oninput="mockSearch=this.value; renderKidsMockTab()" placeholder="Qidirish..." class="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-semibold" />
              </div>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                    <th class="py-2 px-2">#</th>
                    <th class="py-2 px-2">F.I.Sh.</th>
                    <th class="py-2 px-2">Xona</th>
                    <th class="py-2 px-2">Sessiya</th>
                    <th class="py-2 px-2">Ball</th>
                    <th class="py-2 px-2 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${list.map((m, idx) => `
                    <tr>
                      <td class="py-2 px-2 font-bold">${idx + 1}</td>
                      <td class="py-2 px-2 font-extrabold">${escapeHtml(m.fullName)}</td>
                      <td class="py-2 px-2 font-bold text-indigo-700">${escapeHtml(m.room)}</td>
                      <td class="py-2 px-2 text-slate-500">${escapeHtml(m.session || mockExamSession)}</td>
                      <td class="py-2 px-2 font-black">${m.score}</td>
                      <td class="py-2 px-2 text-right"><button onclick="deleteMockStudent(${m.id})" class="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 font-bold">🗑️</button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- KIDS MOCK UCHUN GOOGLE FORM ULASH PANELI -->
        <div class="bg-white rounded-3xl p-5 border border-indigo-200 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 class="font-black text-base text-slate-900">📝 Kids Mock Google Form Integratsiyasi</h3>
              <p class="text-xs text-slate-500">Kids Mock imtihoniga ro‘yxatdan o‘tish yoki natijalarni Google Form orqali qabul qilish va CSV import qilish</p>
            </div>
            <span class="px-3 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-extrabold">
              ${mCfg.lastSyncedAt ? `Sinxron: ${escapeHtml(mCfg.lastSyncedAt)}` : 'Kids Mock Form tayyor'}
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <label class="font-extrabold text-slate-700">Kids Mock Google Form havolasi (viewform)</label>
              <input id="km-gf-view-url" value="${escapeHtml(mCfg.viewUrl || '')}" placeholder="https://docs.google.com/forms/d/e/.../viewform" class="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-300 font-mono" />
            </div>
            <div>
              <label class="font-extrabold text-slate-700">Yuborish manzili (formResponse)</label>
              <input id="km-gf-submit-url" value="${escapeHtml(mCfg.submitUrl || '')}" placeholder="https://docs.google.com/forms/d/e/.../formResponse" class="w-full mt-1 px-3.5 py-2 rounded-xl border border-slate-300 font-mono" />
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div>
              <label class="text-[11px] font-bold text-slate-500">F.I.Sh. (entry)</label>
              <input id="km-gf-entry-name" value="${escapeHtml(mCfg.entryName || '')}" placeholder="entry.111111" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono" />
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-500">Xona (entry)</label>
              <input id="km-gf-entry-room" value="${escapeHtml(mCfg.entryRoom || '')}" placeholder="entry.222222" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono" />
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-500">Sessiya (entry)</label>
              <input id="km-gf-entry-session" value="${escapeHtml(mCfg.entrySession || '')}" placeholder="entry.333333" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono" />
            </div>
            <div>
              <label class="text-[11px] font-bold text-slate-500">Ball (entry)</label>
              <input id="km-gf-entry-score" value="${escapeHtml(mCfg.entryScore || '')}" placeholder="entry.444444" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 font-mono" />
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div class="flex flex-wrap gap-2">
              <button type="button" onclick="saveKidsMockGoogleFormConfig()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow">💾 Sozlamani saqlash</button>
              <button type="button" onclick="openKidsMockGoogleForm()" class="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-xs font-extrabold">🔗 Kids Mock Formani ochish</button>
              ${topMock ? `
                <button type="button" onclick="sendKidsMockToGoogleForm(${topMock.id})" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow">
                  📤 Top natija (${escapeHtml(topMock.fullName)}) ni Formaga yuborish
                </button>
              ` : ''}
            </div>

            <label class="inline-flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow">
              <span>📥 Kids Mock CSV import</span>
              <input type="file" accept=".csv,text/csv" onchange="importKidsMockGoogleFormCsv(event)" class="hidden" />
            </label>
          </div>
        </div>
      `;
    }

    function saveKidsMockGoogleFormConfig() {
      const viewUrl = document.getElementById('km-gf-view-url').value.trim();
      let submitUrl = document.getElementById('km-gf-submit-url').value.trim();
      if (!submitUrl && viewUrl.includes('/viewform')) {
        submitUrl = viewUrl.replace('/viewform', '/formResponse');
      }
      state.kidsMockFormConfig = {
        viewUrl,
        submitUrl,
        entryName: document.getElementById('km-gf-entry-name').value.trim(),
        entryRoom: document.getElementById('km-gf-entry-room').value.trim(),
        entrySession: document.getElementById('km-gf-entry-session').value.trim(),
        entryScore: document.getElementById('km-gf-entry-score').value.trim(),
        lastSyncedAt: new Date().toLocaleString('uz-RU')
      };
      saveState();
      renderKidsMockTab();
      showToast('Kids Mock Google Form sozlamalari saqlandi!');
    }

    function openKidsMockGoogleForm() {
      const url = (document.getElementById('km-gf-view-url')?.value || state.kidsMockFormConfig?.viewUrl || '').trim();
      if (!url) {
        showToast('Avval Kids Mock Google Form havolasini (viewform URL) kiriting!', '⚠️');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    function sendKidsMockToGoogleForm(mockId) {
      const cfg = state.kidsMockFormConfig || {};
      const item = (state.mockStudents || []).find(m => m.id === mockId);
      if (!item) return;
      const endpoint = (cfg.submitUrl || (cfg.viewUrl ? cfg.viewUrl.replace('/viewform', '/formResponse') : '')).trim();
      if (!endpoint) {
        showToast('Avval Kids Mock formResponse URL manzilini kiriting va saqlang!', '⚠️');
        return;
      }

      const params = new URLSearchParams();
      if (cfg.entryName) params.append(cfg.entryName, item.fullName);
      if (cfg.entryRoom) params.append(cfg.entryRoom, item.room || '1-xona');
      if (cfg.entrySession) params.append(cfg.entrySession, item.session || mockExamSession);
      if (cfg.entryScore) params.append(cfg.entryScore, String(item.score));

      if (![...params.keys()].length) {
        showToast('Kamida bitta entry.XXXXX maydonini kiriting!', '⚠️');
        return;
      }

      fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: params.toString()
      }).then(() => {
        state.kidsMockFormConfig.lastSyncedAt = new Date().toLocaleString('uz-RU');
        saveState();
        renderKidsMockTab();
        showToast(`${item.fullName} Kids Mock natijasi Google Formaga yuborildi!`, '📝');
      }).catch(err => {
        showToast('Yuborishda xato: ' + (err?.message || 'tarmoq xatosi'), '⚠️');
      });
    }

    function importKidsMockGoogleFormCsv(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          const text = String(e.target.result || '');
          const lines = text.split(/\r?\n/).filter(l => l.trim());
          if (lines.length < 2) {
            showToast('CSV fayl bo‘sh yoki noto‘g‘ri!', '⚠️');
            return;
          }
          const sep = lines[0].includes(';') ? ';' : ',';
          let added = 0;
          let nextId = crmNextId();

          for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(sep).map(c => c.replace(/^"|"$/g, '').trim());
            const fullName = cols.find(c => /[A-Za-zА-Яа-яЎўҚқҒғҲҳ']{2,}/.test(c) && !/xona/i.test(c) && isNaN(Number(c)));
            if (!fullName) continue;
            const room = cols.find(c => /xona/i.test(c)) || '1-xona';
            const nums = cols.map(c => Number(c)).filter(n => !isNaN(n) && n > 0 && n <= 200);
            const score = nums.length ? nums[nums.length - 1] : 0;

            state.mockStudents.push({
              id: nextId++,
              fullName,
              room,
              session: mockExamSession,
              q1: nums[0] || 0,
              q2: nums[1] || 0,
              score
            });
            added++;
          }

          if (!added) {
            showToast('CSV fayldan Kids Mock ishtirokchilari topilmadi!', '⚠️');
            return;
          }
          state.kidsMockFormConfig.lastSyncedAt = new Date().toLocaleString('uz-RU');
          saveState();
          renderKidsMockTab();
          showToast(`Kids Mock bazasiga ${added} nafar ishtirokchi qo‘shildi!`, '📥');
        } catch (err) {
          showToast('CSV o‘qishda xato: ' + (err?.message || 'xatolik'), '⚠️');
        }
      };
      reader.readAsText(file);
    }

    function addKidsMockStudent() {
      const fullName = (document.getElementById('mock-name-inp')?.value || '').trim();
      const room = document.getElementById('mock-room-inp')?.value || '1-xona';
      const q1 = Number(document.getElementById('mock-q1-inp')?.value || 0);
      const q2 = Number(document.getElementById('mock-q2-inp')?.value || 0);
      if (!fullName) return;
      const id = crmNextId();
      state.mockStudents.push({
        id,
        fullName,
        room,
        session: mockExamSession,
        q1,
        q2,
        score: calcScore(q1, q2, state.mockRules)
      });
      saveState();
      renderKidsMockTab();
      showToast(`${fullName} Kids Mock natijasi qo‘shildi!`);
    }

    function deleteMockStudent(id) {
      state.mockStudents = state.mockStudents.filter(m => m.id !== id);
      saveState();
      renderKidsMockTab();
    }

    // =========================================================
    // 7. SOVRINDORLAR (HAR BIR PARALLELDAN TOP-3)
    // =========================================================
    function renderWinnersTab() {
      const container = document.getElementById('tab-winners');
      const winners = getAllParallelTop3Winners()
        .filter(w => winnersGradeFilter === 'ALL' || w.prize.gradeKey === winnersGradeFilter)
        .filter(w => !winnersSearch || w.student.fullName.toLowerCase().includes(winnersSearch.toLowerCase()) || w.student.className.toLowerCase().includes(winnersSearch.toLowerCase()));

      const grades = ['ALL', ...Array.from(new Set(getAllParallelTop3Winners().map(w => w.prize.gradeKey))).sort()];

      container.innerHTML = `
        <div class="bg-white rounded-3xl p-5 border border-amber-300 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-lg font-black text-slate-900">🥇 Sovrindorlar — Har Bir Paralleldan TOP-3</h2>
              <p class="text-xs text-slate-500">Parallel sinflar birlashtirilib eng yuqori ball olgan 1-, 2-, 3-o‘rinlar (150k / 100k / 75k)</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button onclick="exportWinnersExcel()" class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow">📥 Sovrindorlar Excel</button>
              <button onclick="runWinnersDiagnostic()" class="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-extrabold">🩺 Diagnostika</button>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap gap-1.5">
              ${grades.map(g => `
                <button onclick="winnersGradeFilter='${escapeHtml(g)}'; renderWinnersTab()" class="px-3 py-1.5 rounded-xl text-xs font-extrabold ${winnersGradeFilter === g ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-700'}">${g === 'ALL' ? 'Barcha parallellar' : escapeHtml(g)}</button>
              `).join('')}
            </div>
            <input value="${escapeHtml(winnersSearch)}" oninput="winnersSearch=this.value; renderWinnersTab()" placeholder="Ism yoki sinf qidirish..." class="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold" />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            ${winners.map(({ student, prize }) => `
              <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3">
                <div>
                  <div class="flex items-center justify-between gap-2">
                    <span class="px-2.5 py-0.5 rounded-full border text-[11px] font-black ${prize.badgeClass}">${prize.tier}</span>
                    <span class="text-xs font-black text-indigo-700">${escapeHtml(prize.gradeKey)} · ${escapeHtml(student.className)}</span>
                  </div>
                  <div class="font-black text-base text-slate-900 mt-2">${escapeHtml(student.fullName)}</div>
                  <div class="text-xs text-slate-600 mt-0.5">Ball: <b>${student.score}</b> · Karta: <b class="text-emerald-700">${formatMoney(prize.amount)}</b></div>
                  <div class="text-[11px] italic text-slate-500 mt-1.5">“${escapeHtml(prize.quote)}”</div>
                </div>
                <div class="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200/70">
                  <button onclick="openStudentCardPreview(${student.id})" class="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] font-bold">🏅 Karta</button>
                  <button onclick="sendVipCardToTelegramBot(${student.id})" class="px-3 py-1.5 rounded-xl bg-sky-600 text-white text-[11px] font-bold">🤖 Rasm yuborish</button>
                  <button onclick="applyWinnerDiscountToKassa(${student.id})" class="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold">💳 Kassaga o‘tkazish</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    function exportWinnersExcel() {
      try {
        const winners = getAllParallelTop3Winners();
        if (!winners.length) {
          showToast('Sovrindorlar topilmadi!', '⚠️');
          return;
        }
        const rows = winners.map(({ student, prize }) => ({
          'Parallel': prize.gradeKey,
          'O‘rin': prize.rank,
          'Sinf': student.className,
          'F.I.Sh.': student.fullName,
          'Telefon': student.phone || '',
          'Ball': student.score,
          'Yutuq summasi': prize.amount,
          'Promo-kod': getPromoCode(student.id)
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sovrindorlar_TOP3');
        XLSX.writeFile(wb, `Sovrindorlar_TOP3_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('Sovrindorlar Excel fayli yuklandi!');
      } catch (e) {
        showToast('Excel xatosi: ' + e.message, '⚠️');
      }
    }

    function runWinnersDiagnostic() {
      const winners = getAllParallelTop3Winners();
      const withoutPhone = winners.filter(w => !w.student.phone).length;
      showToast(`Diagnostika: ${winners.length} ta sovrindor aniqlandi, ${withoutPhone} tasida telefon kiritilmagan.`, '🩺');
    }

    // =========================================================
    // 8. CALL CRM, YUTUQLI KARTALAR, KASSA, GRANTLAR, OTA-ONA PORTALI
    // =========================================================
    function renderCallsTab() {
      const container = document.getElementById('tab-calls');
      const filtered = (state.students || [])
        .filter(s => callFilter === 'ALL' || s.callStatus === callFilter)
        .filter(s => !callSearch || s.fullName.toLowerCase().includes(callSearch.toLowerCase()) || (s.phone || '').includes(callSearch));

      const pageSize = 25;
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (callPage > totalPages) callPage = totalPages;
      const rows = filtered.slice((callPage - 1) * pageSize, callPage * pageSize);

      container.innerHTML = `
        <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-lg font-black text-slate-900">📞 Call CRM (${filtered.length} ta lid)</h2>
            <div class="flex gap-2">
              <select onchange="callFilter=this.value; callPage=1; renderCallsTab()" class="px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white">
                <option value="ALL">Barcha holatlar</option>
                <option value="Yangi">Yangi</option>
                <option value="Bog‘lanildi">Bog‘lanildi</option>
                <option value="Sinov darsiga yozildi">Sinov darsiga yozildi</option>
                <option value="Raqamsiz">Raqamsiz</option>
              </select>
              <input value="${escapeHtml(callSearch)}" oninput="callSearch=this.value; callPage=1; renderCallsTab()" placeholder="Ism yoki telefon..." class="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold" />
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                  <th class="py-2 px-2">F.I.Sh.</th>
                  <th class="py-2 px-2">Sinf</th>
                  <th class="py-2 px-2">Telefon</th>
                  <th class="py-2 px-2">Ball</th>
                  <th class="py-2 px-2">Holat</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${rows.map(s => `
                  <tr>
                    <td class="py-2 px-2 font-extrabold">${escapeHtml(s.fullName)}</td>
                    <td class="py-2 px-2 font-bold text-indigo-700">${escapeHtml(s.className)}</td>
                    <td class="py-2 px-2">${escapeHtml(s.phone || '—')}</td>
                    <td class="py-2 px-2 font-black">${s.score}</td>
                    <td class="py-2 px-2">
                      <select onchange="updateCallStatus(${s.id}, this.value)" class="px-2 py-1 rounded-lg border border-slate-300 text-xs font-bold bg-white">
                        ${['Yangi', 'Bog‘lanildi', 'Sinov darsiga yozildi', 'Raqamsiz'].map(st => `<option value="${st}" ${s.callStatus === st ? 'selected' : ''}>${st}</option>`).join('')}
                      </select>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function updateCallStatus(id, status) {
      const st = state.students.find(s => s.id === id);
      if (st) {
        st.callStatus = status;
        saveState();
        showToast(`Holat yangilandi: ${status}`);
      }
    }

    function openStudentCardPreview(id) {
      selectedCardPreviewStudentId = id;
      switchTab('cards');
    }

    function buildCardCanvas(student, prize) {
      const canvas = document.createElement('canvas');
      canvas.width = 1120;
      canvas.height = 640;
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      let borderColor = 'rgba(253, 224, 71, 0.75)';
      let accentColor = '#fde047';
      let subColor = '#fef08a';
      let badgeLabel = '👑 1-O‘RIN · OLTIN YUTUQLI KARTA';

      if (prize.rank === 1) {
        grad.addColorStop(0, '#1f1002');
        grad.addColorStop(0.5, '#78350f');
        grad.addColorStop(1, '#d97706');
        borderColor = 'rgba(253, 224, 71, 0.85)';
        accentColor = '#fde047';
        subColor = '#fef08a';
        badgeLabel = '🥇 1-O‘RIN · OLTIN YUTUQLI KARTA';
      } else if (prize.rank === 2) {
        grad.addColorStop(0, '#090d16');
        grad.addColorStop(0.5, '#1e293b');
        grad.addColorStop(1, '#64748b');
        borderColor = 'rgba(226, 232, 240, 0.85)';
        accentColor = '#f1f5f9';
        subColor = '#cbd5e1';
        badgeLabel = '🥈 2-O‘RIN · KUMUSH YUTUQLI KARTA';
      } else {
        grad.addColorStop(0, '#230b04');
        grad.addColorStop(0.5, '#7c2d12');
        grad.addColorStop(1, '#c2410c');
        borderColor = 'rgba(253, 186, 116, 0.85)';
        accentColor = '#fdba74';
        subColor = '#ffedd5';
        badgeLabel = '🥉 3-O‘RIN · BRONZA YUTUQLI KARTA';
      }

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Dekorativ doira bezaklari (o'rin bo'yicha farqli)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      ctx.arc(prize.rank === 1 ? 960 : prize.rank === 2 ? 920 : 980, 140, prize.rank === 1 ? 210 : 175, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = prize.rank === 1 ? 6 : 4;
      ctx.strokeRect(26, 26, canvas.width - 52, canvas.height - 52);

      ctx.fillStyle = accentColor;
      ctx.font = '900 26px Inter, sans-serif';
      ctx.fillText(`REGISTON LC · ${badgeLabel} (${prize.gradeKey})`, 64, 92);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 54px Inter, sans-serif';
      ctx.fillText(student.fullName || 'Sovrindor O‘quvchi', 64, 210);

      ctx.fillStyle = subColor;
      ctx.font = '800 32px Inter, sans-serif';
      ctx.fillText(`${prize.tier} · ${student.className} sinfi`, 64, 275);

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 46px Inter, sans-serif';
      ctx.fillText(`Chegirma: ${formatMoney(prize.amount)}`, 64, 355);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 24px Inter, sans-serif';
      ctx.fillText(prize.quote, 64, 435);

      ctx.fillStyle = accentColor;
      ctx.font = '800 24px Inter, sans-serif';
      ctx.fillText(`Promo-kod: ${getPromoCode(student.id)} · 2 oy davomida amal qiladi`, 64, 545);

      return canvas;
    }

    function downloadVipCardPng(studentId) {
      const rankMap = getParallelRankMap();
      const st = state.students.find(s => s.id === studentId);
      if (!st) return;
      const prize = getStudentPrizeInfo(st, rankMap);
      const canvas = buildCardCanvas(st, prize);
      const a = document.createElement('a');
      a.download = `Karta_${st.fullName.replace(/\s+/g, '_')}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
      showToast('Karta PNG rasm sifatida yuklandi!');
    }

    async function sendVipCardToTelegramBot(studentId) {
      const token = (state.tgConfig?.token || '').trim();
      const chatId = (state.tgConfig?.chatId || '').trim();
      if (!token || !chatId) {
        showToast('Avval Telegram Bot bo‘limida Token va Chat ID kiriting!', '⚠️');
        switchTab('telegram');
        return;
      }
      const rankMap = getParallelRankMap();
      const st = state.students.find(s => s.id === studentId);
      if (!st) return;
      const prize = getStudentPrizeInfo(st, rankMap);
      const canvas = buildCardCanvas(st, prize);

      canvas.toBlob(async (blob) => {
        try {
          const form = new FormData();
          form.append('chat_id', chatId);
          form.append('photo', blob, `card_${st.id}.png`);
          form.append('caption', `🏆 ${st.fullName} (${st.className})\n${prize.tier}\nKarta: ${formatMoney(prize.amount)}\nKod: ${getPromoCode(st.id)}\n⏳ 2 oy davomida amal qiladi`);
          const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: 'POST', body: form });
          const data = await res.json();
          if (data.ok) {
            showToast('Karta rasmi Telegram botdan yuborildi!', '🤖');
          } else {
            showToast('Telegram xatosi: ' + (data.description || 'yuborilmadi'), '⚠️');
          }
        } catch (err) {
          showToast('Yuborishda xato: ' + err.message, '⚠️');
        }
      }, 'image/png');
    }

    function renderCardsTab() {
      const container = document.getElementById('tab-cards');
      const rankMap = getParallelRankMap();
      const winners = getAllParallelTop3Winners();
      const currentSt = state.students.find(s => s.id === selectedCardPreviewStudentId) || (winners[0] && winners[0].student) || state.students[0];
      if (!currentSt) {
        container.innerHTML = `<div class="bg-white rounded-3xl p-6 text-center text-sm font-bold text-slate-500">Bazda o‘quvchilar mavjud emas.</div>`;
        return;
      }
      const prize = getStudentPrizeInfo(currentSt, rankMap);

      const cardThemes = {
        1: {
          wrapper: 'from-[#261302] via-[#78350f] to-[#d97706] border-amber-300 shadow-amber-900/30',
          badge: 'bg-amber-400/20 border-amber-300/60 text-amber-100',
          title: 'text-amber-300',
          amount: 'text-amber-200',
          label: '🥇 OLTIN KARTA · 1-O‘RIN'
        },
        2: {
          wrapper: 'from-[#090d16] via-[#1e293b] to-[#64748b] border-slate-300 shadow-slate-900/30',
          badge: 'bg-slate-200/20 border-slate-200/60 text-slate-100',
          title: 'text-slate-200',
          amount: 'text-sky-200',
          label: '🥈 KUMUSH KARTA · 2-O‘RIN'
        },
        3: {
          wrapper: 'from-[#230b04] via-[#7c2d12] to-[#c2410c] border-orange-300 shadow-orange-900/30',
          badge: 'bg-orange-400/20 border-orange-300/60 text-orange-100',
          title: 'text-orange-200',
          amount: 'text-amber-200',
          label: '🥉 BRONZA KARTA · 3-O‘RIN'
        }
      };
      const theme = cardThemes[prize.rank] || cardThemes[3];

      container.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div class="lg:col-span-7 bg-gradient-to-br ${theme.wrapper} text-white rounded-3xl p-7 shadow-2xl border-2 flex flex-col justify-between min-h-[340px] relative overflow-hidden">
            <div class="flex items-center justify-between gap-2 relative z-10">
              <span class="px-3 py-1 rounded-full border text-xs font-black ${theme.badge}">${escapeHtml(prize.gradeKey)} · ${escapeHtml(currentSt.className)}</span>
              <span class="text-xs font-black uppercase tracking-wider ${theme.title}">${theme.label}</span>
            </div>
            <div class="my-5 space-y-2 relative z-10">
              <div class="text-xs font-extrabold ${theme.title}">${escapeHtml(prize.tier)}</div>
              <div class="text-2xl sm:text-4xl font-black tracking-tight">${escapeHtml(currentSt.fullName)}</div>
              <div class="text-2xl font-black ${theme.amount}">${formatMoney(prize.amount)}</div>
              <p class="text-xs sm:text-sm text-white/90 italic max-w-xl">“${escapeHtml(prize.quote)}”</p>
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/20 text-xs font-bold relative z-10">
              <span>Promo-kod: <b class="font-mono ${theme.title}">${getPromoCode(currentSt.id)}</b></span>
              <span>⏳ 2 oy davomida amal qiladi</span>
            </div>
          </div>

          <div class="lg:col-span-5 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
            <h3 class="font-black text-base text-slate-900">🏅 Sovrindor Kartasini Tanlash va Yuborish</h3>
            <select onchange="selectedCardPreviewStudentId=Number(this.value); renderCardsTab()" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white">
              ${winners.map(({ student, prize: pr }) => `
                <option value="${student.id}" ${student.id === currentSt.id ? 'selected' : ''}>
                  ${escapeHtml(pr.gradeKey)} · ${escapeHtml(pr.tier)} — ${escapeHtml(student.fullName)} (${escapeHtml(student.className)})
                </option>
              `).join('')}
            </select>
            <div class="flex flex-wrap gap-2">
              <button onclick="downloadVipCardPng(${currentSt.id})" class="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-xs font-black">🖼️ PNG rasm yuklash</button>
              <button onclick="sendVipCardToTelegramBot(${currentSt.id})" class="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black">🤖 Botdan rasm yuborish</button>
              <button onclick="applyWinnerDiscountToKassa(${currentSt.id})" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black">💳 Kassaga o‘tkazish</button>
            </div>
          </div>
        </div>
      `;
    }

    function applyWinnerDiscountToKassa(studentId) {
      const rankMap = getParallelRankMap();
      const st = state.students.find(s => s.id === studentId);
      if (!st) return;
      const prize = getStudentPrizeInfo(st, rankMap);
      const baseCourse = 485000;
      const finalAmount = Math.max(0, baseCourse - prize.amount);
      state.payments.unshift({
        id: Date.now(),
        studentName: st.fullName,
        className: st.className,
        promo: getPromoCode(st.id),
        discount: prize.amount,
        finalAmount,
        date: new Date().toLocaleString('uz-RU')
      });
      saveState();
      switchTab('kassa');
      showToast(`${st.fullName} uchun ${formatMoney(prize.amount)} chegirma kassaga qo‘llandi!`);
    }

    function renderKassaTab() {
      const container = document.getElementById('tab-kassa');
      const total = (state.payments || []).reduce((a, p) => a + (Number(p.finalAmount) || 0), 0);
      container.innerHTML = `
        <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-black text-slate-900">💳 Kassa va Chegirmalar</h2>
            <span class="px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black">Jami tushum: ${formatMoney(total)}</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                  <th class="py-2 px-2">Sana</th>
                  <th class="py-2 px-2">O‘quvchi</th>
                  <th class="py-2 px-2">Sinf</th>
                  <th class="py-2 px-2">Promo-kod</th>
                  <th class="py-2 px-2">Chegirma</th>
                  <th class="py-2 px-2">To‘lov</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${(state.payments || []).map(p => `
                  <tr>
                    <td class="py-2 px-2 text-slate-500">${escapeHtml(p.date)}</td>
                    <td class="py-2 px-2 font-extrabold">${escapeHtml(p.studentName)}</td>
                    <td class="py-2 px-2 font-bold">${escapeHtml(p.className)}</td>
                    <td class="py-2 px-2 font-mono">${escapeHtml(p.promo)}</td>
                    <td class="py-2 px-2 text-emerald-700 font-bold">-${formatMoney(p.discount)}</td>
                    <td class="py-2 px-2 font-black text-slate-900">${formatMoney(p.finalAmount)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderGroupsTab() {
      const container = document.getElementById('tab-groups');
      const winners = getAllParallelTop3Winners();
      const grades = ['ALL', ...Array.from(new Set(winners.map(w => w.prize.gradeKey))).sort()];
      const filtered = winners.filter(w => grantGradeFilter === 'ALL' || w.prize.gradeKey === grantGradeFilter);

      container.innerHTML = `
        <div class="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-lg font-black text-slate-900">🏛️ Parallel TOP-3 Grantlari</h2>
            <div class="flex flex-wrap gap-1.5">
              ${grades.map(g => `
                <button onclick="grantGradeFilter='${escapeHtml(g)}'; renderGroupsTab()" class="px-3 py-1.5 rounded-xl text-xs font-extrabold ${grantGradeFilter === g ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}">${g === 'ALL' ? 'Barchasi' : escapeHtml(g)}</button>
              `).join('')}
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            ${filtered.map(({ student, prize }) => `
              <div class="p-4 rounded-2xl border border-slate-200 bg-slate-50">
                <div class="text-xs font-black text-indigo-700">${escapeHtml(prize.gradeKey)} · ${escapeHtml(prize.tier)}</div>
                <div class="font-extrabold text-sm text-slate-900 mt-1">${escapeHtml(student.fullName)} (${escapeHtml(student.className)})</div>
                <div class="text-xs text-slate-600 mt-1">Ball: <b>${student.score}</b> · Grant: <b class="text-emerald-700">${formatMoney(prize.amount)}</b></div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    function renderParentTab() {
      const container = document.getElementById('tab-parent');
      container.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h2 class="text-lg font-black text-slate-900">👨‍👩‍👧‍👦 Ota-ona Portali — Natijani Tekshirish</h2>
          <p class="text-xs text-slate-500">Farzandingizning F.I.Sh. yoki telefon raqami orqali balli va parallel TOP-3 o‘rnini tekshiring.</p>
          <input id="parent-search-inp" oninput="renderParentResult()" placeholder="Masalan: Karimov yoki +998 90..." class="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold" />
          <div id="parent-search-result" class="space-y-2.5 text-xs"></div>
        </div>
      `;
      renderParentResult();
    }

    function renderParentResult() {
      const q = (document.getElementById('parent-search-inp')?.value || '').trim().toLowerCase();
      const box = document.getElementById('parent-search-result');
      if (!box) return;
      if (!q) {
        box.innerHTML = `<div class="text-slate-400 font-semibold">Qidirish uchun ism yoki telefon raqamini kiriting.</div>`;
        return;
      }
      const rankMap = getParallelRankMap();
      const matches = (state.students || []).filter(s => s.fullName.toLowerCase().includes(q) || (s.phone || '').toLowerCase().includes(q)).slice(0, 10);
      if (!matches.length) {
        box.innerHTML = `<div class="text-rose-600 font-bold">Mos o‘quvchi topilmadi.</div>`;
        return;
      }
      box.innerHTML = matches.map(st => {
        const p = getStudentPrizeInfo(st, rankMap);
        return `
          <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
            <div>
              <div class="font-black text-slate-900">${escapeHtml(st.fullName)} <span class="text-indigo-700">(${escapeHtml(st.className)})</span></div>
              <div class="text-slate-600 mt-0.5">Ball: <b>${st.score}</b> · ${p.rank <= 3 ? `<b class="text-amber-700">${p.tier} (${formatMoney(p.amount)})</b>` : `${p.gradeKey} da #${p.rank}-o‘rin`}</div>
            </div>
            <button onclick="openStudentCardPreview(${st.id})" class="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold">🏅 Karta</button>
          </div>
        `;
      }).join('');
    }

    // =========================================================
    // 11. TAB 9, 10, 11, 12: TELEGRAM, GOOGLE DRIVE, GOOGLE FORMS, SUPABASE
    // =========================================================
    function renderTelegramTab() {
      const container = document.getElementById('tab-telegram');
      const winners = getAllParallelTop3Winners();
      const defaultWinnerId = selectedCardPreviewStudentId || (winners[0] && winners[0].student.id) || (state.students[0] && state.students[0].id) || '';

      container.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <h2 class="text-xl font-black text-slate-900">🤖 Telegram Bot Integratsiyasi (Rasm Yuborish)</h2>
          <p class="text-xs text-slate-500">Bot tokeni va Chat ID ni kiriting — sovrindorning shaxsiy yutuqli karta rasmi (PNG) <code>sendPhoto</code> orqali to‘g‘ridan-to‘g‘ri Telegramga yuboriladi.</p>
          <div class="space-y-3">
            <input id="tg-token-inp" value="${escapeHtml(state.tgConfig.token || '')}" placeholder="BotFather Token (123456:ABC...)" class="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-mono" />
            <input id="tg-chat-inp" value="${escapeHtml(state.tgConfig.chatId || '')}" placeholder="Admin / Guruh / Ota-ona Chat ID (-100... yoki 123456789)" class="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-mono" />
            <div class="flex flex-wrap gap-2">
              <button onclick="saveTelegramConfig()" class="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black">💾 Bot sozlamalarini saqlash</button>
            </div>
          </div>

          ${winners.length ? `
            <div class="pt-4 border-t border-slate-100 space-y-2.5">
              <div class="text-xs font-black text-slate-800">🖼️ Sovrindor karta rasmini botdan yuborish</div>
              <div class="flex flex-wrap gap-2">
                <select id="tg-winner-select" class="flex-1 min-w-[220px] px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold bg-white">
                  ${winners.map(({ student, prize }) => `
                    <option value="${student.id}" ${student.id === defaultWinnerId ? 'selected' : ''}>
                      ${escapeHtml(prize.gradeKey)} · ${escapeHtml(student.className)} — ${escapeHtml(student.fullName)} (${formatMoney(prize.amount)})
                    </option>
                  `).join('')}
                </select>
                <button onclick="sendVipCardToTelegramBot(Number(document.getElementById('tg-winner-select').value))" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow">
                  📤 Karta rasmini yuborish
                </button>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    function saveTelegramConfig() {
      state.tgConfig.token = document.getElementById('tg-token-inp').value.trim();
      state.tgConfig.chatId = document.getElementById('tg-chat-inp').value.trim();
      saveState();
      showToast('Telegram bot sozlamalari saqlandi!');
    }

    function renderGdriveTab() {
      const container = document.getElementById('tab-gdrive');
      container.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <h2 class="text-xl font-black text-slate-900">📂 Google Drive / Apps Script Zaxira</h2>
          <p class="text-xs text-slate-500">Barcha 711 o‘quvchi va sinf TOP-3 natijalarini Google Sheets / Drive ga zaxiralash.</p>
          <input id="gd-url-inp" value="${escapeHtml(state.gdriveConfig.scriptUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec" class="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-mono" />
          <button onclick="state.gdriveConfig.scriptUrl=document.getElementById('gd-url-inp').value.trim(); saveState(); showToast('Google Drive manzili saqlandi!')" class="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black">💾 Saqlash</button>
        </div>
      `;
    }

    function renderGformsTab() {
      const container = document.getElementById('tab-gforms');
      const cfg = state.gformsConfig || {};
      const winners = getAllParallelTop3Winners();
      const defaultWinner = (winners[0] && winners[0].student) || state.students[0] || null;

      container.innerHTML = `
        <div class="max-w-3xl mx-auto bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 class="text-xl font-black text-slate-900">📝 Google Forms Integratsiyasi</h2>
              <p class="text-xs text-slate-500 mt-0.5">O‘quvchilar/ota-onalar ro‘yxatdan o‘tishi yoki natija yuborishi uchun Google Formani ulang va javoblarni bazaga import qiling.</p>
            </div>
            <span class="px-3 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-extrabold">
              ${cfg.lastSyncedAt ? `Oxirgi sinxron: ${escapeHtml(cfg.lastSyncedAt)}` : 'Sozlashga tayyor'}
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div class="space-y-1.5">
              <label class="font-extrabold text-slate-700">Google Form havolasi (yoki Sheets CSV havola — avtomatik sozlanadi)</label>
              <input id="gf-view-url" value="${escapeHtml(cfg.viewUrl || '')}" oninput="autoConnectGoogleFormUrl(this.value, 'school')" onchange="autoConnectGoogleFormUrl(this.value, 'school')" placeholder="https://docs.google.com/forms/d/e/.../viewform" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono" />
            </div>
            <div class="space-y-1.5">
              <label class="font-extrabold text-slate-700">Yuborish manzili (formResponse — avtomatik to‘ldiriladi)</label>
              <input id="gf-submit-url" value="${escapeHtml(cfg.submitUrl || '')}" placeholder="https://docs.google.com/forms/d/e/.../formResponse" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono" />
            </div>
          </div>

          <div class="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3 text-xs">
            <div class="font-black text-slate-900">🔗 Savol maydonlari (entry.XXXXX ID lari)</div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label class="text-[11px] font-bold text-slate-500">F.I.Sh. (entry)</label>
                <input id="gf-entry-name" value="${escapeHtml(cfg.entryName || '')}" placeholder="entry.123456" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono" />
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-500">Sinf (entry)</label>
                <input id="gf-entry-class" value="${escapeHtml(cfg.entryClass || '')}" placeholder="entry.234567" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono" />
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-500">Telefon (entry)</label>
                <input id="gf-entry-phone" value="${escapeHtml(cfg.entryPhone || '')}" placeholder="entry.345678" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono" />
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-500">Ball / Izoh (entry)</label>
                <input id="gf-entry-score" value="${escapeHtml(cfg.entryScore || '')}" placeholder="entry.456789" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono" />
              </div>
            </div>
            <div class="flex flex-wrap gap-2 pt-1">
              <button type="button" onclick="saveGoogleFormsConfig()" class="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow">💾 Google Form sozlamalarini saqlash</button>
              <button type="button" onclick="openConfiguredGoogleForm()" class="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-700 text-white font-extrabold">🔗 Formani ochish</button>
              ${defaultWinner ? `
                <button type="button" onclick="sendStudentToGoogleForm(${defaultWinner.id})" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow">
                  📤 Namuna (${escapeHtml(defaultWinner.fullName)}) ni Formaga yuborish
                </button>
              ` : ''}
            </div>
          </div>

          <div class="bg-amber-50/70 rounded-2xl p-4 border border-amber-200 space-y-3 text-xs">
            <div class="font-black text-amber-950">📥 Google Sheets / Google Form javoblarini havola yoki CSV orqali bazaga import qilish</div>
            <p class="text-[11px] text-amber-900">Google Sheets jadvalining CSV/export havolasini kiritsangiz tizim javoblarni o‘zi yuklab olib bazaga tushiradi, yoki <b>.csv</b> faylni tanlang.</p>
            <div class="flex flex-wrap gap-2">
              <input id="gf-sheets-csv-url" value="${escapeHtml(cfg.csvUrl || '')}" placeholder="https://docs.google.com/spreadsheets/d/.../export?format=csv" class="flex-1 min-w-[240px] px-3.5 py-2 rounded-xl border border-amber-300 bg-white font-mono" />
              <button type="button" onclick="syncGoogleFormFromUrl('school')" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow">⚡ Havoladan avtomat yuklash</button>
              <label class="inline-flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow">
                <span>📂 CSV fayl</span>
                <input type="file" accept=".csv,text/csv" onchange="importGoogleFormCsv(event)" class="hidden" />
              </label>
            </div>
          </div>

          <!-- TAYYOR ISHLAYDIGAN FORMA (BAZAGA AVTOMAT TUSHIRADI) -->
          <div class="bg-gradient-to-br from-emerald-50 via-white to-indigo-50 rounded-2xl p-5 border-2 border-emerald-300 space-y-3.5 text-xs shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div class="text-sm font-black text-slate-900">🚀 Tayyor Ro‘yxatdan O‘tish va Natija Formasi</div>
                <div class="text-[11px] text-slate-600">Shu formani to‘ldirib yuborsangiz ma’lumot darhol <b>O‘quvchilar Bazasi</b>ga tushadi (sozlangan bo‘lsa Google Formaga ham yuboriladi).</div>
              </div>
              <span class="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 font-black text-[11px]">⚡ Avto-Baza</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              <div class="lg:col-span-2">
                <label class="text-[11px] font-bold text-slate-600">O‘quvchi F.I.Sh. *</label>
                <input id="live-form-name" placeholder="Masalan: Karimova Madina" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold" />
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-600">Sinf *</label>
                <input id="live-form-class" list="live-form-classes-list" value="5-B" placeholder="5-B" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold uppercase" />
                <datalist id="live-form-classes-list">
                  ${(state.classes || []).map(c => `<option value="${escapeHtml(c.name)}"></option>`).join('')}
                </datalist>
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-600">Telefon</label>
                <input id="live-form-phone" placeholder="+998 90 123-45-67" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-semibold" />
              </div>
              <div>
                <label class="text-[11px] font-bold text-slate-600">Ball (ixtiyoriy)</label>
                <input type="number" id="live-form-score" step="0.1" placeholder="Avto" class="w-full mt-1 px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold" />
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span class="text-[11px] text-slate-500">Agar ball bo‘sh qoldirilsa, standart 1-fan (25) va 2-fan (25) bo‘yicha avtomatik hisoblanadi.</span>
              <button type="button" onclick="submitBuiltInFormToDatabase()" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black shadow">
                ✅ Formani yuborish (Bazaga tushirish)
              </button>
            </div>
          </div>
        </div>
      `;
    }

    function submitBuiltInFormToDatabase() {
      const fullName = (document.getElementById('live-form-name')?.value || '').trim();
      const className = (document.getElementById('live-form-class')?.value || '5-B').trim().toUpperCase();
      const phone = (document.getElementById('live-form-phone')?.value || '').trim();
      const rawScore = document.getElementById('live-form-score')?.value;

      if (!fullName) {
        showToast('Iltimos, o‘quvchi F.I.Sh. ni kiriting!', '⚠️');
        return;
      }

      const q1 = 25;
      const q2 = 25;
      const score = rawScore !== '' && rawScore !== undefined && !isNaN(Number(rawScore))
        ? Number(rawScore)
        : calcScore(q1, q2, state.schoolRules);

      const nextId = crmNextId();
      state.students.push({
        id: nextId,
        fullName,
        className,
        phone,
        q1,
        q2,
        score,
        callStatus: phone ? 'Yangi' : 'Raqamsiz',
        note: 'Ichki forma orqali qo‘shildi'
      });

      ensureAllStudentClassesExist();
      saveState();

      const cfg = state.gformsConfig || {};
      const endpoint = (cfg.submitUrl || (cfg.viewUrl ? cfg.viewUrl.replace('/viewform', '/formResponse') : '')).trim();
      if (endpoint && (cfg.entryName || cfg.entryClass || cfg.entryPhone || cfg.entryScore)) {
        const params = new URLSearchParams();
        if (cfg.entryName) params.append(cfg.entryName, fullName);
        if (cfg.entryClass) params.append(cfg.entryClass, className);
        if (cfg.entryPhone) params.append(cfg.entryPhone, phone);
        if (cfg.entryScore) params.append(cfg.entryScore, String(score));
        fetch(endpoint, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: params.toString()
        }).catch(() => {});
      }

      document.getElementById('live-form-name').value = '';
      document.getElementById('live-form-phone').value = '';
      document.getElementById('live-form-score').value = '';
      renderGformsTab();
      showToast(`${fullName} (${className}) formadan bazaga avtomatik tushdi!`, '🚀');
    }

    function autoConnectGoogleFormUrl(rawUrl, scope = 'school') {
      const url = String(rawUrl || '').trim();
      if (!url || !/^https?:\/\//i.test(url)) return;

      const isMock = scope === 'mock';
      const submitEl = document.getElementById(isMock ? 'km-gf-submit-url' : 'gf-submit-url');
      const csvEl = document.getElementById(isMock ? 'km-gf-csv-url' : 'gf-sheets-csv-url');

      let normalizedView = url;
      let normalizedSubmit = '';
      let normalizedCsv = '';

      if (url.includes('/formResponse')) {
        normalizedSubmit = url;
        normalizedView = url.replace('/formResponse', '/viewform');
      } else if (url.includes('/viewform')) {
        normalizedView = url;
        normalizedSubmit = url.replace('/viewform', '/formResponse');
      } else if (url.includes('docs.google.com/spreadsheets/d/')) {
        const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
          normalizedCsv = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
        }
      } else if (url.includes('output=csv') || url.includes('format=csv') || url.endsWith('.csv')) {
        normalizedCsv = url;
      }

      if (submitEl && normalizedSubmit) submitEl.value = normalizedSubmit;
      if (csvEl && normalizedCsv) csvEl.value = normalizedCsv;

      const prevCfg = isMock ? (state.kidsMockFormConfig || {}) : (state.gformsConfig || {});
      const updatedCfg = {
        ...prevCfg,
        viewUrl: normalizedView,
        submitUrl: normalizedSubmit || (submitEl ? submitEl.value.trim() : prevCfg.submitUrl || ''),
        csvUrl: normalizedCsv || (csvEl ? csvEl.value.trim() : prevCfg.csvUrl || ''),
        lastSyncedAt: new Date().toLocaleString('uz-RU')
      };

      if (isMock) {
        state.kidsMockFormConfig = updatedCfg;
      } else {
        state.gformsConfig = updatedCfg;
      }
      saveState();

      clearTimeout(window._autoFormSyncTimer);
      window._autoFormSyncTimer = setTimeout(() => {
        if (normalizedCsv) {
          syncGoogleFormFromUrl(scope, true);
        } else {
          showToast('Google Form havolasi avtomatik sozlandi!', '⚡');
        }
      }, 350);
    }

    function parseCsvTextIntoDatabase(text, scope = 'school', silent = false) {
      const lines = String(text || '').split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) {
        if (!silent) showToast('CSV ma’lumot bo‘sh yoki noto‘g‘ri!', '⚠️');
        return 0;
      }
      const sep = lines[0].includes(';') ? ';' : ',';
      let added = 0;

      if (scope === 'mock') {
        let nextId = crmNextId();
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(sep).map(c => c.replace(/^"|"$/g, '').trim());
          const fullName = cols.find(c => /[A-Za-zА-Яа-яЎўҚқҒғҲҳ']{2,}/.test(c) && !/xona/i.test(c) && isNaN(Number(c)));
          if (!fullName) continue;
          const room = cols.find(c => /xona/i.test(c)) || '1-xona';
          const nums = cols.map(c => Number(c)).filter(n => !isNaN(n) && n > 0 && n <= 200);
          const score = nums.length ? nums[nums.length - 1] : 0;
          state.mockStudents.push({
            id: nextId++,
            fullName,
            room,
            session: mockExamSession,
            q1: nums[0] || 0,
            q2: nums[1] || 0,
            score
          });
          added++;
        }
      } else {
        let nextId = crmNextId();
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(sep).map(c => c.replace(/^"|"$/g, '').trim());
          const fullName = cols.find(c => /[A-Za-zА-Яа-яЎўҚқҒғҲҳ']{2,}/.test(c) && !c.includes('+998') && isNaN(Number(c)));
          if (!fullName) continue;
          const className = (cols.find(c => /^\d{1,2}\s*[-–]?\s*[A-Za-zА-Яа-яЎўҚқҒғҲҳ]+$/i.test(c)) || '5-B').toUpperCase();
          const phone = cols.find(c => c.includes('+998') || /\d{2}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}/.test(c)) || '';
          const nums = cols.map(c => Number(c)).filter(n => !isNaN(n) && n > 0 && n <= 200);
          const score = nums.length ? nums[nums.length - 1] : 0;
          state.students.push({
            id: nextId++,
            fullName,
            className,
            phone,
            q1: nums[0] || 0,
            q2: nums[1] || 0,
            score,
            callStatus: phone ? 'Yangi' : 'Raqamsiz',
            note: 'Avto havola import'
          });
          added++;
        }
        ensureAllStudentClassesExist();
      }

      if (added > 0) {
        saveState();
        renderCurrentTab();
        showToast(`Havoladan ${added} nafar o‘quvchi bazaga avtomatik tushdi!`, '⚡');
      } else if (!silent) {
        showToast('Havoladagi jadvaldan yangi o‘quvchi topilmadi.', '⚠️');
      }
      return added;
    }

    function syncGoogleFormFromUrl(scope = 'school', silent = false) {
      const isMock = scope === 'mock';
      const cfg = isMock ? (state.kidsMockFormConfig || {}) : (state.gformsConfig || {});
      const csvUrl = (
        document.getElementById(isMock ? 'km-gf-csv-url' : 'gf-sheets-csv-url')?.value ||
        cfg.csvUrl ||
        ''
      ).trim();

      if (!csvUrl) {
        if (!silent) showToast('Avtomatik yuklash uchun Google Sheets CSV/export havolasini kiriting!', '⚠️');
        return;
      }

      fetch(csvUrl)
        .then(res => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(text => {
          parseCsvTextIntoDatabase(text, scope, silent);
        })
        .catch(err => {
          if (!silent) {
            showToast('Havoladan o‘qishda xato (jadval ochiq/published ekanligini tekshiring): ' + err.message, '⚠️');
          }
        });
    }

    function saveGoogleFormsConfig() {
      const viewUrl = document.getElementById('gf-view-url').value.trim();
      let submitUrl = document.getElementById('gf-submit-url').value.trim();
      if (!submitUrl && viewUrl.includes('/viewform')) {
        submitUrl = viewUrl.replace('/viewform', '/formResponse');
      }
      state.gformsConfig = {
        viewUrl,
        submitUrl,
        entryName: document.getElementById('gf-entry-name').value.trim(),
        entryClass: document.getElementById('gf-entry-class').value.trim(),
        entryPhone: document.getElementById('gf-entry-phone').value.trim(),
        entryScore: document.getElementById('gf-entry-score').value.trim(),
        lastSyncedAt: new Date().toLocaleString('uz-RU')
      };
      saveState();
      renderGformsTab();
      showToast('Google Form sozlamalari saqlandi!');
    }

    function openConfiguredGoogleForm() {
      const url = (document.getElementById('gf-view-url')?.value || state.gformsConfig?.viewUrl || '').trim();
      if (!url) {
        showToast('Avval Google Form ochiq havolasini (viewform URL) kiriting!', '⚠️');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    }

    function sendStudentToGoogleForm(studentId) {
      const cfg = state.gformsConfig || {};
      const st = state.students.find(s => s.id === studentId);
      if (!st) return;
      const endpoint = (cfg.submitUrl || (cfg.viewUrl ? cfg.viewUrl.replace('/viewform', '/formResponse') : '')).trim();
      if (!endpoint) {
        showToast('Avval Google Form formResponse URL manzilini kiriting va saqlang!', '⚠️');
        return;
      }

      const params = new URLSearchParams();
      if (cfg.entryName) params.append(cfg.entryName, st.fullName);
      if (cfg.entryClass) params.append(cfg.entryClass, st.className);
      if (cfg.entryPhone) params.append(cfg.entryPhone, st.phone || '');
      if (cfg.entryScore) params.append(cfg.entryScore, String(st.score));

      if (![...params.keys()].length) {
        showToast('Kamida bitta entry.XXXXX maydonini kiriting!', '⚠️');
        return;
      }

      fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: params.toString()
      }).then(() => {
        state.gformsConfig.lastSyncedAt = new Date().toLocaleString('uz-RU');
        saveState();
        renderGformsTab();
        showToast(`${st.fullName} ma’lumoti Google Formaga yuborildi!`, '📝');
      }).catch(err => {
        showToast('Google Formaga yuborishda xato: ' + (err?.message || 'tarmoq xatosi'), '⚠️');
      });
    }

    function importGoogleFormCsv(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        parseCsvTextIntoDatabase(e.target.result, 'school', false);
      };
      reader.readAsText(file);
    }

    function renderSupabaseTab() {
      const container = document.getElementById('tab-supabase');
      container.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <h2 class="text-xl font-black text-slate-900">🗄️ Supabase Bulutli Baza (Cloud Sync)</h2>
          <p class="text-xs text-slate-500">Bir nechta kompyuter va operatorlar bitta jonli bazada ishlashi uchun Supabase URL va anon key kiriting.</p>
          <input id="sb-url-inp" value="${escapeHtml(state.sbConfig.url || '')}" placeholder="https://xxxx.supabase.co" class="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-mono" />
          <input id="sb-key-inp" value="${escapeHtml(state.sbConfig.key || '')}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..." class="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-mono" />
          <button onclick="state.sbConfig.url=document.getElementById('sb-url-inp').value.trim(); state.sbConfig.key=document.getElementById('sb-key-inp').value.trim(); saveState(); document.getElementById('cloud-status-badge').textContent='☁️ Supabase ulandi'; showToast('Supabase sozlamalari saqlandi!')" class="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black">⚡ Ulanish va Saqlash</button>
        </div>
      `;
    }

    // =========================================================
    // 12. MODALLAR VA EXCEL / HTML EXPORT & IMPORT
    // =========================================================
    function openSchoolRulesModal() {
      document.getElementById('rules-target').value = 'school';
      document.getElementById('rules-modal-title').textContent = '⚖️ 12-Maktab Ball Tizimi Sozlamalari';
      document.getElementById('rule-q1').value = state.schoolRules.q1;
      document.getElementById('rule-w1').value = state.schoolRules.w1;
      document.getElementById('rule-q2').value = state.schoolRules.q2;
      document.getElementById('rule-w2').value = state.schoolRules.w2;
      document.getElementById('rules-modal').classList.remove('hidden');
      document.getElementById('rules-modal').classList.add('flex');
    }

    function openMockRulesModal() {
      document.getElementById('rules-target').value = 'mock';
      document.getElementById('rules-modal-title').textContent = '⚖️ Kids Mock Ball Tizimi Sozlamalari';
      document.getElementById('rule-q1').value = state.mockRules.q1;
      document.getElementById('rule-w1').value = state.mockRules.w1;
      document.getElementById('rule-q2').value = state.mockRules.q2;
      document.getElementById('rule-w2').value = state.mockRules.w2;
      document.getElementById('rules-modal').classList.remove('hidden');
      document.getElementById('rules-modal').classList.add('flex');
    }

    function closeRulesModal() {
      document.getElementById('rules-modal').classList.add('hidden');
      document.getElementById('rules-modal').classList.remove('flex');
    }

    function applyRulePreset(q1, w1, q2, w2) {
      document.getElementById('rule-q1').value = q1;
      document.getElementById('rule-w1').value = w1;
      document.getElementById('rule-q2').value = q2;
      document.getElementById('rule-w2').value = w2;
    }

    function saveRulesModal() {
      const target = document.getElementById('rules-target').value;
      const rules = {
        q1: Number(document.getElementById('rule-q1').value || 40),
        w1: Number(document.getElementById('rule-w1').value || 1.5),
        q2: Number(document.getElementById('rule-q2').value || 40),
        w2: Number(document.getElementById('rule-w2').value || 1)
      };
      if (target === 'mock') {
        state.mockRules = rules;
        state.mockStudents.forEach(m => m.score = calcScore(m.q1, m.q2, rules));
      } else {
        state.schoolRules = rules;
        state.students.forEach(s => s.score = calcScore(s.q1, s.q2, rules));
      }
      saveState();
      closeRulesModal();
      renderCurrentTab();
      showToast('Ball mezoni saqlandi va barcha ballar qayta hisoblandi!');
    }

    function openAddClassModal() {
      document.getElementById('add-class-modal').classList.remove('hidden');
      document.getElementById('add-class-modal').classList.add('flex');
    }

    function closeAddClassModal() {
      document.getElementById('add-class-modal').classList.add('hidden');
      document.getElementById('add-class-modal').classList.remove('flex');
    }

    function saveNewClass() {
      const name = document.getElementById('new-class-name').value.trim().toUpperCase();
      const teacher = document.getElementById('new-class-teacher').value.trim();
      const phone = document.getElementById('new-class-phone').value.trim();
      if (!name) return;
      if (!state.classes.some(c => c.name === name)) {
        state.classes.push({ name, teacher: teacher || `${name} Sinf Rahbari`, phone, expected: 30 });
        saveState();
        renderCurrentTab();
        showToast(`${name} sinfi qo‘shildi!`);
      }
      closeAddClassModal();
    }

    function openClearBaseModal() {
      document.getElementById('clear-base-modal').classList.remove('hidden');
      document.getElementById('clear-base-modal').classList.add('flex');
    }

    function closeClearBaseModal() {
      document.getElementById('clear-base-modal').classList.add('hidden');
      document.getElementById('clear-base-modal').classList.remove('flex');
    }

    function clearDatabaseAction(mode) {
      if (mode === 'students_only') {
        state.students = [];
      } else {
        state.students = [];
        state.mockStudents = [];
        state.payments = [];
        state.usedCards = {};
      }
      saveState();
      closeClearBaseModal();
      renderCurrentTab();
      showToast('Baza muvaffaqiyatli tozalandi!', '🧹');
    }

    function resetToDefault711() {
      const def = generateDefault711Data();
      state.classes = def.classes;
      state.students = def.students;
      openedClassName = null;
      saveState();
      renderCurrentTab();
      showToast('711 nafar o‘quvchi va 25 ta sinf bazasi tiklandi!', '🔄');
    }

    function exportFullExcel() {
      try {
        const rankMap = getParallelRankMap();
        const rows = state.students.map(st => {
          const prize = getStudentPrizeInfo(st, rankMap);
          return {
            'ID': st.id,
            'F.I.Sh.': st.fullName,
            'Sinf': st.className,
            'Parallel': prize.gradeKey,
            'Paralleldagi o‘rni': prize.rank,
            'Telefon': st.phone || '',
            '1-fan': st.q1,
            '2-fan': st.q2,
            'Jami Ball': st.score,
            'Parallel TOP-3 Yutuq': prize.tier,
            'Karta summasi': prize.amount,
            'Promo-kod': getPromoCode(st.id),
            'Call Holati': st.callStatus || ''
          };
        });
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '12-Maktab_Parallel_TOP3');
        XLSX.writeFile(wb, `Registon_12Maktab_ParallelTOP3_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('Excel fayl muvaffaqiyatli yuklandi!');
      } catch (e) {
        showToast('Excel yuklashda xatolik: ' + e.message, '⚠️');
      }
    }

    function downloadStandaloneHtml() {
      const payload = JSON.stringify(state);
      const htmlContent = `<!DOCTYPE html><html lang="uz"><head><meta charset="UTF-8"><title>Registon CRM Baza</title></head><body><script id="registon-embedded-state" type="application/json">${payload}<\/script><p>Registon LC Baza fayli (${state.students.length} o‘quvchi). Ushbu faylni CRM tizimining "HTML o‘qish / Import" tugmasi orqali qayta yuklashingiz mumkin.</p></body></html>`;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Registon_CRM_Baza_${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      showToast('HTML baza fayli yuklab olindi!');
    }

    function openHtmlPasteModal() {
      document.getElementById('html-paste-modal').classList.remove('hidden');
      document.getElementById('html-paste-modal').classList.add('flex');
    }

    function closeHtmlPasteModal() {
      document.getElementById('html-paste-modal').classList.add('hidden');
      document.getElementById('html-paste-modal').classList.remove('flex');
    }

    function importStandaloneHtml(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        processRawHtmlForImport(e.target.result);
      };
      reader.readAsText(file);
    }

    function parsePastedHtmlText() {
      const raw = document.getElementById('html-raw-paste-input').value.trim();
      if (!raw) {
        showToast('Avval HTML matnini joylashtiring!', '⚠️');
        return;
      }
      processRawHtmlForImport(raw);
    }

    function processRawHtmlForImport(htmlStr) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlStr, 'text/html');
        let importedStudents = [];
        let importedClasses = [];

        const embedded = doc.getElementById('registon-embedded-state');
        if (embedded) {
          const parsed = JSON.parse(embedded.textContent);
          importedStudents = parsed.students || [];
          importedClasses = parsed.classes || [];
        } else {
          const rows = Array.from(doc.querySelectorAll('table tr'));
          let idCounter = 1;
          rows.forEach((tr, rIdx) => {
            if (rIdx === 0) return;
            const cells = Array.from(tr.querySelectorAll('td, th')).map(td => td.textContent.trim());
            if (cells.length >= 3) {
              const fullName = cells[1] || cells[0];
              const className = (cells[2] || '5-A').toUpperCase();
              const phone = cells.find(c => c.includes('+998') || /\d{2}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}/.test(c)) || '';
              const nums = cells.map(c => Number(c)).filter(n => !isNaN(n) && n > 0 && n <= 150);
              const score = nums.length ? nums[nums.length - 1] : 0;
              if (fullName && fullName.length > 2) {
                importedStudents.push({
                  id: idCounter++,
                  fullName,
                  className,
                  phone,
                  q1: nums[0] || 0,
                  q2: nums[1] || 0,
                  score,
                  callStatus: phone ? 'Yangi' : 'Raqamsiz',
                  note: ''
                });
              }
            }
          });
        }

        if (!importedStudents.length) {
          showToast('HTML fayl ichidan o‘quvchilar ro‘yxati topilmadi!', '⚠️');
          return;
        }

        pendingHtmlImportPayload = { students: importedStudents, classes: importedClasses };
        pendingHtmlSelectedClasses = {};
        const byCls = {};
        importedStudents.forEach(s => {
          const c = s.className || 'Boshqa';
          byCls[c] = (byCls[c] || 0) + 1;
          pendingHtmlSelectedClasses[c] = true;
        });

        closeHtmlPasteModal();
        renderHtmlImportConfirmModal(byCls, importedStudents.length);
      } catch (err) {
        showToast('HTML faylni o‘qishda xatolik: ' + err.message, '⚠️');
      }
    }

    function renderHtmlImportConfirmModal(byCls, totalCount) {
      const modal = document.getElementById('html-import-confirm-modal');
      document.getElementById('html-import-subtitle').textContent = `Jami ${Object.keys(byCls).length} ta sinf va ${totalCount} nafar o‘quvchi aniqlandi.`;
      document.getElementById('html-import-ai-summary').innerHTML = `
        <div class="text-xs font-black uppercase text-amber-300">📊 Har bir parallelga TOP-3 karta qoidasi tayyor</div>
        <div class="text-xs text-slate-200">Tasdiqlashingiz bilan barcha tanlangan sinflar yuklanadi va <b>har bir parallel sinflar birlashtirilib (2-sinflar, 3-sinflar, 4-sinflar...) eng yuqori ball olgan 3 nafar o‘quvchiga</b> kartalar avtomatik ajratiladi.</div>
      `;

      const listEl = document.getElementById('html-import-classes-list');
      listEl.innerHTML = Object.keys(byCls).sort().map(cls => `
        <label class="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-slate-50 cursor-pointer">
          <div class="flex items-center gap-2">
            <input type="checkbox" ${pendingHtmlSelectedClasses[cls] ? 'checked' : ''} onchange="pendingHtmlSelectedClasses['${escapeHtml(cls)}']=this.checked; updateImportSelectedSummary()" class="w-4 h-4 accent-indigo-600" />
            <span class="font-black text-xs text-slate-900">${escapeHtml(cls)} sinfi</span>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-black">${byCls[cls]} o‘quvchi</span>
        </label>
      `).join('');

      updateImportSelectedSummary();
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function toggleAllImportClasses(flag) {
      Object.keys(pendingHtmlSelectedClasses).forEach(k => pendingHtmlSelectedClasses[k] = flag);
      document.querySelectorAll('#html-import-classes-list input[type="checkbox"]').forEach(cb => cb.checked = flag);
      updateImportSelectedSummary();
    }

    function updateImportSelectedSummary() {
      if (!pendingHtmlImportPayload) return;
      const selectedCount = pendingHtmlImportPayload.students.filter(s => pendingHtmlSelectedClasses[s.className || 'Boshqa']).length;
      document.getElementById('html-import-selected-summary').textContent = `Tanlangan: ${selectedCount} nafar o‘quvchi`;
    }

    function closeHtmlImportConfirmModal() {
      document.getElementById('html-import-confirm-modal').classList.add('hidden');
      document.getElementById('html-import-confirm-modal').classList.remove('flex');
    }

    function confirmHtmlImportByClasses() {
      if (!pendingHtmlImportPayload) return;
      const mode = document.getElementById('html-import-merge-mode').value;
      const chosen = pendingHtmlImportPayload.students.filter(s => pendingHtmlSelectedClasses[s.className || 'Boshqa']);
      if (!chosen.length) {
        showToast('Kamida bitta sinfni belgilang!', '⚠️');
        return;
      }
      if (mode === 'replace') {
        const chosenSet = new Set(chosen.map(s => s.className));
        state.students = state.students.filter(s => !chosenSet.has(s.className));
      }
      let nextId = crmNextId();
      chosen.forEach(s => {
        state.students.push({ ...s, id: nextId++ });
      });
      ensureAllStudentClassesExist();
      saveState();
      closeHtmlImportConfirmModal();
      renderCurrentTab();
      showToast(`${chosen.length} nafar o‘quvchi muvaffaqiyatli yuklandi!`);
    }

    // =========================================================
    // 13. NAVIGATSIYA VA ILOVANI ISHGA TUSHIRISH
    // =========================================================
    function renderCurrentTab() {
      if (currentTab === 'dashboard') renderDashboardTab();
      else if (currentTab === 'classes') renderClassesTab();
      else if (currentTab === 'students') renderStudentsTab();
      else if (currentTab === 'kidsmock') renderKidsMockTab();
      else if (currentTab === 'winners') renderWinnersTab();
      else if (currentTab === 'calls') renderCallsTab();
      else if (currentTab === 'cards') renderCardsTab();
      else if (currentTab === 'kassa') renderKassaTab();
      else if (currentTab === 'groups') renderGroupsTab();
      else if (currentTab === 'parent') renderParentTab();
      else if (currentTab === 'telegram') renderTelegramTab();
      else if (currentTab === 'gdrive') renderGdriveTab();
      else if (currentTab === 'gforms') renderGformsTab();
      else if (currentTab === 'supabase') renderSupabaseTab();
      updateHeaderStats();
    }

    function switchTab(tabName) {
      currentTab = tabName;
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.add('hidden');
      });
      const activePanel = document.getElementById('tab-' + tabName);
      if (activePanel) {
        activePanel.classList.remove('hidden');
      }
      document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-[#F2642A]', 'shadow');
        btn.classList.add('bg-white/15');
      });
      const activeBtn = document.getElementById('nav-' + tabName);
      if (activeBtn) {
        activeBtn.classList.remove('bg-white/15');
        activeBtn.classList.add('bg-[#F2642A]', 'shadow');
      }
      renderCurrentTab();
    }

    // Ishga tushirish db.js (login + bulutli baza yuklangandan keyin) orqali bo'ladi
