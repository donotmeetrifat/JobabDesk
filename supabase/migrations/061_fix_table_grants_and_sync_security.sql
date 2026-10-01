-- Migration 061: Ensure authenticated and service_role have explicit table permissions
-- for contacts, conversations, messages, accounts, and channel connections.

GRANT ALL ON TABLE public.contacts TO authenticated, service_role;
GRANT ALL ON TABLE public.conversations TO authenticated, service_role;
GRANT ALL ON TABLE public.messages TO authenticated, service_role;
GRANT ALL ON TABLE public.accounts TO authenticated, service_role;
GRANT ALL ON TABLE public.profiles TO authenticated, service_role;
GRANT ALL ON TABLE public.channel_connections TO authenticated, service_role;
GRANT ALL ON TABLE public.contact_tags TO authenticated, service_role;
GRANT ALL ON TABLE public.contact_custom_values TO authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
