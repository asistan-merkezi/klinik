CREATE OR REPLACE FUNCTION _gecici_rol_probe()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN jsonb_build_object(
    'auth_role', auth.role(),
    'auth_uid', auth.uid(),
    'current_user', current_user,
    'jwt_claims', current_setting('request.jwt.claims', true)
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION _gecici_rol_probe() TO service_role, authenticated, anon;
