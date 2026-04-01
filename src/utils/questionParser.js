// src/utils/questionParser.js
// ─────────────────────────────────────────────────────────────────────
// Intelligently parses bulk-pasted exam questions in multiple formats:
//
// FORMAT A (numbered, lettered options):
//   1. Question text?
//   A. Option 1
//   B. Option 2
//   C. Option 3
//   D. Option 4
//   Answer: C
//   Explanation: Some explanation...
//
// FORMAT B (Q: prefix):
//   Q: Question text?
//   a) Option 1   b) Option 2   c) Option 3   d) Option 4
//   Ans: b
//
// FORMAT C (plain numbered):
//   1) Question
//   (A) Option   (B) Option   (C) Option   (D) Option
//   Correct: A
// ─────────────────────────────────────────────────────────────────────

export function parseQuestionsFromText(rawText) {
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const questions = [];
  let current = null;

  const optionLetters = ['a', 'b', 'c', 'd', 'e'];

  const isQuestionLine = (line) =>
    /^(\d+[\.\)]\s|Q[:\.]\s|Question\s*\d+[:\.]\s)/i.test(line);

  const isOptionLine = (line) =>
    /^([A-Ea-e][\.\):]|\([A-Ea-e]\))\s+.+/.test(line);

  const isAnswerLine = (line) =>
    /^(answer|ans|correct\s*answer|key|correct)[\s:\.]+/i.test(line);

  const isExplanationLine = (line) =>
    /^(explanation|explain|rationale|reason|note)[\s:\.]+/i.test(line);

  const extractOptionLetter = (line) => {
    const m = line.match(/^([A-Ea-e])[\.\):]|\(([A-Ea-e])\)/i);
    return m ? (m[1] || m[2]).toLowerCase() : null;
  };

  const extractOptionText = (line) => {
    return line.replace(/^([A-Ea-e][\.\):]|\([A-Ea-e]\))\s*/i, '').trim();
  };

  const extractAnswerLetter = (line) => {
    const cleaned = line.replace(/^(answer|ans|correct\s*answer|key|correct)[\s:\.]+/i, '').trim();
    const m = cleaned.match(/^([A-Ea-e])/i);
    return m ? m[1].toLowerCase() : null;
  };

  const saveCurrentQuestion = () => {
    if (!current) return;
    if (current.question && current.options.length >= 2) {
      const correctIdx = optionLetters.indexOf(current.answerLetter);
      questions.push({
        question:     current.question,
        options:      current.options,
        correctIndex: correctIdx >= 0 ? correctIdx : 0,
        explanation:  current.explanation || '',
        _raw:         true,
      });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isQuestionLine(line)) {
      saveCurrentQuestion();
      const questionText = line
        .replace(/^(\d+[\.\)]\s|Q[:\.]\s|Question\s*\d+[:\.]\s)/i, '')
        .trim();
      current = { question: questionText, options: [], answerLetter: null, explanation: '' };
      continue;
    }

    if (!current) continue;

    // Append continuation to question if no options yet
    if (!isOptionLine(line) && !isAnswerLine(line) && !isExplanationLine(line) && current.options.length === 0) {
      if (!isQuestionLine(line)) {
        current.question += ' ' + line;
      }
      continue;
    }

    if (isOptionLine(line)) {
      const letter = extractOptionLetter(line);
      const text   = extractOptionText(line);
      if (letter && text) {
        current.options.push(text);
      }
      continue;
    }

    if (isAnswerLine(line)) {
      current.answerLetter = extractAnswerLetter(line);
      continue;
    }

    if (isExplanationLine(line)) {
      current.explanation = line.replace(/^(explanation|explain|rationale|reason|note)[\s:\.]+/i, '').trim();
      // Collect multi-line explanation
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (isQuestionLine(next) || isOptionLine(next) || isAnswerLine(next)) break;
        current.explanation += ' ' + next;
        i++;
      }
      continue;
    }
  }

  // Don't forget the last question
  saveCurrentQuestion();

  return questions;
}

export function validateQuestion(q) {
  const errors = [];
  if (!q.question || q.question.trim().length < 10) {
    errors.push('Question text is too short or missing.');
  }
  if (!q.options || q.options.length < 2) {
    errors.push('At least 2 options are required.');
  }
  if (q.correctIndex === undefined || q.correctIndex < 0) {
    errors.push('Correct answer is not specified.');
  }
  if (q.options && q.correctIndex >= q.options.length) {
    errors.push('Correct index exceeds number of options.');
  }
  return errors;
}

export function formatQuestionForFirestore(q, meta = {}) {
  return {
    question:     q.question.trim(),
    options:      q.options.map(o => o.trim()),
    correctIndex: q.correctIndex,
    explanation:  q.explanation?.trim() || '',
    category:     meta.category     || 'general_nursing',
    examType:     meta.examType     || 'past_questions',
    year:         meta.year         || '2024',
    subject:      meta.subject      || '',
    difficulty:   meta.difficulty   || 'medium',
    tags:         meta.tags         || [],
    source:       meta.source       || '',
    active:       true,
    createdAt:    new Date().toISOString(),
  };
}
