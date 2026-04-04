// src/components/exam/DailyReviewStoragePage.jsx
//
// Route suggestion:  /exam/daily-reviews
// Shows all Daily Practice exams the student has completed.
// From here they can Review (read-only) or Retake (fresh attempt).

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where,
} from 'firebase/firestore';
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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const completed = profile?.completedExams || [];
        if (completed.length === 0) { setExams([]); setLoading(false); return; }

        const results = [];
        for (let i = 0; i < completed.length; i += 30) {
          const chunk = completed.slice(i, i + 30);
          const q = query(
            collection(db, 'scheduledExams'),
            where('__name__', 'in', chunk),
            where('type', '==', 'daily_practice')
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => results.push({ id: d.id, ...d.data() }));
        }

        results.sort((a, b) =>
          (a.scheduledDate || '') < (b.scheduledDate || '') ? 1 : -1
        );
        setExams(results);
      } catch (e) {
        console.error('DailyReviewStoragePage error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [profile]);

  const scores = profile?.examScores || {};

  const filtered = exams.filter(ex => {
    if (filterCat && ex.category !== filterCat) return false;
    if (search && !ex.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const avgScore = exams.length
    ? Math.round(exams.reduce((s, e) => s + (scores[e.id] ?? 0), 0) / exams.length)
    : null;
  const passCount = exams.filter(e => (scores[e.id] ?? 0) >= 70).length;

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

  const handleRetake = (exam) => {
    const p = new URLSearchParams({
      scheduledExamId: exam.id,
      category:  exam.category      || 'general_nursing',
      examType:  'daily_practice',
      count:     exam.questionCount || 20,
      timeLimit: exam.timeLimit     || 30,
      shuffle:   'true',
      showExpl:  'true',
      retake:    'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>⚡</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Daily Practice — Reviews
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          All your completed daily quizzes in one place. Review your answers or take them again.
        </p>
      </div>

      {/* ── Stats strip ── */}
      {exams.length > 0 && (
        <div style={styles.statsStrip}>
          <StatCard emoji="✅" label="Completed"    value={exams.length} />
          <StatCard emoji="🏆" label="Passed (≥70%)" value={passCount} color="var(--green)" />
          <StatCard
            emoji="📊"
            label="Avg Score"
            value={avgScore !== null ? `${avgScore}%` : '—'}
            color={avgScore >= 70 ? 'var(--green)' : avgScore >= 50 ? '#F59E0B' : '#EF4444'}
          />
        </div>
      )}

      {/* ── Filters ── */}
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

      {/* ── Content ── */}
      {loading ? (
        <div style={styles.emptyState}>
          <span className="spinner" /> Loading your reviews…
        </div>

      ) : exams.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>
            No completed daily quizzes yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360, margin: '0 auto 24px' }}>
            Once you finish a daily practice quiz, it will be saved here for you to review anytime.
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/exam/daily')}>
            ⚡ Go to Daily Practice
          </button>
        </div>

      ) : filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--text-primary)' }}>
            No matches found
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Try a different search term or category.
          </div>
          <button className="btn btn-ghost" onClick={() => { setSearch(''); setFilterCat(''); }}>
            Clear filters
          </button>
        </div>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map(exam => {
            const cat      = getCat(exam.category);
            const score    = scores[exam.id];
            const hasScore = score !== undefined && score !== null;
            const scoreColor = hasScore
              ? score >= 70 ? 'var(--green)' : score >= 50 ? '#F59E0B' : '#EF4444'
              : 'var(--border)';

            return (
              <div
                key={exam.id}
                style={{
                  ...styles.card,
                  borderLeft: `4px solid ${scoreColor}`,
                }}
              >
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                        {exam.title || `Daily Practice — ${exam.scheduledDate}`}
                      </span>
                      {hasScore && (
                        <span style={badge(scoreColor)}>
                          {score >= 70 ? '✅' : '❌'} {score}%
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span style={styles.meta}>{cat?.shortLabel || exam.category}</span>
                      <span style={styles.meta}>❓ {exam.questionCount || 20} questions</span>
                      <span style={styles.meta}>⏱ {exam.timeLimit || 30} mins</span>
                      {exam.scheduledDate && (
                        <span style={styles.meta}>📅 {exam.scheduledDate}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleReview(exam)}
                    >
                      👁 Review
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleRetake(exam)}
                    >
                      🔁 Retake
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

function StatCard({ emoji, label, value, color }) {
  return (
    <div style={styles.statCard}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 800, fontSize: 18, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>
          {value}
        </div>
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
    flex: '1 1 130px', minWidth: 110,
  },
  filterBar: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '16px 20px', transition: 'box-shadow 0.2s',
  },
  emptyState: {
    textAlign: 'center', padding: '60px 24px',
    color: 'var(--text-muted)', fontSize: 14,
  },
  meta: { fontSize: 12, color: 'var(--text-muted)' },
};
