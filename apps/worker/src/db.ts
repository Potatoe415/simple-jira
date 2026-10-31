import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

export const db = createClient(config.supabaseUrl, config.supabaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
