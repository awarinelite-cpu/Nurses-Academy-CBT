// src/components/exam/DailyReviewStoragePage.jsx
//
// Archive for daily practice exams.
// Shows:
//   1. All exams the student has COMPLETED (any date)
//   2. All past-date exams (scheduledDate < today) — auto-archived after 24hrs
//      even if the student hasn't taken them yet
//
// Route: /daily-reviews

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function DailyReviewStoragePage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [exams,     setExams]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filterCat, setFilterCat] = useState('');
  const [search,    setSearch]    = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'done' | 'pending'

  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'scheduledExams'),
          where('type', '==', 'daily_practice'),
          orderBy('scheduledDate', 'desc')
        );
        const snap = await getDocs(q);
        const all  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Archive = completed by student OR past-date (older than today)
        const archived = all.filter(ex =>
          profile?.completedExams?.includes(ex.id) ||
          (ex.scheduledDate && ex.scheduledDate < today)
        );

        setExams(archived);
      } catch (e) {
        console.error('DailyReviewStoragePage error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile]);

  const scores    = profile?.examScores    || {};
  const completed = profile?.completedExams || [];

  const isDone = (id) => completed.includes(id);

  const filtered = exams.filter(ex => {
    if (filterCat && ex.category !== filterCat) return false;
    if (search && !ex.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeTab === 'done')    return isDone(ex.id);
    if (activeTab === 'pending') return !isDone(ex.id);
    return true;
  });

  const doneCount    = exams.filter(e => isDone(e.id)).length;
  const pendingCount = exams.filter(e => !isDone(e.id)).length;
  const avgScore     = doneCount > 0
    ? Math.round(exams.filter(e => isDone(e.id))
        .reduce((s, e) => s + (scores[e.id] ?? 0), 0) / doneCount)
    : null;

  const getCat = (id) => NURSING_CATEGORIES.find(c => c.id === id);

  const handleReview = (exam) => {
    const p = new URLSearchParams({
      scheduledExamId: exam.id,
      category: exam.category || 'general_nursing',
      examType: 'daily_practice',
      mode: 'review',
    });
    navigate(`/exam/review?${p.toString()}`);
  };

  const handleStart = (exam) => {
    const p = new URLSearchParams({
      scheduledExamId: exam.id,
      category:  exam.category      || 'general_nursing',
      examType:  'daily_practice',
      count:     exam.questionCount || 20,
      timeLimit: exam.timeLimit     || 30,
      shuffle:   'true',
      showExpl:  'true',
      retake:    isDone(exam.id) ? 'true' : 'false',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>📖</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Daily Practice — Archive
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          All past daily quizzes saved here — review your answers or take any you missed.
        </p>
      </div>

      {/* Today's quiz banner — shows if today's exam exists and isn't done */}
      <TodayBanner profile={profile} today={today} navigate={navigate} />

      {/* Stats */}
      {exams.length > 0 && (
        <div style={styles.statsStrip}>
          <StatCard emoji="📚" label="Archived"       value={exams.length} />
          <StatCard emoji="✅" label="Completed"       value={doneCount}    color="var(--green)" />
          <StatCard emoji="⏳" label="Not Taken Yet"   value={pendingCount} color="#F59E0B" />
          <StatCard
            emoji="📊" label="Avg Score"
            value={avgScore !== null ? `${avgScore}%` : '—'}
            color={avgScore >= 70 ? 'var(--green)' : avgScore >= 50 ? '#F59E0B' : '#EF4444'}
          />
        </div>
      )}

      {/* Tabs */}
      <div style={styles.tabBar}>
        {[
          { id: 'all',     label: '📋 All',           count: exams.length  },
          { id: 'done',    label: '✅ Completed',      count: doneCount     },
          { id: 'pending', label: '⏳ Not Taken Yet',  count: pendingCount  },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            ...styles.tabBtn,
            background: activeTab === t.id ? 'var(--teal)' : 'transparent',
            color:      activeTab === t.id ? '#fff'        : 'var(--text-muted)',
          }}>
            {t.label}
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '1px 7px',
              background: activeTab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
              color:      activeTab === t.id ? '#fff' : 'var(--text-muted)',
            }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <input
          className="form-input"
          style={{ maxWidth: 220, height: 38 }}
          placeholder="🔍 Search quizzes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="form-input form-select"
          style={{ maxWidth: 200, height: 38 }}
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
        >
          <option value="">All Categories</option>
          {NURSING_CATEGORIES.map(c => (
            <option key={c.id} value={c.id}>{c.shortLabel}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div style={styles.emptyState}><span className="spinner" /> Loading archive…</div>

      ) : exams.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>
            No archived quizzes yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360, margin: '0 auto 24px' }}>
            Quizzes appear here automatically after 24 hours, or right after you complete them.
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/daily-practice')}>
            ⚡ Go to Today's Quiz
          </button>
        </div>

      ) : filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--text-primary)' }}>
            No matches found
          </div>
          <button className="btn btn-ghost"
            onClick={() => { setSearch(''); setFilterCat(''); setActiveTab('all'); }}>
            Clear filters
          </button>
        </div>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(exam => {
            const cat      = getCat(exam.category);
            const done     = isDone(exam.id);
            const score    = scores[exam.id];
            const hasScore = score !== undefined && score !== null;
            const scoreColor = hasScore
              ? score >= 70 ? 'var(--green)' : score >= 50 ? '#F59E0B' : '#EF4444'
              : 'var(--border)';

            return (
              <div key={exam.id} style={{
                ...styles.card,
                borderLeft: `4px solid ${done ? scoreColor : '#F59E0B'}`,
              }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>

                  {/* Icon */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: cat ? `${cat.color}20` : 'var(--bg-tertiary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                  }}>
                    {cat?.icon || '⚡'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                        {exam.title || `Daily Practice — ${exam.scheduledDate}`}
                      </span>
                      {done
                        ? <span style={badge(scoreColor)}>{score >= 70 ? '✅' : '❌'} {score}%</span>
                        : <span style={badge('#F59E0B')}>⏳ Not taken</span>
                      }
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={styles.meta}>{cat?.shortLabel || exam.category}</span>
                      <span style={styles.meta}>❓ {exam.questionCount || 20} questions</span>
                      <span style={styles.meta}>⏱ {exam.timeLimit || 30} mins</span>
                      <span style={styles.meta}>📅 {exam.scheduledDate}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {done && (
                      <button className="btn btn-primary btn-sm" onClick={() => handleReview(exam)}>
                        👁 Review
                      </button>
                    )}
                    <button
                      className={`btn btn-sm ${done ? 'btn-ghost' : 'btn-primary'}`}
                      onClick={() => handleStart(exam)}
                    >
                      {done ? '🔁 Retake' : '▶ Start'}
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Today's exam banner ────────────────────────────────────────────────────────
// Shows at the top of the archive if today's exam is available but not yet done
function TodayBanner({ profile, today, navigate }) {
  const [todayExam, setTodayExam] = useState(null);

  useEffect(() => {
    const check = async () => {
      try {
        const q = query(
          collection(db, 'scheduledExams'),
          where('type', '==', 'daily_practice'),
          where('scheduledDate', '==', today)
        );
        const snap  = await getDocs(q);
        const exams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pending = exams.find(e => !profile?.completedExams?.includes(e.id));
        setTodayExam(pending || null);
      } catch (e) { /* silent */ }
    };
    check();
  }, [profile, today]);

  if (!todayExam) return null;

  const handleStart = () => {
    const p = new URLSearchParams({
      scheduledExamId: todayExam.id,
      category:  todayExam.category      || 'general_nursing',
      examType:  'daily_practice',
      count:     todayExam.questionCount || 20,
      timeLimit: todayExam.timeLimit     || 30,
      shuffle:   'true',
      showExpl:  'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(37,99,235,0.1))',
      border: '1px solid rgba(13,148,136,0.35)', borderRadius: 14,
      padding: '14px 18px', marginBottom: 24,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontWeight: 700, color: 'var(--teal)', fontSize: 14, marginBottom: 2 }}>
          📅 Today's quiz is available!
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {todayExam.title || `Daily Practice — ${today}`} &nbsp;·&nbsp;
          ❓ {todayExam.questionCount || 20} questions
        </div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={handleStart}>
        ▶ Start Now
      </button>
    </div>
  );
}

function StatCard({ emoji, label, value, color }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

const badge = (color) => ({
  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
  background: `${color}18`, color, border: `1px solid ${color}40`,
});

const styles = {
  statsStrip: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 },
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 18px',
    display: 'flex', alignItems: 'center', gap: 10,
    flex: '1 1 110px', minWidth: 100,
  },
  tabBar: {
    display: 'flex', gap: 4, flexWrap: 'wrap',
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 4, marginBottom: 20, width: 'fit-content',
  },
  tabBtn: {
    padding: '7px 16px', borderRadius: 9, border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
    fontWeight: 700, transition: 'all 0.2s', display: 'flex', alignItems: 'center',
  },
  filterBar: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '16px 20px', transition: 'box-shadow 0.2s',
  },
  emptyState: { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
  meta: { fontSize: 12, color: 'var(--text-muted)' },
};
