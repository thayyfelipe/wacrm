-- Contact deletion is reserved for account admins and owners.
DROP POLICY IF EXISTS contacts_delete ON public.contacts;
CREATE POLICY contacts_delete ON public.contacts FOR DELETE TO authenticated
  USING (is_account_member(account_id, 'admin'));
