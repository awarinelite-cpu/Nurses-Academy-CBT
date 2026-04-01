// src/components/admin/ScheduledExamsManager.jsx
import { useState, useEffect } from 'react';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, orderBy, where, serverTimestamp, updateDoc
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES, DIFFICULTY_LEVELS } from '../../data/categories';
import { useToast } from '../shared/Toast';

const TYPES = [
  { id: 'daily_practice', label: '⚡ Daily Practice', color: '#0D9488' },
  { id: 'mock_exam',      label: '📝 Mock Exam',      color: '#7C3AED' },
];

const BLANK = {
  type: 'daily_practice',
  title: '',
  category: 'general_nursing',
  subject: '',
  questionCount: 20,
  timeLimit: 30,
  difficulty: 'medium',
  description: '',
  scheduledDate: new Date().toISOString().slice(0, 10),
  active: true,
};

export default function ScheduledExamsManager() {
  const { toast } = useToast();

  const [tab,      setTab]      = useState('list');     // 'list' | 'add'
  const [typeFilter, setTypeFilter] = useState('');
  const [exams,    setExams]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [form,     setForm]     = useState({ ...BLANK });
  const [editId,   setEditId]   = useState(null);

  // ── Load ────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      let q = query(collection(db, 'scheduledExams'), orderBy('createdAt', 'desc'));
      if (typeFilter) q = query(q, where('type', '==', typeFilter));
      const snap = await getDocs(q);
      setExams(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { toast('Failed to load: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (tab === 'list') load(); }, [tab, typeFilter]);

  // ── Save ────────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim())    { toast('Title is required.', 'error'); return; }
    if (!form.category)        { toast('Select a category.', 'error'); return; }
    if (form.questionCount < 1){ toast('Question count must be at least 1.', 'error'); return; }

    setLoading(true);
    try {
      const data = {
        type:          form.type,
        title:         form.title.trim(),
        category:      form.category,
        subject:       form.subject.trim(),
        questionCount: Number(form.questionCount),
        timeLimit:     Number(form.timeLimit),
        difficulty:    form.difficulty,
        description:   form.description.trim(),
        scheduledDate: form.scheduledDate,
        active:        form.active,
      };

      if (editId) {
        await updateDoc(doc(db, 'scheduledExams', editId), { ...data, updatedAt: serverTimestamp() });
        toast('Exam updated!', 'success');
      } else {
        await addDoc(collection(db, 'scheduledExams'), { ...data, createdAt: serverTimestamp() });
        toast('Exam created!', 'success');
      }

      setForm({ ...BLANK }); setEditId(null); setTab('list');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  const handleEdit = (exam) => {
    setForm({
      type:          exam.type          || 'daily_practice',
      title:         exam.title         || '',
      category:      exam.category      || 'general_nursing',
      subject:       exam.subject       || '',
      questionCount: exam.questionCount || 20,
      timeLimit:     exam.timeLimit     || 30,
      difficulty:    exam.difficulty    || 'medium',
      description:   exam.description   || '',
      scheduledDate: exam.scheduledDate || new Date().toISOString().slice(0, 10),
      active:        exam.active        !== false,
    });
    setEditId(exam.id);
    setTab('add');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this exam?')) return;
    try {
      await deleteDoc(doc(db, 'scheduledExams', id));
      setExams(prev => prev.filter(e => e.id !== id));
      toast('Deleted.', 'success');
    } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
  };

  const toggleActive = async (exam) => {
    try {
      await updateDoc(doc(db, 'scheduledExams', exam.id), { active: !exam.active });
      setExams(prev => prev.map(e => e.id === exam.id ? { ...e, active: !e.active } : e));
    } catch (e) { toast('Update failed: ' + e.message, 'error'); }
  };

  const typeInfo  = (t) => TYPES.find(x => x.id === t) || TYPES[0];
  const today     = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Playfair Display',serif", marginBottom: 4 }}>
          🗓️ Scheduled Exams Manager
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Create daily practice quizzes and mock exams. Students can take them anytime.
        </p>
      </div>

      {/* Tabs */}
      <div style={styles.tabBar}>
        {[
          { id: 'list', label: '📋 All Exams' },
          { id: 'add',  label: editId ? '✏️ Edit Exam' : '➕ Create New' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); if (t.id === 'list') { setForm({ ...BLANK }); setEditId(null); } }}
            style={{
              ...styles.tabBtn,
              background: tab === t.id ? 'var(--teal)' : 'transparent',
              color:      tab === t.id ? '#fff'        : 'var(--text-muted)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {tab === 'list' && (
        <div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="form-input form-select"
              style={{ maxWidth: 200, height: 38 }}
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              <option value="">All Types</option>
              {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" onClick={() => setTab('add')}>
              ➕ Create New
            </button>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
          ) : exams.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              No exams yet. Create your first one!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {exams.map(exam => {
                const ti    = typeInfo(exam.type);
                const cat   = NURSING_CATEGORIES.find(c => c.id === exam.category);
                const isToday = exam.scheduledDate === today;

                return (
                  <div key={exam.id} style={{
                    ...styles.card,
                    borderLeft: `4px solid ${ti.color}`,
                    opacity: exam.active ? 1 : 0.55,
                  }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: `${ti.color}18`, color: ti.color, border: `1px solid ${ti.color}40`,
                          }}>{ti.label}</span>
                          {isToday && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#0D948818', color: '#0D9488' }}>📅 Today</span>
                          )}
                          {!exam.active && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#64748B18', color: '#64748B' }}>Hidden</span>
                          )}
                          <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                            {exam.title}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                          <span style={styles.meta}>{cat?.shortLabel || exam.category}</span>
                          <span style={styles.meta}>❓ {exam.questionCount} Qs</span>
                          <span style={styles.meta}>⏱ {exam.timeLimit} mins</span>
                          <span style={styles.meta}>📅 {exam.scheduledDate}</span>
                          {exam.difficulty && <span style={styles.meta}>⚡ {exam.difficulty}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => toggleActive(exam)}
                          title={exam.active ? 'Hide from students' : 'Show to students'}
                        >
                          {exam.active ? '👁️' : '🙈'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(exam)}>
                          ✏️
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(exam.id)}>
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Create / Edit Form ── */}
      {tab === 'add' && (
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16, marginBottom: 20 }}>

            {/* Type */}
            <div className="form-group">
              <label className="form-label">Exam Type *</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {TYPES.map(t => (
                  <button
                    type="button" key={t.id}
                    onClick={() => setForm(f => ({ ...f, type: t.id }))}
                    style={{
                      flex: 1, padding: '10px 8px', border: '2px solid',
                      borderColor: form.type === t.id ? t.color : 'var(--border)',
                      background:  form.type === t.id ? `${t.color}18` : 'var(--bg-tertiary)',
                      color:       form.type === t.id ? t.color : 'var(--text-secondary)',
                      borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: 700, fontSize: 13, transition: 'all 0.2s',
                    }}
                  >{t.label}</button>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Title *</label>
              <input
                className="form-input"
                placeholder={form.type === 'daily_practice'
                  ? 'e.g. Daily Practice — General Nursing (April 1)'
                  : 'e.g. NMCN Mock Exam 2025 — Set A'}
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                required
              />
            </div>

            {/* Category */}
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select
                className="form-input form-select"
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              >
                {NURSING_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.shortLabel}</option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div className="form-group">
              <label className="form-label">Subject / Topic</label>
              <input
                className="form-input"
                placeholder="e.g. Pharmacology, Labour & Delivery"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              />
            </div>

            {/* Question Count */}
            <div className="form-group">
              <label className="form-label">Number of Questions *</label>
              <input
                className="form-input" type="number" min={1} max={300}
                value={form.questionCount}
                onChange={e => setForm(f => ({ ...f, questionCount: e.target.value }))}
              />
              <div className="form-hint">
                {form.type === 'daily_practice' ? 'Recommended: 10–30' : 'Recommended: 50–120'}
              </div>
            </div>

            {/* Time Limit */}
            <div className="form-group">
              <label className="form-label">Time Limit (minutes)</label>
              <input
                className="form-input" type="number" min={0} max={600}
                value={form.timeLimit}
                onChange={e => setForm(f => ({ ...f, timeLimit: e.target.value }))}
              />
              <div className="form-hint">Set to 0 for no timer</div>
            </div>

            {/* Difficulty */}
            <div className="form-group">
              <label className="form-label">Difficulty</label>
              <select
                className="form-input form-select"
                value={form.difficulty}
                onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
              >
                {DIFFICULTY_LEVELS.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Scheduled Date */}
            <div className="form-group">
              <label className="form-label">
                {form.type === 'daily_practice' ? 'Scheduled Date' : 'Publish Date'}
              </label>
              <input
                className="form-input" type="date"
                value={form.scheduledDate}
                onChange={e => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
              />
              <div className="form-hint">Students can take it any time after this date</div>
            </div>

            {/* Description */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Description (optional)</label>
              <textarea
                className="form-input" rows={3}
                placeholder="Brief description shown to students before they start…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* Active toggle */}
            <div className="form-group">
              <label className="form-label">Visibility</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div
                  onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: form.active ? 'var(--teal)' : 'var(--border)',
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3, left: form.active ? 22 : 3,
                    width: 18, height: 18, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>
                  {form.active ? 'Visible to students' : 'Hidden'}
                </span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading
                ? <><span className="spinner spinner-sm" /> Saving…</>
                : editId ? '💾 Update Exam' : '✅ Create Exam'}
            </button>
            <button
              type="button" className="btn btn-ghost"
              onClick={() => { setForm({ ...BLANK }); setEditId(null); setTab('list'); }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const styles = {
  tabBar: {
    display: 'flex', gap: 4,
    background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 4, marginBottom: 24, width: 'fit-content',
  },
  tabBtn: {
    padding: '8px 18px', borderRadius: 9, border: 'none',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 13,
    fontWeight: 700, transition: 'all 0.2s',
  },
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '14px 16px',
  },
  meta: { fontSize: 12, color: 'var(--text-muted)' },
};
