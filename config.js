/* PHD Billing — connection settings. Fill these in from Supabase → Project Settings → API.
   The anon/publishable key is designed to be public: the database's row-level security
   (schema.sql) is what keeps data private — only people on the Team list can read anything. */
window.PHD_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseAnonKey: "YOUR-ANON-OR-PUBLISHABLE-KEY",
  googleDomain: ""   // optional: "phdproperties.realestate" shows only that domain's Google accounts
};
