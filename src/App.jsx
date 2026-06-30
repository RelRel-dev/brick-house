import { useState, useEffect, useCallback, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "brickhouse_v1";
const FREQ_OPTIONS = [
  { label: "Once",       value: 1 },
  { label: "Twice",      value: 2 },
  { label: "3× a week",  value: 3 },
  { label: "Weekdays",   value: 5 },
  { label: "Every day",  value: 7 },
];
const FREQ_LABELS = { 1:"Once", 2:"Twice", 3:"3× a week", 5:"Weekdays", 7:"Every day" };

// ─── Date helpers ─────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekKey(date = new Date()) {
  const d   = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().slice(0, 10);
}
function weekRange(k) {
  const mon = new Date(k);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(mon)} – ${fmt(sun)}`;
}
function curWeek() { return weekKey(new Date()); }

// ─── Persistence helpers ──────────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { habits: [], logs: {}, history: [], streak: 0 };
}
function saveState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
}

// ─── Computed helpers (pure) ──────────────────────────────────────────────────
function totalBricks(habits) { return habits.reduce((a, h) => a + h.freq, 0); }
function habitLogs(state, id) { return ((state.logs[curWeek()] || {})[id]) || []; }
function earnedThisWeek(state) {
  const wk = curWeek();
  return state.habits.reduce((sum, h) => {
    return sum + Math.min(((state.logs[wk] || {})[h.id] || []).length, h.freq);
  }, 0);
}

// ─── House SVG ───────────────────────────────────────────────────────────────
function HouseSVG({ pct }) {
  const W = 340, hW = 200, hH = 120, hx = (W - hW) / 2, hy = 120;
  const px = W / 2, py = 30;
  const fill = Math.min(pct / 0.85, 1);

  const bH = 14, bW = 38, gap = 2;
  const rows       = Math.floor(hH / (bH + gap));
  const filledRows = Math.floor(fill * rows);

  const brickRows = [];
  for (let r = 0; r < rows; r++) {
    const ry  = hy + hH - (r + 1) * (bH + gap);
    const off = r % 2 === 0 ? 0 : bW / 2;
    const show = r < filledRows;
    let bx = hx - off;
    while (bx < hx + hW) {
      const x  = Math.max(bx, hx);
      const x2 = Math.min(bx + bW, hx + hW);
      if (x2 - x > 4) {
        brickRows.push(
          <g key={`${r}-${bx}`}>
            {show && <rect x={x} y={ry} width={x2-x-gap} height={3} rx={2} fill="#A85050" />}
            <rect x={x} y={ry} width={x2-x-gap} height={bH} rx={2}
              fill={show ? "#8B3A3A" : "rgba(139,58,58,0.08)"} />
          </g>
        );
      }
      bx += bW + gap;
    }
  }

  return (
    <svg viewBox="0 0 340 260" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%" }}>
      {/* Ground */}
      <rect x={0} y={hy+hH} width={W} height={50} fill="#6B9E7833" />
      {/* Ghost silhouette */}
      <polygon points={`${px},${py} ${hx},${hy} ${hx+hW},${hy}`} fill="rgba(139,58,58,0.06)" />
      <rect x={hx} y={hy} width={hW} height={hH} fill="rgba(139,58,58,0.06)" />
      {/* Bricks */}
      {brickRows}
      {/* Roof */}
      <polygon
        points={`${px},${py} ${hx-10},${hy} ${hx+hW+10},${hy}`}
        fill={fill >= 1 ? "#8B3A3A" : "rgba(139,58,58,0.1)"}
        stroke="#6B2828" strokeWidth={1.5}
      />
      {/* Windows (40%) */}
      {fill >= 0.4 && [[hx+20, hy+25], [hx+hW-52, hy+25]].map(([wx, wy], i) => (
        <g key={i}>
          <rect x={wx} y={wy} width={32} height={28} rx={2} fill="#C8E6F5" stroke="#6B2828" strokeWidth={1} />
          <line x1={wx+16} y1={wy} x2={wx+16} y2={wy+28} stroke="#6B2828" strokeWidth={1} />
          <line x1={wx} y1={wy+14} x2={wx+32} y2={wy+14} stroke="#6B2828" strokeWidth={1} />
        </g>
      ))}
      {/* Door (50%) */}
      {fill >= 0.5 && (() => {
        const dw = 28, dh = 38, dx = W/2 - 14, dy = hy + hH - dh;
        return <rect x={dx} y={dy} width={dw} height={dh} rx={3} fill="#4A7C59" />;
      })()}
      {/* Chimney (100%) */}
      {fill >= 1 && <rect x={W/2+40} y={18} width={18} height={hy-10} fill="#6B2828" />}
      {/* % label */}
      <text x={W-10} y={hy+hH-6} textAnchor="end" fontSize={12} fill="#7A6E5E">
        {Math.round(fill * 100)}% complete
      </text>
    </svg>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%",
      transform: `translateX(-50%) translateY(${msg ? "0" : "80px"})`,
      background: "#8B3A3A", color: "white",
      padding: "10px 22px", borderRadius: 24, fontSize: 14,
      transition: "transform 0.35s cubic-bezier(0.34,1.56,0.64,1)",
      whiteSpace: "nowrap", zIndex: 999, pointerEvents: "none",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
    }}>
      {msg}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function BrickHouse() {
  const [state,       setState]       = useState(loadState);
  const [view,        setView]        = useState("today");
  const [formOpen,    setFormOpen]    = useState(false);
  const [habitName,   setHabitName]   = useState("");
  const [selectedFreq, setSelectedFreq] = useState(null);
  const [toastMsg,    setToastMsg]    = useState("");
  const toastTimer = useRef(null);
  const nameInputRef = useRef(null);

  // Persist on every state change
  useEffect(() => { saveState(state); }, [state]);

  // Auto-close week when the week turns
  useEffect(() => {
    const wk = curWeek();
    if (state.history.find(w => w.wk === wk)) return;
    // Only close the *previous* week if we have logs for it
    const prevWeeks = Object.keys(state.logs).filter(k => k < wk);
    if (prevWeeks.length === 0) return;
    prevWeeks.forEach(pw => {
      if (state.history.find(w => w.wk === pw)) return;
      const e = state.habits.reduce((sum, h) => {
        return sum + Math.min(((state.logs[pw] || {})[h.id] || []).length, h.freq);
      }, 0);
      const t   = totalBricks(state.habits);
      const pct = t > 0 ? e / t : 0;
      setState(prev => {
        const alreadyLogged = prev.history.find(w => w.wk === pw);
        if (alreadyLogged) return prev;
        return {
          ...prev,
          history: [...prev.history, { wk: pw, e, t, pct }],
          streak: pct >= 0.85 ? (prev.streak || 0) + 1 : 0,
        };
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2800);
  }, []);

  // ── Computed ──────────────────────────────────────────────────────────────
  const earned = earnedThisWeek(state);
  const total  = totalBricks(state.habits);
  const pct    = total > 0 ? earned / total : 0;
  const need   = total > 0 ? Math.ceil(total * 0.85) : 0;

  // ── Actions ───────────────────────────────────────────────────────────────
  function addHabit() {
    if (!habitName.trim()) { showToast("Give your habit a name ✏️"); return; }
    if (!selectedFreq)     { showToast("Pick a frequency 📅"); return; }
    setState(prev => ({
      ...prev,
      habits: [...prev.habits, { id: "h" + Date.now(), name: habitName.trim(), freq: selectedFreq }],
    }));
    setHabitName(""); setSelectedFreq(null); setFormOpen(false);
    showToast("Habit added! Start earning bricks 🧱");
  }

  function deleteHabit(id) {
    setState(prev => ({ ...prev, habits: prev.habits.filter(h => h.id !== id) }));
  }

  /**
   * Multi-log logic:
   *  - A habit with freq N can be logged up to N times total per week.
   *  - Each day it can be logged at most once.
   *  - Tapping the check-dot when already logged today removes today's entry.
   *  - When freq > 1, the check-dot shows a count badge instead of a binary checkmark.
   */
  function logHabit(id) {
    const wk    = curWeek();
    const today = todayStr();
    const habit = state.habits.find(h => h.id === id);
    if (!habit) return;

    setState(prev => {
      const wkLogs  = prev.logs[wk] || {};
      const logs    = wkLogs[id]    || [];
      let   newLogs;

      if (logs.includes(today)) {
        // Toggle off today's entry
        newLogs = logs.filter(d => d !== today);
      } else if (logs.length >= habit.freq) {
        // Already maxed out — show toast but don't mutate
        showToast(`All ${habit.freq} bricks earned for this habit! 🎉`);
        return prev;
      } else {
        newLogs = [...logs, today];
      }

      const next = {
        ...prev,
        logs: { ...prev.logs, [wk]: { ...wkLogs, [id]: newLogs } },
      };

      // Toast based on overall progress
      const e2 = earnedThisWeek(next), t2 = totalBricks(next.habits);
      const p2 = t2 > 0 ? e2 / t2 : 0;
      if (newLogs.length > logs.length) {
        if (p2 >= 0.85)      showToast("85% hit — house can be built! 🏠");
        else if (e2 === 1)   showToast("First brick! Keep going 🧱");
        else showToast(
          p2 < 0.25 ? "Every brick counts 💪" :
          p2 < 0.50 ? "Walls rising! 🏗️"      :
          p2 < 0.75 ? "Past halfway 🧱"        :
                      "Almost there! 🏠"
        );
      }
      return next;
    });
  }

  // ── Render sub-views ───────────────────────────────────────────────────────
  function renderTodayView() {
    const today  = todayStr();
    const quotaPill = () => {
      if (total === 0) return <span style={styles.quotaPill}>Add habits</span>;
      if (pct >= 0.85) return <span style={{...styles.quotaPill, ...styles.quotaSuccess}}>🏠 House built!</span>;
      const rem = need - earned;
      return (
        <span style={{...styles.quotaPill, ...(pct >= 0.5 ? styles.quotaWarning : {})}}>
          {rem} brick{rem !== 1 ? "s" : ""} to goal
        </span>
      );
    };

    return (
      <div style={styles.viewPad}>
        {/* Week header */}
        <div style={styles.weekHeader}>
          <div>
            <div style={styles.weekLabel}>{weekRange(curWeek())}</div>
            <div style={styles.weekProgressText}>
              <span>{earned}</span> of <span>{total}</span> bricks earned
            </div>
          </div>
          {quotaPill()}
        </div>

        {/* Brick visualiser */}
        <div style={styles.brickViz}>
          <div style={styles.vizLabel}>Your brick pile this week</div>
          <div style={styles.brickGrid}>
            {Array.from({ length: Math.max(total, 1) }).map((_, i) => (
              <div
                key={i}
                style={i < earned ? styles.brickEarned(i) : styles.brickGhost}
              />
            ))}
          </div>
          <div style={styles.progressBarWrap}>
            <div style={{ ...styles.progressBarFill, width: `${total > 0 ? Math.min(earned / total * 100, 100) : 0}%` }} />
          </div>
          <div style={styles.progressLabels}>
            <span>0</span>
            <span style={{ color: "#4A7C59" }}>▲ 85% goal</span>
            <span>{total} max</span>
          </div>
        </div>

        {/* Add form */}
        {formOpen && (
          <div style={styles.addForm}>
            <div style={styles.formTitle}>New habit</div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>What's the habit?</label>
              <input
                ref={nameInputRef}
                style={styles.formInput}
                placeholder="e.g. Morning walk, Read 20 pages…"
                value={habitName}
                onChange={e => setHabitName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addHabit()}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>How often this week?</label>
              <div style={styles.freqChips}>
                {FREQ_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    style={selectedFreq === o.value ? styles.freqChipSelected : styles.freqChip}
                    onClick={() => setSelectedFreq(o.value)}
                  >{o.label}</button>
                ))}
              </div>
            </div>
            <div style={styles.formActions}>
              <button style={styles.btnSave}   onClick={addHabit}>Add habit</button>
              <button style={styles.btnCancel} onClick={() => { setFormOpen(false); setHabitName(""); setSelectedFreq(null); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Habits list */}
        <div style={styles.sectionLabel}>Your habits</div>
        {state.habits.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIco}>🧱</div>
            <div style={styles.emptyTitle}>No habits yet</div>
            <div style={styles.emptySub}>Add your first habit to start earning bricks.</div>
          </div>
        ) : (
          state.habits.map(h => {
            const logs      = habitLogs(state, h.id);
            const weekEarned = Math.min(logs.length, h.freq);
            const checkedToday = logs.includes(today);
            const maxed     = logs.length >= h.freq;
            // For multi-brick habits, show count; for single-brick show checkmark
            const dotContent = h.freq === 1
              ? (checkedToday ? "✓" : "")
              : `${weekEarned}/${h.freq}`;

            return (
              <div key={h.id} style={styles.habitCard}>
                <button
                  onClick={() => logHabit(h.id)}
                  title={checkedToday ? "Remove today's log" : maxed ? "Max bricks earned" : "Log today"}
                  style={{
                    ...styles.checkDot,
                    ...(checkedToday ? styles.checkDotChecked : {}),
                    ...(maxed && !checkedToday ? styles.checkDotMaxed : {}),
                    fontSize: h.freq > 1 ? 10 : 14,
                  }}
                >
                  {dotContent}
                </button>
                <div style={styles.habitInfo}>
                  <div style={styles.habitName}>{h.name}</div>
                  <div style={styles.habitFreq}>
                    {FREQ_LABELS[h.freq] || `${h.freq}× a week`} · {weekEarned}/{h.freq} bricks
                  </div>
                </div>
                <div style={styles.miniBricks}>
                  {Array.from({ length: h.freq }).map((_, i) => (
                    <div key={i} style={i < weekEarned ? styles.miniBrickFilled : styles.miniBrick} />
                  ))}
                </div>
                <button style={styles.delBtn} onClick={() => deleteHabit(h.id)} aria-label="Remove habit">✕</button>
              </div>
            );
          })
        )}

        <button style={styles.addHabitBtn} onClick={() => { setFormOpen(true); setTimeout(() => nameInputRef.current?.focus(), 50); }}>
          + Add a habit
        </button>
      </div>
    );
  }

  function renderHouseView() {
    const need2 = total > 0 ? Math.ceil(total * 0.85) : 0;
    const built = pct >= 0.85;
    const rem   = need2 - earned;
    return (
      <div style={styles.viewPad}>
        {built && (
          <div style={styles.completeBanner}>
            <h3 style={{ fontSize: 17, fontWeight: 500, marginBottom: 4 }}>🏠 Your house stands!</h3>
            <p style={{ fontSize: 13, opacity: 0.85 }}>You hit {Math.round(pct * 100)}% of your brick quota this week.</p>
          </div>
        )}
        <div style={{ maxWidth: 340, margin: "0 auto 12px" }}>
          <HouseSVG pct={pct} />
        </div>
        <div style={styles.houseCaption}>
          {built
            ? "Full house achieved — you showed up."
            : rem > 0
              ? `${rem} more brick${rem !== 1 ? "s" : ""} to complete your house.`
              : "Add habits to start building."}
        </div>
        <div style={styles.twoCol}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Bricks earned</div>
            <div style={styles.statVal}>{earned}</div>
            <div style={styles.statSub}>this week</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Brick quota</div>
            <div style={styles.statVal}>{need2}</div>
            <div style={styles.statSub}>{built ? "goal met ✓" : "to build your house"}</div>
          </div>
        </div>
      </div>
    );
  }

  function renderStreaksView() {
    return (
      <div style={styles.viewPad}>
        <div style={styles.streakHero}>
          <div style={styles.streakNum}>{state.streak}</div>
          <div style={styles.streakSub}>consecutive weeks built</div>
          <div style={styles.streakIcons}>
            {Array.from({ length: Math.min(state.streak, 12) }).map((_, i) => (
              <div key={i} style={styles.streakIcon}>🏠</div>
            ))}
          </div>
        </div>
        {(!state.history || state.history.length === 0) ? (
          <div style={styles.empty}>
            <div style={styles.emptyIco}>📋</div>
            <div style={styles.emptyTitle}>No history yet</div>
            <div style={styles.emptySub}>Complete your first week to see your record.</div>
          </div>
        ) : (
          <div style={styles.historyList}>
            {[...state.history].reverse().map(w => {
              const ok = w.pct >= 0.85;
              return (
                <div key={w.wk} style={styles.historyRow}>
                  <div style={styles.historyWk}>{weekRange(w.wk)}</div>
                  <div style={styles.historyBr}>{w.e}/{w.t} bricks</div>
                  <div style={ok ? styles.badgeOk : styles.badgeNo}>{ok ? "🏠 Built" : "Try again"}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes brickIn {
          from { transform: translateY(-10px) scale(0.85); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
        * { box-sizing: border-box; }
        body { background: #F5F1E8; margin: 0; padding: 24px 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      `}</style>

      <div style={styles.app}>
        {/* Nav */}
        <nav style={styles.nav}>
          <div style={styles.navBrand}>🏠 Brick House</div>
          <div style={styles.navTabs}>
            {["today", "house", "streaks"].map((v, i) => (
              <button
                key={v}
                style={view === v ? styles.navTabActive : styles.navTab}
                onClick={() => setView(v)}
              >
                {["Today", "This Week", "Streaks"][i]}
              </button>
            ))}
          </div>
          <div style={styles.streakBadge}>🔥 {state.streak} week streak</div>
        </nav>

        {view === "today"   && renderTodayView()}
        {view === "house"   && renderHouseView()}
        {view === "streaks" && renderStreaksView()}
      </div>

      <Toast msg={toastMsg} />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  app: {
    background: "#F5F1E8", width: "100%", maxWidth: 600,
    borderRadius: 16, border: "1px solid rgba(139,58,58,0.15)",
    overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    margin: "0 auto",
  },
  nav: {
    background: "#8B3A3A", padding: "14px 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexWrap: "wrap", gap: 10,
  },
  navBrand: { display: "flex", alignItems: "center", gap: 10, color: "#E8E0D0", fontSize: 18, fontWeight: 500 },
  navTabs:  { display: "flex", gap: 4 },
  navTab: {
    background: "transparent", border: "none",
    color: "rgba(232,224,208,0.65)", padding: "6px 14px", borderRadius: 8,
    fontSize: 13, cursor: "pointer",
  },
  navTabActive: {
    background: "rgba(255,255,255,0.15)", border: "none",
    color: "#E8E0D0", padding: "6px 14px", borderRadius: 8,
    fontSize: 13, cursor: "pointer",
  },
  streakBadge: {
    display: "flex", alignItems: "center", gap: 6,
    background: "rgba(196,135,26,0.25)", border: "1px solid rgba(196,135,26,0.4)",
    color: "#F5D08A", padding: "5px 12px", borderRadius: 20,
    fontSize: 13, fontWeight: 500,
  },
  viewPad: { padding: 20 },
  weekHeader: {
    background: "white", borderRadius: 12, padding: "16px 20px", marginBottom: 16,
    border: "0.5px solid rgba(139,58,58,0.12)",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  weekLabel:        { fontSize: 13, color: "#7A6E5E", marginBottom: 2 },
  weekProgressText: { fontSize: 22, fontWeight: 500, color: "#2C2416" },
  quotaPill:        { background: "#EAF3DE", color: "#4A7C59", padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" },
  quotaSuccess:     { background: "#EAF3DE", color: "#3B6D11" },
  quotaWarning:     { background: "#FAEEDA", color: "#854F0B" },
  brickViz: {
    background: "white", borderRadius: 12, padding: 20,
    border: "0.5px solid rgba(139,58,58,0.12)", marginBottom: 16,
  },
  vizLabel:  { fontSize: 12, color: "#7A6E5E", marginBottom: 12 },
  brickGrid: { display: "flex", flexWrap: "wrap", gap: 4, minHeight: 60, alignItems: "flex-end" },
  brickEarned: (i) => ({
    width: 36, height: 18, borderRadius: 3,
    background: "#8B3A3A",
    boxShadow: "inset 0 -2px 0 #6B2828, inset 0 1px 0 #A85050",
    animation: `brickIn 0.35s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.04}s both`,
  }),
  brickGhost: {
    width: 36, height: 18, borderRadius: 3,
    background: "#EDE7D9", border: "1px dashed rgba(139,58,58,0.2)",
  },
  progressBarWrap: { marginTop: 14, height: 6, background: "#EDE7D9", borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", background: "#4A7C59", borderRadius: 3, transition: "width 0.5s ease" },
  progressLabels:  { display: "flex", justifyContent: "space-between", fontSize: 11, color: "#7A6E5E", marginTop: 5 },
  sectionLabel: { fontSize: 12, fontWeight: 500, color: "#7A6E5E", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 },
  habitCard: {
    background: "white", borderRadius: 12,
    border: "0.5px solid rgba(139,58,58,0.1)",
    marginBottom: 8, padding: "14px 16px",
    display: "flex", alignItems: "center", gap: 12,
  },
  checkDot: {
    width: 32, height: 32, borderRadius: "50%",
    border: "2px solid rgba(139,58,58,0.25)",
    cursor: "pointer", flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "white", color: "#4A7C59", fontWeight: 600,
    transition: "all 0.2s",
  },
  checkDotChecked: { background: "#4A7C59", borderColor: "#4A7C59", color: "white" },
  checkDotMaxed:   { background: "#8B3A3A", borderColor: "#8B3A3A", color: "white" },
  habitInfo: { flex: 1 },
  habitName: { fontSize: 15, color: "#2C2416" },
  habitFreq: { fontSize: 12, color: "#7A6E5E", marginTop: 2 },
  miniBricks: { display: "flex", gap: 3 },
  miniBrick:       { width: 10, height: 6, borderRadius: 1, background: "#EDE7D9" },
  miniBrickFilled: { width: 10, height: 6, borderRadius: 1, background: "#8B3A3A" },
  delBtn: {
    background: "none", border: "none", cursor: "pointer",
    color: "rgba(139,58,58,0.3)", padding: 4, borderRadius: 4,
    fontSize: 16, lineHeight: 1,
  },
  addHabitBtn: {
    width: "100%", marginTop: 8, padding: "14px 16px",
    background: "#4A7C59", color: "white", border: "none",
    borderRadius: 12, fontSize: 15, fontWeight: 500,
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8,
  },
  addForm: {
    background: "white", borderRadius: 12,
    border: "0.5px solid rgba(139,58,58,0.2)", padding: 18, marginBottom: 14,
  },
  formTitle: { fontSize: 15, fontWeight: 500, color: "#2C2416", marginBottom: 14 },
  formGroup: { marginBottom: 12 },
  formLabel: { fontSize: 12, color: "#7A6E5E", display: "block", marginBottom: 5 },
  formInput: {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: "0.5px solid rgba(0,0,0,0.15)", fontSize: 14,
    color: "#2C2416", background: "#F5F1E8", outline: "none",
  },
  freqChips: { display: "flex", flexWrap: "wrap", gap: 6 },
  freqChip: {
    padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
    border: "1px solid rgba(139,58,58,0.2)", color: "#7A6E5E",
    background: "white",
  },
  freqChipSelected: {
    padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
    border: "1px solid #8B3A3A", background: "#8B3A3A", color: "white",
  },
  formActions: { display: "flex", gap: 8, marginTop: 14 },
  btnSave: {
    background: "#8B3A3A", color: "white", border: "none",
    padding: "10px 24px", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer",
  },
  btnCancel: {
    background: "transparent", color: "#7A6E5E",
    border: "0.5px solid rgba(139,58,58,0.2)",
    padding: "10px 16px", borderRadius: 8, fontSize: 14, cursor: "pointer",
  },
  empty:      { textAlign: "center", padding: "36px 20px" },
  emptyIco:   { fontSize: 38, marginBottom: 10 },
  emptyTitle: { fontSize: 15, color: "#2C2416", marginBottom: 5 },
  emptySub:   { fontSize: 13, color: "#7A6E5E" },
  completeBanner: {
    background: "#4A7C59", color: "white", borderRadius: 12,
    padding: "18px 20px", textAlign: "center", marginBottom: 14,
  },
  houseCaption: { fontSize: 13, color: "#7A6E5E", textAlign: "center", marginBottom: 18 },
  twoCol:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  statCard: {
    background: "white", borderRadius: 12, padding: 16,
    border: "0.5px solid rgba(139,58,58,0.12)",
  },
  statLabel: { fontSize: 12, color: "#7A6E5E", marginBottom: 4 },
  statVal:   { fontSize: 28, fontWeight: 500, color: "#2C2416" },
  statSub:   { fontSize: 12, color: "#7A6E5E", marginTop: 2 },
  streakHero: {
    background: "#8B3A3A", borderRadius: 12, padding: "24px 20px",
    textAlign: "center", marginBottom: 16, color: "#E8E0D0",
  },
  streakNum:   { fontSize: 56, fontWeight: 500, lineHeight: 1 },
  streakSub:   { fontSize: 14, opacity: 0.75, marginTop: 6 },
  streakIcons: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 14 },
  streakIcon:  {
    width: 42, height: 42, borderRadius: 8,
    background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)",
    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
  },
  historyList: {
    background: "white", borderRadius: 12,
    border: "0.5px solid rgba(139,58,58,0.12)", overflow: "hidden",
  },
  historyRow: {
    display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
    borderBottom: "0.5px solid rgba(139,58,58,0.07)",
  },
  historyWk: { fontSize: 13, color: "#7A6E5E", flex: 1 },
  historyBr: { fontSize: 13, color: "#2C2416" },
  badgeOk:   { fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#EAF3DE", color: "#4A7C59" },
  badgeNo:   { fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#FAEEDA", color: "#854F0B" },
};
