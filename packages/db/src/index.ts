export { createSupabaseClient } from "./client.js";

export { createSession, getSession, updateSession, markSessionEnded, deleteSession } from "./sessions.js";

export {
  createMessage,
  getMessagesBySession,
  deleteMessagesBySession,
} from "./messages.js";

export { createFeedback, createFeedbackBatch, getFeedbackBySession } from "./feedback.js";

export { createDisclaimerAcceptance, linkDisclaimerAcceptance } from "./disclaimer-acceptances.js";

export type {
  DbSession,
  DbMessage,
  DbFeedback,
  DbSessionInsert,
  DbMessageInsert,
  DbFeedbackInsert,
  DbSessionUpdate,
  DbDisclaimerAcceptance,
  DbDisclaimerAcceptanceInsert,
} from "./types.js";
