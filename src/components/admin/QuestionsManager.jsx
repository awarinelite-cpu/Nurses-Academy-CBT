// src/components/admin/QuestionsManager.jsx
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection, addDoc, getDocs, deleteDoc, doc, updateDoc,
  query, where, orderBy, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { NURSING_CATEGORIES, EXAM_TYPES, EXAM_YEARS, DIFFICULTY_LEVELS, DEFAULT_NURSING_COURSES } from '../../data/categories';
import {
  parseQuestionsFromText,
  parseAnswerKey,
  validateQuestion,
  formatQuestionForFirestore,
  shuffleAllQuestionsOptions,
} from '../../utils/questionParser';
import { useToast } from '../shared/Toast';

export default function QuestionsManager() {
  const { toast }    = useToast();
  const [urlParams]  = useSearchParams();
  const defaultTab   = urlParams.get('action') === 'bulk' ? 'bulk_upload'
                     : urlParams.get('action') === 'add'  ? 'add_single' : 'list';

  const [tab,       setTab]       = useState(defaultTab);
  const [questions, setQuestions] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(new Set());

  // Filters
  const [filterCat,  setFilterCat]  = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(0);
  const PAGE_SIZE = 20;

  // Single add form
  const BLANK = {
    question: '', options: ['', '', '', ''], correctIndex: 0,
    explanation: '', category: 'general_nursing', examType: 'past_questions',
    year: '2024', subject: '', difficulty: 'medium', source: '', tags: '',
    topic: '', course: '',
  };
  const [form, setForm] = useState({ ...BLANK });

  // Bulk paste
  const [bulkText,   setBulkText]   = useState('');
  const [answerText, setAnswerText] = useState('');
  const [shuffleEnabled, setShuffleEnabled] = useState(true);
  const [bulkMeta,   setBulkMeta]   = useState({
    category: 'general_nursing', examType: 'past_questions',
    year: '2024', subject: '', difficulty: 'medium', source: '',
    topic: '', course: '',
  });
  const [parsedQs,  setParsedQs]  = useState([]);
  const [parseErr,  setParseErr]  = useState('');
  const [parseInfo, setParseInfo] = useState('');

  // ── Load questions ──────────────────────────────────────────────
  const loadQuestions = async () => {
    setLoading(true);
    try {
      let q = query(collection(db, 'questions'), orderBy('createdAt', 'desc'));
      if (filterCat)  q = query(q, where('category', '==', filterCat));
      if (filterType) q = query(q, where('examType', '==', filterType));
      if (filterYear) q = query(q, where('year',     '==', filterYear));
      const snap = await getDocs(q);
      let qs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (search) qs = qs.filter(q => q.question?.toLowerCase().includes(search.toLowerCase()));
      setQuestions(qs);
      setPage(0);
    } catch (e) { toast('Failed to load: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (tab === 'list') loadQuestions(); }, [tab, filterCat, filterType, filterYear]);

  // ── Single add ──────────────────────────────────────────────────
  const handleSingleAdd = async (e) => {
    e.preventDefault();
    const q = { ...form, options: form.options.filter(o => o.trim()), tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) };
    const errs = validateQuestion(q);
    if (errs.length) { toast(errs[0], 'error'); return; }
    setLoading(true);
    try {
      if (form.id) {
        await updateDoc(doc(db, 'questions', form.id), { ...formatQuestionForFirestore(q, q), updatedAt: serverTimestamp() });
        toast('Question updated!', 'success');
      } else {
        await addDoc(collection(db, 'questions'), { ...formatQuestionForFirestore(q, q), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        toast('Question saved!', 'success');
      }
      setForm({ ...BLANK });
    } catch (e) { toast('Error: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  // ── Bulk parse ──────────────────────────────────────────────────
  const handleParse = () => {
    setParseErr(''); setParseInfo('');
    if (!bulkText.trim()) { setParseErr('Paste questions first.'); return; }

    let parsed = parseQuestionsFromText(bulkText, answerText);
    if (parsed.length === 0) { setParseErr('Could not parse questions. Check the format guide below.'); return; }

    // Shuffle options so correct answers spread across A/B/C/D
    if (shuffleEnabled) {
      parsed = shuffleAllQuestionsOptions(parsed);
    }

    const withAnswer    = parsed.filter(q => q._hasAnswer || q.correctIndex >= 0).length;
    const withoutAnswer = parsed.length - withAnswer;
    setParsedQs(parsed);

    let info = `Parsed ${parsed.length} questions.`;
    if (shuffleEnabled) info += ' 🔀 Options shuffled — correct answers spread across A/B/C/D.';
    if (withoutAnswer > 0) info += ` ⚠️ ${withoutAnswer} have no answer — paste answer key or set manually.`;
    setParseInfo(info);
    toast(`${parsed.length} questions parsed!`, 'success');
  };

  const handleBulkUpload = async () => {
    if (parsedQs.length === 0) { toast('Nothing to upload.', 'error'); return; }
    setLoading(true);
    try {
      const batchSize = 500;
      for (let i = 0; i < parsedQs.length; i += batchSize) {
        const batch = writeBatch(db);
        parsedQs.slice(i, i + batchSize).forEach(q => {
          const ref  = doc(collection(db, 'questions'));
          const data = formatQuestionForFirestore(q, bulkMeta);
          batch.set(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        });
        await batch.commit();
      }
      toast(`✅ ${parsedQs.length} questions uploaded!`, 'success');
      setParsedQs([]); setBulkText(''); setAnswerText(''); setParseInfo('');
    } catch (e) { toast('Upload failed: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  // ── Delete ──────────────────────────────────────────────────────
  const deleteQuestion = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      await deleteDoc(doc(db, 'questions', id));
      setQuestions(prev => prev.filter(q => q.id !== id));
      toast('Deleted.', 'success');
    } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} questions?`)) return;
    try {
      const batch = writeBatch(db);
      selected.forEach(id => batch.delete(doc(db, 'questions', id)));
      await batch.commit();
      setQuestions(prev => prev.filter(q => !selected.has(q.id)));
      setSelected(new Set());
      toast(`${selected.size} deleted.`, 'success');
    } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
  };

  const toggleSelect = (id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => {
    const pageQs = questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const allSel = pageQs.every(q => selected.has(q.id));
    const n = new Set(selected);
    pageQs.forEach(q => allSel ? n.delete(q.id) : n.add(q.id));
    setSelected(n);
  };

  const pageQs     = questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(questions.length / PAGE_SIZE);

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", margin: 0 }}>❓ Questions Manager</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '4px 0 0' }}>{questions.length.toLocaleString()} questions</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setTab('add_single')}>➕ Add Single</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setTab('bulk_upload')}>📤 Bulk Upload</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={styles.tabBar}>
        {[['list','📋 All Questions'],['add_single','➕ Add Single'],['bulk_upload','📤 Bulk Paste']].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ ...styles.tabBtn, background: tab === t ? 'var(--teal)' : 'transparent', color: tab === t ? '#fff' : 'var(--text-muted)' }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <>
          <div style={styles.filterBar}>
            <input className="form-input" placeholder="🔍 Search…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ maxWidth: 240 }} />
            <select className="form-input form-select" value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ maxWidth: 200 }}>
              <option value="">All Categories</option>
              {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.shortLabel}</option>)}
            </select>
            <select className="form-input form-select" value={filterType} onChange={e => setFilterType(e.target.value)} style={{ maxWidth: 180 }}>
              <option value="">All Types</option>
              {EXAM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select className="form-input form-select" value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ maxWidth: 110 }}>
              <option value="">All Years</option>
              {EXAM_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={loadQuestions}>🔄</button>
            {selected.size > 0 && (
              <button className="btn btn-danger btn-sm" onClick={deleteSelected}>🗑️ Delete {selected.size}</button>
            )}
          </div>

          {loading ? <div className="flex-center" style={{ padding: 40 }}><div className="spinner" /></div> : (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th><input type="checkbox" onChange={toggleAll} checked={pageQs.length > 0 && pageQs.every(q => selected.has(q.id))} /></th>
                      <th>#</th><th>Question</th><th>Category</th><th>Type</th><th>Topic / Course</th><th>Year</th><th>Diff.</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageQs.map((q, i) => {
                      const cat = NURSING_CATEGORIES.find(c => c.id === q.category);
                      return (
                        <tr key={q.id}>
                          <td><input type="checkbox" checked={selected.has(q.id)} onChange={() => toggleSelect(q.id)} /></td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{page * PAGE_SIZE + i + 1}</td>
                          <td style={{ maxWidth: 340 }}>
                            <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{q.question}</div>
                            {q.subject && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{q.subject}</div>}
                          </td>
                          <td><span style={{ fontSize: 15 }}>{cat?.icon}</span> <span style={{ fontSize: 12 }}>{cat?.shortLabel}</span></td>
                          <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{q.examType}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {q.topic ? <span>🎯 {q.topic}</span> : q.course ? <span>📖 {DEFAULT_NURSING_COURSES.find(c=>c.id===q.course)?.label || q.course}</span> : '—'}
                          </td>
                          <td style={{ fontSize: 13 }}>{q.year || '—'}</td>
                          <td><span className={`badge ${q.difficulty === 'easy' ? 'badge-green' : q.difficulty === 'hard' ? 'badge-red' : 'badge-gold'}`} style={{ fontSize: 10 }}>{q.difficulty}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setForm({ ...BLANK, ...q, tags: (q.tags||[]).join(', ') }); setTab('add_single'); }}>✏️</button>
                              <button className="btn btn-danger btn-sm" onClick={() => deleteQuestion(q.id)}>🗑️</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0}>← Prev</button>
                  <span style={{ fontSize: 14 }}>Page {page+1} of {totalPages}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1}>Next →</button>
                </div>
              )}
              {questions.length === 0 && <div style={{ textAlign:'center', padding: 40, color:'var(--text-muted)' }}>No questions yet. Upload some!</div>}
            </>
          )}
        </>
      )}

      {/* ── ADD SINGLE TAB ── */}
      {tab === 'add_single' && (
        <div style={{ maxWidth: 760 }}>
          <h3 style={{ fontFamily:"'Playfair Display',serif", marginBottom: 20 }}>{form.id ? '✏️ Edit' : '➕ Add'} Question</h3>
          <form onSubmit={handleSingleAdd} style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div style={styles.metaGrid}>
              <div className="form-group">
                <label className="form-label">Category *</label>
                <select className="form-input form-select" value={form.category} onChange={e => setForm(f=>({...f,category:e.target.value}))}>
                  {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.shortLabel}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Exam Type *</label>
                <select className="form-input form-select" value={form.examType} onChange={e => setForm(f=>({...f,examType:e.target.value}))}>
                  {EXAM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              {!['topic_drill','course_drill'].includes(form.examType) && (
                <div className="form-group">
                  <label className="form-label">Year</label>
                  <select className="form-input form-select" value={form.year} onChange={e => setForm(f=>({...f,year:e.target.value}))}>
                    {EXAM_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Difficulty</label>
                <select className="form-input form-select" value={form.difficulty} onChange={e => setForm(f=>({...f,difficulty:e.target.value}))}>
                  {DIFFICULTY_LEVELS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
              {!['topic_drill','course_drill'].includes(form.examType) && (
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <input className="form-input" placeholder="e.g. Pharmacology" value={form.subject} onChange={e => setForm(f=>({...f,subject:e.target.value}))} />
                </div>
              )}
              {!['topic_drill','course_drill'].includes(form.examType) && (
                <div className="form-group">
                  <label className="form-label">Source</label>
                  <input className="form-input" placeholder="e.g. NMCN 2023" value={form.source} onChange={e => setForm(f=>({...f,source:e.target.value}))} />
                </div>
              )}
              {form.examType === 'topic_drill' && (
                <div className="form-group">
                  <label className="form-label">Topic *</label>
                  <input className="form-input" placeholder="e.g. Cardiac Arrhythmias" value={form.topic} onChange={e => setForm(f=>({...f,topic:e.target.value}))} />
                </div>
              )}
              {form.examType === 'course_drill' && (
                <div className="form-group">
                  <label className="form-label">Course *</label>
                  <select className="form-input form-select" value={form.course} onChange={e => setForm(f=>({...f,course:e.target.value}))}>
                    <option value="">— Select Course —</option>
                    {DEFAULT_NURSING_COURSES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Question Text *</label>
              <textarea className="form-input" rows={4} placeholder="Type the full question here…"
                value={form.question} onChange={e => setForm(f=>({...f,question:e.target.value}))} required style={{ resize:'vertical' }} />
            </div>

            <div>
              <label className="form-label">Options * — select the correct answer with the radio button</label>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:8 }}>
                {form.options.map((opt, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <input type="radio" name="correct" checked={form.correctIndex===i}
                      onChange={() => setForm(f=>({...f,correctIndex:i}))}
                      style={{ cursor:'pointer', width:18, height:18 }} />
                    <div style={{
                      width:30, height:30, borderRadius:'50%', flexShrink:0,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontWeight:700, fontSize:13,
                      background: form.correctIndex===i ? 'var(--teal)' : 'var(--bg-secondary)',
                      color: form.correctIndex===i ? '#fff' : 'var(--text-muted)',
                      border: `2px solid ${form.correctIndex===i ? 'var(--teal)' : 'var(--border)'}`,
                    }}>
                      {String.fromCharCode(65+i)}
                    </div>
                    <input className="form-input" placeholder={`Option ${String.fromCharCode(65+i)}`}
                      value={opt} onChange={e => {
                        const opts=[...form.options]; opts[i]=e.target.value;
                        setForm(f=>({...f,options:opts}));
                      }} style={{ flex:1 }} />
                    {form.options.length > 2 && (
                      <button type="button" onClick={() => {
                        const opts = form.options.filter((_,j)=>j!==i);
                        setForm(f=>({...f,options:opts,correctIndex:Math.min(f.correctIndex,opts.length-1)}));
                      }} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:18 }}>×</button>
                    )}
                  </div>
                ))}
              </div>
              {form.options.length < 5 && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop:8 }}
                  onClick={() => setForm(f=>({...f,options:[...f.options,'']}))}>+ Add Option</button>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Explanation</label>
              <textarea className="form-input" rows={3} placeholder="Why is this the correct answer?"
                value={form.explanation} onChange={e => setForm(f=>({...f,explanation:e.target.value}))} style={{ resize:'vertical' }} />
            </div>

            <div className="form-group">
              <label className="form-label">Tags (comma-separated)</label>
              <input className="form-input" placeholder="pharmacology, cardiac" value={form.tags}
                onChange={e => setForm(f=>({...f,tags:e.target.value}))} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <><span className="spinner spinner-sm" /> Saving…</> : (form.id ? '💾 Update' : '✅ Save Question')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setForm({...BLANK})}>🔄 Reset</button>
              <button type="button" className="btn btn-ghost" onClick={() => setTab('list')}>← Back</button>
            </div>
          </form>
        </div>
      )}

      {/* ── BULK UPLOAD TAB ── */}
      {tab === 'bulk_upload' && (
        <div style={{ maxWidth: 960 }}>
          <h3 style={{ fontFamily:"'Playfair Display',serif", marginBottom:6 }}>📤 Bulk Question Upload</h3>
          <p style={{ color:'var(--text-muted)', fontSize:13, marginBottom:20 }}>
            Paste questions in the first box. If answers are separate (e.g. answer booklet), paste them in the second box — the system will automatically match them.
          </p>

          {/* Bulk meta */}
          <div className="card" style={{ marginBottom:20 }}>
            <div style={{ fontWeight:700, marginBottom:14 }}>Apply to all questions:</div>
            <div style={styles.metaGrid}>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-input form-select" value={bulkMeta.category} onChange={e => setBulkMeta(m=>({...m,category:e.target.value}))}>
                  {NURSING_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.shortLabel}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Exam Type</label>
                <select className="form-input form-select" value={bulkMeta.examType} onChange={e => setBulkMeta(m=>({...m,examType:e.target.value}))}>
                  {EXAM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              {!['topic_drill','course_drill'].includes(bulkMeta.examType) && (
                <div className="form-group">
                  <label className="form-label">Year</label>
                  <select className="form-input form-select" value={bulkMeta.year} onChange={e => setBulkMeta(m=>({...m,year:e.target.value}))}>
                    {EXAM_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Difficulty</label>
                <select className="form-input form-select" value={bulkMeta.difficulty} onChange={e => setBulkMeta(m=>({...m,difficulty:e.target.value}))}>
                  {DIFFICULTY_LEVELS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </div>
              {!['topic_drill','course_drill'].includes(bulkMeta.examType) && (
                <div className="form-group">
                  <label className="form-label">Subject</label>
                  <input className="form-input" placeholder="e.g. Medical-Surgical" value={bulkMeta.subject} onChange={e => setBulkMeta(m=>({...m,subject:e.target.value}))} />
                </div>
              )}
              {!['topic_drill','course_drill'].includes(bulkMeta.examType) && (
                <div className="form-group">
                  <label className="form-label">Source</label>
                  <input className="form-input" placeholder="e.g. NMCN 2023" value={bulkMeta.source} onChange={e => setBulkMeta(m=>({...m,source:e.target.value}))} />
                </div>
              )}
              {bulkMeta.examType === 'topic_drill' && (
                <div className="form-group">
                  <label className="form-label">Topic *</label>
                  <input className="form-input" placeholder="e.g. Cardiac Arrhythmias" value={bulkMeta.topic} onChange={e => setBulkMeta(m=>({...m,topic:e.target.value}))} />
                </div>
              )}
              {bulkMeta.examType === 'course_drill' && (
                <div className="form-group">
                  <label className="form-label">Course *</label>
                  <select className="form-input form-select" value={bulkMeta.course} onChange={e => setBulkMeta(m=>({...m,course:e.target.value}))}>
                    <option value="">— Select Course —</option>
                    {DEFAULT_NURSING_COURSES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Shuffle toggle */}
            <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', userSelect:'none' }}>
                <div
                  onClick={() => setShuffleEnabled(s => !s)}
                  style={{
                    width:44, height:24, borderRadius:12, position:'relative', cursor:'pointer',
                    background: shuffleEnabled ? 'var(--teal)' : 'var(--border)',
                    transition:'background 0.2s',
                  }}
                >
                  <div style={{
                    position:'absolute', top:3, left: shuffleEnabled ? 23 : 3,
                    width:18, height:18, borderRadius:'50%', background:'#fff',
                    transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </div>
                <span style={{ fontWeight:600, fontSize:14 }}>
                  🔀 Shuffle answer positions
                </span>
              </label>
              <span style={{ fontSize:12, color:'var(--text-muted)' }}>
                {shuffleEnabled
                  ? 'ON — correct answers will be spread across A, B, C, D randomly'
                  : 'OFF — options stay in original order'}
              </span>
            </div>
          </div>

          {/* Format guide */}
          <div className="alert alert-info" style={{ marginBottom:16, fontSize:12 }}>
            <div style={{ lineHeight:1.9 }}>
              <strong>📋 Accepted formats — all work automatically:</strong>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12, marginTop:10 }}>
                {[
                  ['Standard (answer inline)', '1. Question?\nA. Option  B. Option  C. Option  D. Option\nAnswer: C'],
                  ['Options on separate lines', '1. Question?\nA) Option one\nB) Option two\nC) Option three\nD) Option four\nANS: B'],
                  ['Short 2-per-line options', '1. Question?\nA. Sympathy   C. Socialism\nB. Criticism  D. Empathy\nAnswer: D'],
                  ['Separate answer key box', 'Paste questions above with NO answers,\nthen paste answer key below:\n1. C\n2. A\n3. D\n4. B'],
                ].map(([title, example]) => (
                  <div key={title} style={{ background:'var(--bg-tertiary)', borderRadius:8, padding:'10px 12px' }}>
                    <div style={{ fontWeight:700, marginBottom:6, color:'var(--teal)', fontSize:12 }}>{title}</div>
                    <pre style={{ fontFamily:'monospace', fontSize:11, color:'var(--text-secondary)', margin:0, whiteSpace:'pre-wrap' }}>{example}</pre>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Two textareas side by side */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize:14, fontWeight:700 }}>
                📝 Questions
                <span style={{ color:'var(--text-muted)', fontWeight:400, fontSize:12, marginLeft:6 }}>
                  (paste all questions here)
                </span>
              </label>
              <textarea
                className="form-input" rows={16}
                placeholder={"1. What is the normal adult heart rate?\nA. 40-60 bpm\nB. 60-100 bpm\nC. 100-120 bpm\nD. 120-160 bpm\nAnswer: B\n\n2. Next question...\nA. Option\nB. Option\nC. Option\nD. Option"}
                value={bulkText}
                onChange={e => { setBulkText(e.target.value); setParsedQs([]); setParseInfo(''); }}
                style={{ fontFamily:'monospace', fontSize:12, resize:'vertical', minHeight:260 }}
              />
              <div className="form-hint">{bulkText ? `~${bulkText.split('\n').filter(l=>l.trim()).length} lines` : 'Supports 1000+ questions at once'}</div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize:14, fontWeight:700 }}>
                🔑 Answer Key
                <span style={{ color:'var(--text-muted)', fontWeight:400, fontSize:12, marginLeft:6 }}>
                  (optional — if answers are separate)
                </span>
              </label>
              <textarea
                className="form-input" rows={16}
                placeholder={"1. B\n2. C\n3. A\n4. D\n5. B\n...\n\nOR paste all on one line:\n1.B 2.C 3.A 4.D 5.B"}
                value={answerText}
                onChange={e => { setAnswerText(e.target.value); setParsedQs([]); setParseInfo(''); }}
                style={{ fontFamily:'monospace', fontSize:12, resize:'vertical', minHeight:260 }}
              />
              <div className="form-hint">
                {answerText
                  ? `${Object.keys(parseAnswerKey(answerText)).length} answers detected`
                  : 'Leave blank if answers are inside question text'}
              </div>
            </div>
          </div>

          {parseErr  && <div className="alert alert-error"  style={{ marginBottom:12 }}>⚠️ {parseErr}</div>}
          {parseInfo && <div className="alert alert-info"   style={{ marginBottom:12 }}>ℹ️ {parseInfo}</div>}

          <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap' }}>
            <button className="btn btn-secondary" onClick={handleParse} disabled={!bulkText.trim()}>
              🔍 Parse Questions
            </button>
            {parsedQs.length > 0 && (
              <button className="btn btn-primary" onClick={handleBulkUpload} disabled={loading}>
                {loading ? <><span className="spinner spinner-sm" /> Uploading…</> : `✅ Upload ${parsedQs.length} Questions`}
              </button>
            )}
            {(bulkText || answerText || parsedQs.length > 0) && (
              <button className="btn btn-ghost" onClick={() => { setParsedQs([]); setBulkText(''); setAnswerText(''); setParseInfo(''); setParseErr(''); }}>
                🗑️ Clear All
              </button>
            )}
          </div>

          {/* Parsed preview */}
          {parsedQs.length > 0 && (
            <div>
              <div style={{ fontWeight:700, marginBottom:12, color:'var(--teal)', fontSize:15 }}>
                ✅ {parsedQs.length} questions ready — review before uploading:
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10, maxHeight:600, overflowY:'auto', paddingRight:4 }}>
                {parsedQs.map((q, i) => (
                  <div key={i} style={{
                    ...styles.parsedCard,
                    borderLeft: `4px solid ${q._hasAnswer || q.correctIndex >= 0 ? 'var(--green)' : 'var(--gold)'}`,
                  }}>
                    <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                      <span style={{ fontWeight:700, color:'var(--teal)', flexShrink:0, fontSize:13 }}>Q{i+1}.</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:600, fontSize:14, marginBottom:8 }}>{q.question}</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                          {q.options.map((opt, j) => (
                            <div key={j} style={{
                              fontSize:13, padding:'4px 10px', borderRadius:6,
                              background: j===q.correctIndex ? 'rgba(22,163,74,0.12)' : 'var(--bg-tertiary)',
                              color: j===q.correctIndex ? 'var(--green)' : 'var(--text-secondary)',
                              fontWeight: j===q.correctIndex ? 700 : 400,
                              border: `1px solid ${j===q.correctIndex ? 'rgba(22,163,74,0.3)' : 'var(--border)'}`,
                            }}>
                              {String.fromCharCode(65+j)}. {typeof opt === 'string' ? opt : opt.text} {j===q.correctIndex && '✓'}
                            </div>
                          ))}
                        </div>
                        {!q._hasAnswer && q.correctIndex < 0 && (
                          <div style={{ fontSize:12, color:'var(--gold)', marginTop:6 }}>⚠️ No answer — will default to A. Fix in answer key or edit after upload.</div>
                        )}
                        {q.explanation && (
                          <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:6, fontStyle:'italic' }}>💡 {q.explanation}</div>
                        )}
                      </div>
                      <button className="btn btn-danger btn-sm" style={{ flexShrink:0 }}
                        onClick={() => setParsedQs(prev => prev.filter((_,j)=>j!==i))}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  tabBar: { display:'flex', gap:4, background:'var(--bg-tertiary)', border:'1px solid var(--border)', borderRadius:12, padding:4, marginBottom:24, width:'fit-content' },
  tabBtn: { padding:'8px 18px', borderRadius:9, border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:700, transition:'all 0.2s' },
  filterBar: { display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' },
  metaGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:14 },
  parsedCard: { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' },
};