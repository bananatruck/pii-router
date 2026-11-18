import { PLACEHOLDER_SOURCE } from './redact';
import type { GenerateRequest, GenerateResult, ModelClient, ModelLocation, ModelStatus } from './types';
export type FakeBehaviour = 'ok' | 'unavailable' | 'needs-download' | 'throws' | 'bad-json' | 'wrong-source';
export const DEMO_GIVEN_NAMES = [
  'Alice', 'Adam', 'Amelia', 'Andrew', 'Anna', 'Benjamin', 'Brian', 'Charlotte',
  'Chloe', 'Daniel', 'David', 'Edward', 'Elizabeth', 'Emily', 'Emma', 'Ethan',
  'Grace', 'Hannah', 'Henry', 'Isabella', 'Jack', 'James', 'Jane', 'Jessica',
  'John', 'Joseph', 'Julia', 'Liam', 'Lily', 'Lucas', 'Lucy', 'Mary', 'Matthew',
  'Michael', 'Noah', 'Olivia', 'Oscar', 'Robert', 'Sarah', 'Sophia', 'Thomas', 'William',
];
export class FakeModel implements ModelClient {
  readonly simulated = true;
  readonly location: ModelLocation;
  readonly label: string;
  private readonly behaviour: FakeBehaviour;
  private readonly latencyMs: number;
  constructor(options: { location: ModelLocation; behaviour?: FakeBehaviour; latencyMs?: number }) {
    this.location = options.location;
    this.behaviour = options.behaviour ?? 'ok';
    this.latencyMs = options.latencyMs ?? 0;
    this.label = options.location === 'device' ? 'Simulated on-device model' : 'Simulated cloud model';
  }
  async status(): Promise<ModelStatus> {
    if (this.behaviour === 'unavailable') return { state: 'unavailable', reason: 'Simulated unavailability.' };
    if (this.behaviour === 'needs-download') return { state: 'needs-download' };
    return { state: 'ready' };
  }
  async prepare(onProgress?: (fraction: number) => void): Promise<void> { onProgress?.(1); }
  async generate(request: GenerateRequest): Promise<GenerateResult> {
    if (this.latencyMs > 0) await new Promise(resolve => setTimeout(resolve, this.latencyMs));
    if (this.behaviour === 'throws') throw new Error('Simulated model failure.');
    if (this.behaviour === 'unavailable' || this.behaviour === 'needs-download') throw new Error('Simulated model not ready.');
    const ranOn = this.behaviour === 'wrong-source' ? this.location === 'device' ? 'cloud' : 'device' : 'simulated';
    let text: string;
    const content = request.prompt.slice(request.prompt.indexOf('\nText:\n') + '\nText:\n'.length);
    if (request.responseSchema) {
      const entities: Array<{ text: string; type: 'PERSON' | 'ADDRESS' }> = [];
      const names = new RegExp(`\\b(?:${DEMO_GIVEN_NAMES.join('|')}) [A-Z][a-z]+\\b`, 'g');
      for (const m of content.matchAll(names)) entities.push({ text: m[0], type: 'PERSON' });
      for (const m of content.matchAll(/\b\d{1,6} (?:[A-Z][a-z]+ ){1,5}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd)\b/g)) entities.push({ text: m[0], type: 'ADDRESS' });
      text = this.behaviour === 'bad-json' ? 'Invalid JSON' : JSON.stringify({ entities });
    } else if (this.location === 'device') {
      text = (content.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [content]).slice(0, 2).join('').trim();
    } else {
      const placeholders = [...new Set([...request.prompt.matchAll(new RegExp(PLACEHOLDER_SOURCE, 'gi'))].map(m => m[0]))];
      const prefix = request.prompt.includes('Task: Draft a reply') ? 'Thank you for your message. I will review the details for' : request.prompt.includes('Task: Rewrite') ? 'Please review the following details:' : 'The text concerns';
      text = `${prefix} ${placeholders.join(', ') || 'the requested matter'}.`;
    }
    return { text, ranOn };
  }
}
export class RecordingModel implements ModelClient {
  readonly requests: GenerateRequest[] = [];
  constructor(private readonly model: ModelClient) {}
  get location() { return this.model.location; }
  get simulated() { return this.model.simulated; }
  get label() { return this.model.label; }
  status(): Promise<ModelStatus> { return this.model.status(); }
  prepare(onProgress?: (fraction: number) => void): Promise<void> { return this.model.prepare(onProgress); }
  generate(request: GenerateRequest): Promise<GenerateResult> {
    this.requests.push(structuredClone(request));
    return this.model.generate(request);
  }
}
