export { createSupabaseClient, createSupabaseAnonClient } from "./client.js";

export {
  createSession,
  getSession,
  getSessionsByUser,
  updateSession,
  markSessionEnded,
  getUserEmailForSession,
  getUserInfoForSession,
  getUserProfileForSession,
  getFeedbackForSessions,
} from "./sessions.js";
export type { UserSessionInfo, UserSessionProfile } from "./sessions.js";

export {
  createMessage,
  getMessagesBySession,
} from "./messages.js";

export { createSessionFeedback, getSessionFeedback } from "./session-feedback.js";

export { createSessionEvaluation, upsertSessionEvaluation, getSessionEvaluation } from "./session-evaluations.js";

export {
  createEvaluationBatch,
  getEvaluationBatch,
  updateEvaluationBatch,
  listEvaluationBatches,
  getInFlightBatchedSessionIds,
} from "./evaluation-batches.js";
export type {
  DbEvaluationBatch,
  DbEvaluationBatchInsert,
  DbEvaluationBatchUpdate,
  EvaluationBatchStatus,
} from "./evaluation-batches.js";

export { getProfile } from "./profiles.js";
export type { DbProfile } from "./profiles.js";

export type {
  DbSession,
  DbMessage,
  DbSessionInsert,
  DbMessageInsert,
  DbSessionUpdate,
  DbSessionFeedback,
  DbSessionFeedbackInsert,
  DbSessionEvaluation,
  DbSessionEvaluationInsert,
} from "./types.js";
