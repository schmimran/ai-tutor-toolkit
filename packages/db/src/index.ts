export { createSupabaseClient, createSupabaseAnonClient } from "./client.js";

export { createSession, getSession, getSessionsByUser, updateSession, markSessionEnded, getUserEmailForSession } from "./sessions.js";

export {
  createMessage,
  getMessagesBySession,
} from "./messages.js";

export { createSessionFeedback, getSessionFeedback } from "./session-feedback.js";

export { createSessionEvaluation, upsertSessionEvaluation, getSessionEvaluation } from "./session-evaluations.js";

export { createDisclaimerAcceptance, linkDisclaimerAcceptance } from "./disclaimer-acceptances.js";

export { createProfile, getProfile, updateProfile } from "./profiles.js";
export type { DbProfile, DbProfileUpdate } from "./profiles.js";

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
