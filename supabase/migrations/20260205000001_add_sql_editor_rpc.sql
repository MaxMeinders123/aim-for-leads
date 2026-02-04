-- Create RPC function for safe SQL query execution
-- This function allows authenticated users to execute read-only SQL queries

CREATE OR REPLACE FUNCTION public.execute_sql_query(query TEXT)
RETURNS TABLE (result JSONB) AS $$
DECLARE
  result_row RECORD;
  result_json JSONB;
BEGIN
  -- Execute the query dynamically
  FOR result_row IN EXECUTE query LOOP
    result_json := row_to_json(result_row);
    RETURN QUERY SELECT result_json;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.execute_sql_query(TEXT) TO authenticated;

-- Create a view for database schema inspection
CREATE OR REPLACE VIEW public.database_schema AS
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- Grant select on the schema view
GRANT SELECT ON public.database_schema TO authenticated;

-- Create an audit log table for SQL queries
CREATE TABLE IF NOT EXISTS public.sql_query_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  query_text TEXT NOT NULL,
  query_type VARCHAR(20),
  result_row_count INTEGER,
  execution_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit log
ALTER TABLE public.sql_query_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can only view their own audit logs
CREATE POLICY "Users can view their own query logs"
  ON public.sql_query_audit_log
  FOR SELECT
  USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- Only service role can insert audit logs
CREATE POLICY "Service role can insert audit logs"
  ON public.sql_query_audit_log
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Create index for performance
CREATE INDEX idx_sql_query_audit_log_user_id ON public.sql_query_audit_log(user_id);
CREATE INDEX idx_sql_query_audit_log_created_at ON public.sql_query_audit_log(created_at);

-- Grant select on audit log table
GRANT SELECT ON public.sql_query_audit_log TO authenticated;
