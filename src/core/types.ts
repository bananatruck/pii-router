/**
 * Shared contracts for PII Router. See docs/SPEC.md sections 3 to 6.
 *
 * Every model call in the app goes through ModelClient. There are three implementations:
 * FirebaseOnDeviceModel (src/models/firebase-on-device.ts), FirebaseCloudModel
 * (src/models/firebase-cloud.ts) and FakeModel (src/core/fake-model.ts).
 */

/** Where a model is meant to run. */
export type ModelLocation = 'device' | 'cloud';

/** Readiness of a model, as far as the app can tell without sending any user text. */
export type ModelStatus =
  | { state: 'ready' }
  /** The on-device model exists for this browser but must be downloaded first (needs a user gesture). */
  | { state: 'needs-download' }
  | { state: 'downloading'; fraction?: number }
  | { state: 'unavailable'; reason: string };

/** A JSON schema object, passed as-is to the SDK's structured output options. */
export type JsonSchema = Record<string, unknown>;

export interface GenerateRequest {
  /**
   * The complete prompt text. For a cloud model this string is exactly the outbound payload:
   * implementations must send it unchanged and must not add any other user-derived text.
   */
  prompt: string;
  /** Optional structured-output schema. */
  responseSchema?: JsonSchema;
}

export interface GenerateResult {
  text: string;
  /**
   * Where the inference actually ran, as reported by the SDK (`response.inferenceSource`),
   * or 'simulated' for the fake model.
   */
  ranOn: 'device' | 'cloud' | 'simulated';
}

export interface ModelClient {
  readonly location: ModelLocation;
  /** True only for FakeModel. The UI must label every simulated result. */
  readonly simulated: boolean;
  /** Human-readable name, shown in the UI. */
  readonly label: string;
  status(): Promise<ModelStatus>;
  /**
   * Prepare the model. For the on-device model this calls `initializeDeviceModel()`, which the
   * docs say must run on or after a user interaction. Cloud and fake models resolve at once.
   */
  prepare(onProgress?: (fraction: number) => void): Promise<void>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

/** Kinds of personal data the app knows about. */
export type PiiType =
  | 'EMAIL'
  | 'PHONE'
  | 'CARD'
  | 'IBAN'
  | 'SSN'
  | 'IP'
  | 'PERSON'
  | 'ADDRESS'
  | 'ID'
  | 'OTHER';

/** Which detector found a value. */
export type DetectorSource = 'pattern' | 'device-model';

/** One detected value, located in a specific input segment. */
export interface Finding {
  type: PiiType;
  /** The exact substring found. */
  value: string;
  /** Which input segment it was found in ('text' or 'instruction'). */
  segment: SegmentId;
  start: number;
  end: number;
  source: DetectorSource;
  /** The placeholder that replaced it, for example "[EMAIL_1]". Equal values share one placeholder. */
  placeholder: string;
}

export type SegmentId = 'text' | 'instruction';

export type TaskId = 'summarize' | 'rewrite' | 'reply' | 'custom';

export type RoutePreference = 'auto' | 'device' | 'cloud';

export type Route = 'device-only' | 'cloud-redacted';

export interface RunInput {
  text: string;
  task: TaskId;
  /** Only used when task is 'custom'. It is user input and is redacted like the text. */
  customInstruction?: string;
  preference: RoutePreference;
}

export type BlockReason =
  | 'detector-unavailable'
  | 'detector-failed'
  | 'detector-bad-output'
  | 'detector-wrong-source'
  | 'device-answer-unavailable'
  | 'device-answer-failed'
  | 'device-answer-wrong-source'
  | 'egress-guard'
  | 'empty-input';

/** A step in the run, for the live "what stayed / what left" view. */
export interface TraceStep {
  id:
    | 'patterns'
    | 'device-detector'
    | 'redact'
    | 'route'
    | 'egress-guard'
    | 'cloud-call'
    | 'device-answer'
    | 'restore';
  ranOn: 'device' | 'cloud' | 'simulated-device' | 'simulated-cloud';
  ok: boolean;
  /** Short, safe description. Must never contain raw input, vault values or the payload. */
  note: string;
  ms: number;
}

export interface Trace {
  steps: TraceStep[];
  findings: Finding[];
  /** The text segment with every finding replaced by its placeholder. */
  redactedText: string;
  /** The exact string passed to the cloud model's generate(), or null if nothing was sent. */
  outboundPayload: string | null;
  /** The cloud model's raw answer, still with placeholders, or null. */
  cloudReply: string | null;
}

export type RunOutcome =
  | {
      kind: 'answered';
      route: Route;
      /** The final answer shown to the user, with original values restored on the device. */
      answer: string;
      /** Placeholders that appeared in the cloud reply but could not be matched, and vault placeholders the reply never used. */
      unresolvedPlaceholders: string[];
      simulated: boolean;
      trace: Trace;
    }
  | {
      kind: 'blocked';
      reason: BlockReason;
      /** Plain-language explanation for the user. Must never contain raw input or vault values. */
      message: string;
      simulated: boolean;
      trace: Trace;
    }
  | {
      kind: 'error';
      /** Safe message (cloud call failed and similar). Must never contain raw input, vault values or the payload. */
      message: string;
      simulated: boolean;
      trace: Trace;
    };

export interface RouterDeps {
  device: ModelClient;
  cloud: ModelClient | null;
  /** Clock for step timings; injectable for tests. */
  now?: () => number;
}
