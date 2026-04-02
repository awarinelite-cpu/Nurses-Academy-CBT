// src/components/exam/ExamSession.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';
import { NURSING_CATEGORIES } from '../../data/categories';

export default function ExamSession() {
  const { user } = useAuth();
  const [params]  = useSearchParams();
  const navigate  = useNavigate();

  const category   = params.get('category');
  const examType   = params.get('examType') || 'past_questions';
  const year       = params.get('year');
  const count      = parseInt(params.get('count') || '40');
  const timeLimit  = parseInt(params.get('timeLimit') || '60');
  const doShuffle  = params.get('shuffle') !== 'false';

  const [questions,  setQuestions]  = useState([]);
  const [current,    setCurrent]    = useState(0);
  const [answers,    setAnswers]    = useState({});  // index -> optionIdx
  const [flagged,    setFlagged]    = useState(new Set());
  const [timeLeft,   setTimeLeft]   = useState(timeLimit * 60);
  const [phase,      setPhase]      = useState('loading'); // loading | exam | review | result
  const [aiExpl,     setAiExpl]     = useState('');
  const [aiLoading,  setAiLoading]  = useState(false);
  const [sessionId,  setSessionId]  = useState(null);
  const timerRef = useRef(null);
  const startedAt = useRef(Date.now());

  // ── Load questions ──────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        // Strict query — must match exact category + examType + year
        // No fallback — questions must belong to the exact combination selected
        let constraints = [
          where('category', '==', category),
          where('active',   '==', true),
          where('examType', '==', examType),
        ];
        if (year) constraints.push(where('year', '==', year));

        const q    = query(collection(db, 'questions'), ...constraints);
        const snap = await getDocs(q);
        let qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (doShuffle) qs = qs.sort(() => Math.random() - 0.5);
        qs = qs.slice(0, count);

        setQuestions(qs);
        setPhase(qs.length > 0 ? 'exam' : 'empty');
        startedAt.current = Date.now();
      } catch (e) {
        console.error(e);
        setPhase('error');
      }
    };
    load();
  }, [category, examType, year, count, doShuffle]);

  // ── Timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'exam' || timeLimit === 0) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); submitExam(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, timeLimit]);

  const submitExam = useCallback(async () => {
    clearInterval(timerRef.current);
    const correct = questions.filter((q, i) => answers[i] === q.correctIndex).length;
    const score   = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    const elapsed = Math.round((Date.now() - startedAt.current) / 1000);

    // Save to Firestore
    try {
      const sessionData = {
        userId: user.uid, category, examType, year: year || null,
        totalQuestions: questions.length, correct, wrong: questions.length - correct,
        scorePercent: score, timeTakenSeconds: elapsed,
        answers: Object.entries(answers).map(([i, a]) => ({
          questionId: questions[i]?.id,
          selectedIndex: a,
          correct: a === questions[i]?.correctIndex,
        })),
        completedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'examSessions'), sessionData);
      setSessionId(ref.id);
      // Update user stats
      await updateDoc(doc(db, 'users', user.uid), {
        totalExams: increment(1),
        totalScore: increment(score),
      });
    } catch (e) { console.error(e); }
    setPhase('result');
  }, [questions, answers, user, category, examType, year]);

  // ── AI Explanation (Gemini) ─────────────────────────────────────
  const getAiExplanation = async (q) => {
    if (!q.question) return;
    setAiLoading(true); setAiExpl('');
    try {
      const apiKey = 'AIzaSyCC-cwAhj7fUY4WKhj7nLB3VYQjlyQMpjE';
      const prompt = `You are an expert NMCN nursing exam tutor. Explain the correct answer to this nursing exam question in a clear, educational way for a nursing student.

Question: ${q.question}
Options: ${q.options.map((o, i) => `${String.fromCharCode(65+i)}. ${o}`).join(', ')}
Correct Answer: ${String.fromCharCode(65 + q.correctIndex)}. ${q.options[q.correctIndex]}
${q.explanation ? `Existing explanation: ${q.explanation}` : ''}

Provide a comprehensive explanation (3-5 sentences) covering:
1. Why the correct answer is right
2. Why the other options are wrong
3. Key nursing principle or clinical pearl

Be concise but thorough. Use proper medical terminology.`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          }),
        }
      );
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      setAiExpl(text || 'AI explanation unavailable.');
    } catch (e) {
      setAiExpl(q.explanation || 'No explanation available for this question.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAnswer = (optIdx) => {
    if (answers[current] !== undefined) return; // already answered
    setAnswers(prev => ({ ...prev, [current]: optIdx }));
  };

  const toggleFlag = () => {
    setFlagged(prev => {
      const n = new Set(prev);
      n.has(current) ? n.delete(current) : n.add(current);
      return n;
    });
  };

  // ── Render helpers ───────────────────────────────────────────────
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const timerClass = timeLeft < 60 ? 'timer-danger' : timeLeft < 300 ? 'timer-warning' : '';

  if (phase === 'loading') return (
    <div className="flex-center" style={{ height: '60vh', flexDirection: 'column', gap: 16 }}>
      <div className="spinner" />
      <p style={{ color: 'var(--text-muted)' }}>Loading exam questions…</p>
    </div>
  );

  if (phase === 'empty' || phase === 'error') return (
    <div className="flex-center" style={{ height: '60vh', flexDirection: 'column', gap: 16, textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 48 }}>📭</div>
      <h3>No questions found</h3>
      <p style={{ color: 'var(--text-muted)', maxWidth: 400 }}>
        {phase === 'error'
          ? 'Failed to load questions. Check your connection and try again.'
          : `No questions have been uploaded yet for ${examType.replace('_', ' ')}${year ? ` (${year})` : ''} in this category. Please check back later.`}
      </p>
      <button className="btn btn-primary" onClick={() => navigate(-1)}>← Go Back</button>
    </div>
  );

  if (phase === 'result') {
    return <ExamResult questions={questions} answers={answers} sessionId={sessionId} navigate={navigate} />;
  }

  const q       = questions[current];
  const catInfo = NURSING_CATEGORIES.find(c => c.id === category);
  const answered = Object.keys(answers).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      {/* Header bar */}
      <div style={styles.topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{catInfo?.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              {catInfo?.shortLabel}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Q {current + 1} of {questions.length}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Progress */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              {answered}/{questions.length} answered
            </div>
            <div className="progress-bar" style={{ width: 120 }}>
              <div className="progress-fill" style={{ width: `${(answered / questions.length) * 100}%` }} />
            </div>
          </div>

          {/* Timer */}
          {timeLimit > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>TIME LEFT</div>
              <div className={`timer-display ${timerClass}`}>{formatTime(timeLeft)}</div>
            </div>
          )}

          {/* Flag & Submit */}
          <button
            className={`btn btn-sm ${flagged.has(current) ? 'btn-gold' : 'btn-ghost'}`}
            onClick={toggleFlag}
            title="Flag for review"
          >
            {flagged.has(current) ? '🚩 Flagged' : '🏳️ Flag'}
          </button>

          <button className="btn btn-danger btn-sm" onClick={() => {
            if (window.confirm('Submit exam now? You cannot go back.')) submitExam();
          }}>
            Submit
          </button>
        </div>
      </div>

      {/* Question navigator (pills) */}
      <div style={styles.navigator}>
        {questions.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            style={{
              ...styles.navPill,
              background: i === current ? 'var(--teal)' :
                          answers[i] !== undefined ? 'rgba(22,163,74,0.25)' :
                          flagged.has(i) ? 'rgba(245,158,11,0.25)' : 'var(--bg-tertiary)',
              color: i === current ? '#fff' :
                     answers[i] !== undefined ? 'var(--green)' :
                     flagged.has(i) ? 'var(--gold-dark)' : 'var(--text-muted)',
              border: `2px solid ${
                i === current ? 'var(--teal)' :
                flagged.has(i) ? 'var(--gold)' : 'var(--border)'
              }`,
              fontWeight: i === current ? 700 : 600,
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Question card */}
      <div style={styles.questionCard} className="anim-fadeIn">
        <div style={styles.qMeta}>
          {q.difficulty && (
            <span className={`badge ${q.difficulty === 'easy' ? 'badge-green' : q.difficulty === 'hard' ? 'badge-red' : 'badge-gold'}`}>
              {q.difficulty}
            </span>
          )}
          {q.subject && <span className="badge badge-blue">{q.subject}</span>}
          {q.source && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>{q.source}</span>}
        </div>

        <div style={styles.qText}>{q.question}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {q.options?.map((opt, i) => {
            const chosen    = answers[current];
            const isChosen  = chosen === i;
            const isCorrect = i === q.correctIndex;
            const reviewed  = chosen !== undefined;

            let cls = 'option-card';
            if (reviewed) {
              cls += isCorrect ? ' correct' : isChosen ? ' wrong' : '';
              cls += ' disabled';
            } else if (isChosen) {
              cls += ' selected';
            }

            return (
              <div key={i} className={cls} onClick={() => handleAnswer(i)}>
                <div className="option-letter">{String.fromCharCode(65 + i)}</div>
                <div style={{ flex: 1, fontSize: 15 }}>{opt}</div>
                {reviewed && isCorrect && <span style={{ fontSize: 18 }}>✅</span>}
                {reviewed && isChosen && !isCorrect && <span style={{ fontSize: 18 }}>❌</span>}
              </div>
            );
          })}
        </div>

        {/* Explanation panel (after answering) */}
        {answers[current] !== undefined && (
          <div style={styles.explPanel}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: 'var(--teal)', fontSize: 14 }}>
                💡 Explanation
              </div>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => getAiExplanation(q)}
                disabled={aiLoading}
              >
                {aiLoading ? <><span className="spinner spinner-sm" /> Loading…</> : '🤖 AI Explain'}
              </button>
            </div>
            {q.explanation && !aiExpl && (
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {q.explanation}
              </p>
            )}
            {aiExpl && (
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7,
                background: 'var(--teal-glow)', borderRadius: 8, padding: '12px 14px',
                border: '1px solid rgba(13,148,136,0.2)',
              }}>
                🤖 <strong>AI Explanation:</strong><br />{aiExpl}
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 8 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setCurrent(Math.max(0, current - 1))}
            disabled={current === 0}
          >
            ← Previous
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setCurrent(Math.min(questions.length - 1, current + 1))}
            disabled={current === questions.length - 1}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Results screen ──────────────────────────────────────────────────
function ExamResult({ questions, answers, sessionId, navigate }) {
  const correct = questions.filter((q, i) => answers[i] === q.correctIndex).length;
  const total   = questions.length;
  const score   = total > 0 ? Math.round((correct / total) * 100) : 0;
  const pass    = score >= 50;

  const [reviewing, setReviewing] = useState(false);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <div style={{
        background: `linear-gradient(135deg, ${pass ? '#1E3A8A' : '#7C1D1D'}, ${pass ? '#0D9488' : '#9B1C1C'})`,
        borderRadius: 20, padding: '32px 28px', textAlign: 'center', marginBottom: 24,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>{score >= 70 ? '🏆' : score >= 50 ? '✅' : '📚'}</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: '2.5rem', fontWeight: 900, color: '#fff' }}>
          {score}%
        </div>
        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, marginTop: 4 }}>
          {correct} of {total} correct — {pass ? '🎉 PASS' : '📖 NEEDS IMPROVEMENT'}
        </div>
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 24 }}>
          {[
            { label: 'Correct', value: correct, color: '#4ADE80' },
            { label: 'Wrong',   value: total - correct, color: '#F87171' },
            { label: 'Skipped', value: total - Object.keys(answers).length, color: '#FCD34D' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 22, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => setReviewing(!reviewing)}>
          {reviewing ? '🔼 Hide Review' : '📖 Review Answers'}
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/exams')}>
          🔄 New Exam
        </button>
        <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>
          🏠 Dashboard
        </button>
        {sessionId && (
          <button className="btn btn-outline" onClick={() => navigate(`/results/${sessionId}`)}>
            📊 Full Report
          </button>
        )}
      </div>

      {reviewing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {questions.map((q, i) => {
            const chosen     = answers[i];
            const isCorrect  = chosen === q.correctIndex;
            const wasSkipped = chosen === undefined;
            return (
              <div key={i} style={{
                ...styles.reviewCard,
                borderLeft: `4px solid ${isCorrect ? 'var(--green)' : wasSkipped ? 'var(--gold)' : 'var(--red)'}`,
              }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 13 }}>Q{i+1}</span>
                  <span style={{ fontSize: 18 }}>{isCorrect ? '✅' : wasSkipped ? '⏭️' : '❌'}</span>
                </div>
                <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--text-primary)', fontSize: 15 }}>
                  {q.question}
                </div>
                <div style={{ fontSize: 13, color: 'var(--green)', marginBottom: 4 }}>
                  ✔ Correct: {String.fromCharCode(65 + q.correctIndex)}. {q.options[q.correctIndex]}
                </div>
                {!isCorrect && chosen !== undefined && (
                  <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 4 }}>
                    ✗ Your answer: {String.fromCharCode(65 + chosen)}. {q.options[chosen]}
                  </div>
                )}
                {q.explanation && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6,
                    background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 10px',
                  }}>
                    💡 {q.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  topBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '14px 18px', marginBottom: 16, flexWrap: 'wrap', gap: 10,
  },
  navigator: {
    display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16, padding: '12px',
    background: 'var(--bg-tertiary)', borderRadius: 12, border: '1px solid var(--border)',
  },
  navPill: {
    width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 12, transition: 'all 0.15s',
  },
  questionCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '24px 22px',
  },
  qMeta: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' },
  qText: {
    fontSize: 17, fontWeight: 700, color: 'var(--text-primary)',
    lineHeight: 1.65, marginBottom: 20,
  },
  explPanel: {
    background: 'var(--bg-secondary)', borderRadius: 12,
    border: '1px solid var(--border)', padding: '16px', marginBottom: 16,
  },
  reviewCard: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '16px 18px',
  },
};
