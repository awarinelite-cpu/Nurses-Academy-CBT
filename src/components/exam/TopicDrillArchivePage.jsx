// src/components/exam/TopicDrillArchivePage.jsx
//
// Route: /topic-drill-archive
// Archive of all topic drill sessions the student has taken.
// Groups drills by topic title so students can retake any topic.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function TopicDrillArchivePage() {
  const { user, profile } = useAuth();
  const navigate          = useNavigate();

  const [sessions,  setSessions]  = useState([]); // past examSessions with examType=topic_drill
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
          where('examType', '==', 'topic_drill'),
          orderBy('completedAt', 'desc'),
          limit(200)
        );
        const snap = await getDocs(q);
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('TopicDrillArchivePage error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  // Group by topic
  const grouped = {};
  sessions.forEach(s => {
    const key = s.topic || s.subject || 'General';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  const topicKeys = Object.keys(grouped).filter(k =>
    !search || k.toLowerCase().includes(search.toLowerCase())
  );

  const totalSessions = sessions.length;
  const avgScore      = totalSessions > 0
    ? Math.round(sessions.reduce((a, s) => a + (s.scorePercent || 0), 0) / totalSessions)
    : null;
  const bestScore     = totalSessions > 0
    ? Math.max(...sessions.map(s => s.scorePercent || 0))
    : null;

  const getCat = (id) => NURSING_CATEGORIES.find(c => c.id === id);

  const handleRetake = (session) => {
    const p = new URLSearchParams({
      category:  session.category  || 'general_nursing',
      examType:  'topic_drill',
      topic:     session.topic     || session.subject || '',
      count:     session.totalQuestions || 20,
      timeLimit: 30,
      shuffle:   'true',
      showExpl:  'true',
    });
    navigate(`/exam/session?${p.toString()}`);
  };

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span style={{ fontSize: 32 }}>🎯</span>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0, color: 'var(--text-primary)' }}>
            Topic Drill — Archive
          </h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          All your past topic drills grouped by topic. Jump back in any time.
        </p>
      </div>

      {/* Stats */}
      {totalSessions > 0 && (
        <div style={styles.statsStrip}>
          <StatCard emoji="🎯" label="Topics Drilled" value={topicKeys.length} />
          <StatCard emoji="📝" label="Total Sessions" value={totalSessions} />
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

      {/* Search + new drill button */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          style={{ maxWidth: 240, height: 38 }}
          placeholder="🔍 Search topics…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/exam/categories?type=topic_drill')}>
          🎯 Start New Topic Drill
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div style={styles.emptyState}><span className="spinner" /> Loading archive…</div>

      ) : sessions.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📭</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 8 }}>
            No topic drills yet
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 360, margin: '0 auto 24px' }}>
            Once you complete a topic drill, it will be saved here for you to review and retake.
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/exam/categories?type=topic_drill')}>
            🎯 Start Your First Topic Drill
          </button>
        </div>

      ) : topicKeys.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>No topics match "{search}"</div>
          <button className="btn btn-ghost" onClick={() => setSearch('')}>Clear search</button>
        </div>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {topicKeys.map(topic => {
            const topicSessions = grouped[topic];
            const best     = Math.max(...topicSessions.map(s => s.scorePercent || 0));
            const latest   = topicSessions[0]; // already sorted desc
            const bestColor = best >= 70 ? 'var(--green)' : best >= 50 ? '#F59E0B' : '#EF4444';
            const cat      = getCat(latest.category);

            return (
              <div key={topic} style={styles.card}>
                {/* Topic header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    background: cat ? `${cat.color}20` : 'rgba(13,148,136,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  }}>
                    🎯
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)', marginBottom: 3 }}>
                      {topic}
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span style={styles.meta}>{cat?.shortLabel || latest.category}</span>
                      <span style={styles.meta}>🔁 {topicSessions.length} attempt{topicSessions.length > 1 ? 's' : ''}</span>
                      <span style={{ ...styles.meta, color: bestColor, fontWeight: 700 }}>
                        🏆 Best: {best}%
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleRetake(latest)}
                  >
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
                  {topicSessions.slice(0, 5).map((s, i) => {
                    const sc = s.scorePercent || 0;
                    const sc_color = sc >= 70 ? 'var(--green)' : sc >= 50 ? '#F59E0B' : '#EF4444';
                    const date = s.completedAt?.toDate
                      ? new Date(s.completedAt.toDate()).toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' })
                      : 'Recently';
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: 24 }}>#{i + 1}</span>
                        <span style={{ fontWeight: 700, color: sc_color, minWidth: 44 }}>{sc}%</span>
                        <span style={{ color: 'var(--text-muted)', flex: 1 }}>
                          {s.correct}/{s.totalQuestions} correct
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{date}</span>
                      </div>
                    );
                  })}
                  {topicSessions.length > 5 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                      +{topicSessions.length - 5} more attempts
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
    borderLeft: '4px solid var(--teal)',
    borderRadius: 14, padding: '16px 20px',
  },
  emptyState: { textAlign: 'center', padding: '60px 24px', color: 'var(--text-muted)', fontSize: 14 },
  meta: { fontSize: 12, color: 'var(--text-muted)' },
};
