/**
 * Deterministic stand-in answers for the simulated cloud model.
 *
 * They are built only from the redacted prompt, keep every placeholder in order, and read like a
 * plausible answer so the restore step is visible on real sentences. They are never shown as
 * model output: the UI labels everything from FakeModel as simulated.
 */
import { PLACEHOLDER_SOURCE } from './redact';

const TEXT_MARKER = '\nText:\n';
const INSTRUCTION_MARKER = '\nInstruction:\n';

type CloudTask = 'rewrite' | 'reply' | 'other';

/** The task named on the prompt's header line, never inferred from the user's own text. */
function taskOf(prompt: string): CloudTask {
  const header = prompt.slice(0, prompt.indexOf(TEXT_MARKER) === -1 ? prompt.length : prompt.indexOf(TEXT_MARKER));
  const task = /^Task: (.*)$/m.exec(header)?.[1] ?? '';
  if (task.startsWith('Rewrite')) return 'rewrite';
  if (task.startsWith('Draft a reply')) return 'reply';
  return 'other';
}

function textSection(prompt: string): string {
  const at = prompt.indexOf(TEXT_MARKER);
  return at === -1 ? prompt : prompt.slice(at + TEXT_MARKER.length);
}

function instructionSection(prompt: string): string {
  const start = prompt.indexOf(INSTRUCTION_MARKER);
  const end = prompt.indexOf(TEXT_MARKER);
  return start === -1 || end === -1 || end < start ? '' : prompt.slice(start + INSTRUCTION_MARKER.length, end);
}

function placeholdersIn(text: string): Array<{ token: string; type: string }> {
  return [...text.matchAll(new RegExp(PLACEHOLDER_SOURCE, 'gi'))].map(m => ({
    token: m[0],
    type: (m[1] ?? '').toUpperCase(),
  }));
}

/** Sentences end at . ! or ? followed by whitespace, so dots inside emails and numbers do not split. */
export function sentences(text: string): string[] {
  return text.trim().split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function rewrite(text: string): string {
  const body = capitalise(
    text
      .trim()
      .replace(/^(?:hi|hello|hey|dear)\b[^,\n]*,\s*/i, '')
      .replace(/\bI'd\b/g, 'I would')
      .replace(/\bThanks,/g, 'Thank you,'),
  );
  const signer = placeholdersIn(text).find(p => p.type === 'PERSON');
  return `Hello,\n\n${body}\n\nKind regards,${signer ? `\n${signer.token}` : ''}`;
}

function replySentence(token: string, type: string): string {
  switch (type) {
    case 'PERSON':
      return `Your message concerns ${token}.`;
    case 'EMAIL':
      return `I will reply to ${token}.`;
    case 'PHONE':
      return `I can call you on ${token}.`;
    case 'CARD':
      return `I will follow up regarding the card ending in your ${token} details.`;
    case 'IBAN':
      return `I will follow up regarding your bank account ${token}.`;
    case 'SSN':
      return `I will follow up regarding your identification ${token}.`;
    default:
      return `I have noted ${token}.`;
  }
}

function reply(text: string): string {
  const found = placeholdersIn(text);
  const person = found.find(p => p.type === 'PERSON');
  const details = found.map(p => replySentence(p.token, p.type));
  const body = ['Thank you for getting in touch. I have noted the details you sent.', ...details].join(' ');
  return `Dear ${person ? person.token : 'customer'},\n\n${body}\n\nKind regards, Support team`;
}

function summary(text: string, instruction: string): string {
  const [first = text.trim(), ...rest] = sentences(text);
  const later = [...placeholdersIn(rest.join(' ')), ...placeholdersIn(instruction)].map(p => p.token);
  return `Summary: ${first}${later.length > 0 ? `\n\nAdditional details: ${later.join(', ')}.` : ''}`;
}

export function simulatedCloudReply(prompt: string): string {
  const text = textSection(prompt);
  switch (taskOf(prompt)) {
    case 'rewrite':
      return rewrite(text);
    case 'reply':
      return reply(text);
    default:
      return summary(text, instructionSection(prompt));
  }
}
