// src/components/exam/DailyPracticePage.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, orderBy, where
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function DailyPracticePage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();

  const [quizzes,    setQuizzes]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filterCat,  setFilterCat]  = useState('');
  const [search,     setSearch]     = useState('');
  const [activeTab,  setActiveTab]  = useState('today'); // default to today's tab

  const today = new Date().toISOString().slice(0, 10);

  // Fetch all daily practice sets saved by admin
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
        setQuizzes(all);

        // If student has already completed today's exam(s), redirect to archive
        const todaysExams     = all.filter(q => q.scheduledDate === today);
        const completedToday  = todaysExams.filter(q =>
          profile?.completedExams?.includes(q.id)
        );
        if (todaysExams.length > 0 && completedToday.length === todaysExams.length) {
          navigate('/daily-reviews', { replace: true });
          return;
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile]);

  const filtered = quizzes.filter(q => {
    if (filterCat && q.category !== filterCat) return false;
    if (search && !q.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeTab === 'today') return q.scheduledDate === today;
    if (activeTab === 'done')  return profile?.completedExams?.includes(q.id);
    return true;
  });

  const handleStart = (quiz) => {
    const p = new URLSearchParams({
      scheduledExamId: quiz.id,
      category:  quiz.category  || 'general_nursing',
      examType:  'daily_practice',
      count:     quiz.questionCount || 20,
      timeLimit: quiz.timeLimit || 30,
      shuffle:   'true',
      showExpl:  'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  const isToday = (dateStr) => dateStr === today;
  const isDone  = (id)      => profile?.completedExams?.includes(id);

  const getCat = (id) => NURSING_CATEGORIES.find(c => c.id === id);

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>⚡</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Daily Practice
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Today's quiz is here. Once you complete it, it moves to your Daily Reviews archive.
        </p>
      </div>

      {/* Tabs */}
      <div style={styles.tabBar}>
        {[
          { id: 'all',   label: '📋 All',       count: quizzes.length },
          { id: 'today', label: '📅 Today',      count: quizzes.filter(q => q.scheduledDate === today).length },
          { id: 'done',  label: '✅ Completed',  count: quizzes.filter(q => isDone(q.id)).length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              ...styles.tabBtn,
              background:   activeTab === t.id ? 'var(--teal)'      : 'transparent',
              color:        activeTab === t.id ? '#fff'             : 'var(--text-muted)',
            }}
          >
            {t.label}
            <span style={{
              marginLeft: 6, fontSize: 11, fontWeight: 700,
              background: activeTab === t.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
              color:      activeTab === t.id ? '#fff' : 'var(--text-muted)',
              borderRadius: 20, padding: '1px 7px',
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
        <div style={styles.emptyState}>
          <span className="spinner" /> Loading quizzes…
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No quizzes found</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            {activeTab === 'today'
              ? <span>Today's quiz hasn't been posted yet. Check back soon! <br />
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
                    onClick={() => navigate('/daily-reviews')}>
                    📖 View past reviews
                  </button>
                </span>
              : activeTab === 'done'
              ? "You haven't completed any quizzes yet. Start one below!"
              : "No daily practice quizzes available yet."}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(quiz => {
            const cat   = getCat(quiz.category);
            const done  = isDone(quiz.id);
            const todayQ = isToday(quiz.scheduledDate);

            return (
              <div
                key={quiz.id}
                style={{
                  ...styles.card,
                  borderLeft: `4px solid ${todayQ ? 'var(--teal)' : done ? 'var(--green)' : 'var(--border)'}`,
                  opacity: 1,
                }}
              >
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>

                  {/* Icon */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                    background: cat ? `${cat.color}20` : 'var(--bg-tertiary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24,
                  }}>
                    {cat?.icon || '⚡'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                        {quiz.title || `Daily Practice — ${quiz.scheduledDate}`}
                      </span>
                      {todayQ && (
                        <span style={styles.badge('#0D9488')}>📅 Today</span>
                      )}
                      {done && (
                        <span style={styles.badge('#16A34A')}>✅ Done</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span style={styles.meta}>{cat?.shortLabel || quiz.category}</span>
                      <span style={styles.meta}>❓ {quiz.questionCount || 20} questions</span>
                      <span style={styles.meta}>⏱ {quiz.timeLimit || 30} mins</span>
                      <span style={styles.meta}>📅 {quiz.scheduledDate}</span>
                      {quiz.subject && <span style={styles.meta}>📖 {quiz.subject}</span>}
                    </div>
                  </div>

                  {/* Action */}
                  <button
                    className={`btn ${done ? 'btn-ghost' : 'btn-primary'}`}
                    style={{ flexShrink: 0, minWidth: 100 }}
                    onClick={() => handleStart(quiz)}
                  >
                    {done ? '🔁 Redo' : '▶ Start'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  tabBar: {
    display: 'flex', gap: 4,
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 4, marginBottom: 20, width: 'fit-content',
  },
  tabBtn: {
    padding: '7px 16px', borderRadius: 9, border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
    fontWeight: 700, transition: 'all 0.2s', display: 'flex', alignItems: 'center',
  },
  filterBar: {
    display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '16px 20px', transition: 'box-shadow 0.2s',
  },
  emptyState: {
    textAlign: 'center', padding: '60px 24px',
    color: 'var(--text-muted)', fontSize: 14,
  },
  meta: {
    fontSize: 12, color: 'var(--text-muted)',
  },
  badge: (color) => ({
    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
    background: `${color}18`, color: color, border: `1px solid ${color}40`,
  }),
};