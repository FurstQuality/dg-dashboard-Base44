revoke all on function public.on_contribution_verification() from anon, authenticated;
revoke all on function public.on_course_report_vote() from anon, authenticated;
revoke all on function public.contribution_award_badges(uuid) from anon, authenticated;
revoke all on function public.contributions_set_points() from anon, authenticated;
revoke all on function public.contribution_balance(uuid) from anon;