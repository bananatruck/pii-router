import { expect, it } from 'vitest';
import { buildDetectorPrompt, ENTITY_SCHEMA, parseDetectorOutput } from './device-detector';
it.each(['not json', 'null', '[]', '{}', '{"entities":null}', '{"entities":[{"text":"Alice Example","type":"EMAIL"}]}', '{"entities":[],"extra":true}', '{"entities":[{"text":2,"type":"PERSON"}]}', '{"entities":[{"text":"Alice Example","type":"PERSON","extra":0}]}', '{"entities":[null]}', '{"entities":[{"text":"Alice Example"}]}'])('rejects non-schema detector response %s', raw => expect(parseDetectorOutput(raw)).toEqual({ ok: false }));
it('accepts only the entity schema and puts the supplied text in the detector prompt', () => {
  expect(parseDetectorOutput('{"entities":[{"text":"Alice Example","type":"PERSON"}]}')).toEqual({ ok: true, entities: [{ text: 'Alice Example', type: 'PERSON' }] });
  expect(parseDetectorOutput('{"entities":[]}')).toEqual({ ok: true, entities: [] });
  expect(ENTITY_SCHEMA.required).toEqual(['entities']);
  expect(buildDetectorPrompt('[EMAIL_1]')).toContain('Text:\n[EMAIL_1]');
});
