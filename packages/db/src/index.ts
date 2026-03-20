export { createSupabaseClient } from "./client.js";

export { createSession, getSession, updateSession, markSessionEnded } from "./sessions.js";

export {
  createMessage,
  getMessagesBySession,
} from "./messages.js";

export { createSessionFeedback, getSessionFeedback } from "./session-feedback.js";

export { createSessionEvaluation, getSessionEvaluation } from "./session-evaluations.js";

export { createDisclaimerAcceptance, linkDisclaimerAcceptance } from "./disclaimer-acceptances.js";

export type {
  DbSession,
  DbMessage,
  DbSessionInsert,
  DbMessageInsert,
  DbSessionUpdate,
  DbDisclaimerAcceptance,
  DbDisclaimerAcceptanceInsert,
  DbSessionFeedback,
  DbSessionFeedbackInsert,
  DbSessionEvaluation,
  DbSessionEvaluationInsert,
} from "./types.js";
