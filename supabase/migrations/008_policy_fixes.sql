BEGIN;

-- profiles_select_own
ALTER POLICY "profiles_select_own" ON public.profiles
  USING ((SELECT auth.uid()) = user_id);

-- profiles_update_own
ALTER POLICY "profiles_update_own" ON public.profiles
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- sessions_insert_own
ALTER POLICY "sessions_insert_own" ON public.sessions
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- sessions_select_own
ALTER POLICY "sessions_select_own" ON public.sessions
  USING ((SELECT auth.uid()) = user_id);

-- sessions_update_own
ALTER POLICY "sessions_update_own" ON public.sessions
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- messages_select_own
ALTER POLICY "messages_select_own" ON public.messages
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE (s.id = messages.session_id)
        AND (s.user_id = (SELECT auth.uid()))
    )
  );

-- session_feedback_select_own
ALTER POLICY "session_feedback_select_own" ON public.session_feedback
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE (s.id = session_feedback.session_id)
        AND (s.user_id = (SELECT auth.uid()))
    )
  );

-- session_evaluations_select_own
ALTER POLICY "session_evaluations_select_own" ON public.session_evaluations
  USING (
    EXISTS (
      SELECT 1
      FROM public.sessions s
      WHERE (s.id = session_evaluations.session_id)
        AND (s.user_id = (SELECT auth.uid()))
    )
  );

COMMIT;
