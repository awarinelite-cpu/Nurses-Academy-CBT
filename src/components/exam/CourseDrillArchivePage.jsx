// src/components/exam/CourseDrillArchivePage.jsx
//
// Route: /course-drill-archive
// Archive of all course drill sessions the student has taken.
// Grouped by course so students can easily retake any course.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_NURSING_COURSES, NURSING_CATEGORIES } from '../../data/categories';

export default function CourseDrillArchivePage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  const [sessions,  setSessions]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'examSessions'),
          where('userId',   '==', user.uid),
          where('examType', '==', 'course_drill'),
          orderBy('completedAt', 'desc'),
          limit(200)
        );
        const snap = await getDocs(q);
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('CourseDrillArchivePage error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  // Group sessions by course
  const grouped = {};
  sessions.forEach(s => {
    const key = s.course || 'general';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  const courseKeys = Object.keys(grouped).filter(k => {
    if (!search) return true;
    const label = getCourseLabel(k);
    return label.toLowerCase().includes(search.toLowerCase());
  });

  const totalSessions = sessions.length;
  const avgScore = totalSessions > 0
    ? Math.round(sessions.reduce((a, s) => a + (s.scorePercent || 0), 0) / totalSessions)
    : null;
  const bestScore = totalSessions > 0
    ? Math.max(...sessions.map(s => s.scorePercent || 0))
    : null;

  function getCourseLabel(courseId) {
    const found = DEFAULT_NURSING_COURSES.find(c => c.id === courseId);
    return found?.label || courseId;
  }

  function getCourseIcon(courseId) {
    const found = DEFAULT_NURSING_COURSES.find(c => c.id === courseId);
    return found?.icon || '📖';
  }

  const handleRetake = (session) => {
    const p = new URLSearchParams({
      category:    session.category    || 'general_nursing',
      examType:    'course_drill',
      course:      session.course      || '',
      courseLabel: getCourseLabel(session.course),
      count:       session.totalQuestions || 20,
      timeLimit:   30,
      shuffle:     'true',
      showExpl:    'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  const handleNewDrill = () => navigate('/course-drill');

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>📚</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Course Drill — Archive
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          All your past course drills grouped by course. Jump back in anytime.
        </p>
      </div>

      {/* Stats */}
      {totalSessions > 0 && (
        <div style={styles.statsStrip}>
          <StatCard emoji="📚" label="Courses Drilled" value={courseKeys.length} />
          <StatCard emoji="📝" label="Total Sessions"  value={totalSessions} />
          <StatCard
            emoji="📊" label="Avg Score"
            value={avgScore !== null ? `${avgScore}%` : '—'}
            color={avgScore >= 70 ? 'var(--green)' : avgScore >= 50 ? '#F59E0B' : '#EF4444'}
          />
          <StatCard
            emoji="🏆" label="Best Score"
            value={bestScore !== null ? `${bestScore}%` : '—'}
            color="var(--green)"
          />
        </div>
      )}

      {/* Search + new drill */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          style={{ maxWidth: 240, height: 38 }}
          placeholder="🔍 Search courses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" onClick={handleNewDrill}>
          📖 Start New Course Drill
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={styles.emptyState}><span className="spinner" /> Loading archive…</div>

      ) : sessions.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>
            No course drills yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360, margin: '0 auto 24px' }}>
            Once you complete a course drill, it will be saved here for you to review and retake.
          </div>
          <button className="btn btn-primary" onClick={handleNewDrill}>
            📖 Start Your First Course Drill
          </button>
        </div>

      ) : courseKeys.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No courses match "{search}"</div>
          <button className="btn btn-ghost" onClick={() => setSearch('')}>Clear search</button>
        </div>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {courseKeys.map(courseId => {
            const courseSessions = grouped[courseId];
            const best      = Math.max(...courseSessions.map(s => s.scorePercent || 0));
            const latest    = courseSessions[0];
            const bestColor = best >= 70 ? 'var(--green)' : best >= 50 ? '#F59E0B' : '#EF4444';
            const label     = getCourseLabel(courseId);
            const icon      = getCourseIcon(courseId);

            return (
              <div key={courseId} style={styles.card}>
                {/* Course header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    background: 'rgba(8,145,178,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
                  }}>
                    {icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 3 }}>
                      {label}
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={styles.meta}>🔁 {courseSessions.length} attempt{courseSessions.length > 1 ? 's' : ''}</span>
                      <span style={{ ...styles.meta, color: bestColor, fontWeight: 700 }}>
                        🏆 Best: {best}%
                      </span>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => handleRetake(latest)}>
                    🔁 Retake
                  </button>
                </div>

                {/* Attempt history */}
                <div style={{
                  background: 'var(--bg-secondary)', borderRadius: 10, padding: '10px 14px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    Attempt History
                  </div>
                  {courseSessions.slice(0, 5).map((s, i) => {
                    const sc       = s.scorePercent || 0;
                    const sc_color = sc >= 70 ? 'var(--green)' : sc >= 50 ? '#F59E0B' : '#EF4444';
                    const date     = s.completedAt?.toDate
                      ? new Date(s.completedAt.toDate()).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
                      : 'Recently';
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: 24 }}>#{i + 1}</span>
                        <span style={{ fontWeight: 700, color: sc_color, minWidth: 44 }}>{sc}%</span>
                        <span style={{ color: 'var(--text-muted)', flex: 1 }}>{s.correct}/{s.totalQuestions} correct</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{date}</span>
                      </div>
                    );
                  })}
                  {courseSessions.length > 5 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      +{courseSessions.length - 5} more attempts
                    </div>
                  )}
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
        <div style={{ fontWeight: 800, fontSize: 18, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

const styles = {
  statsStrip: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 },
  statCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '12px 18px',
    display: 'flex', alignItems: 'center', gap: 10,
    flex: '1 1 110px', minWidth: 100,
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderLeft: '4px solid #0891B2',
    borderRadius: 14, padding: '16px 20px',
  },
  emptyState: { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
  meta: { fontSize: 12, color: 'var(--text-muted)' },
};
