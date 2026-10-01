/* PHD Billing — connection settings. Fill these in from Supabase → Project Settings → API.
   The anon/publishable key is designed to be public: the database's row-level security
   (schema.sql) is what keeps data private — only people on the Team list can read anything. */
window.PHD_CONFIG = {
  supabaseUrl: "https://skeuyevmbxtkjusmrmdd.supabase.co/rest/v1/",
  supabaseAnonKey: "sb_publishable_Hn6hWa2a6nmM5JAlN0hU1w_qNuIcKzT",
  googleDomain: ""   // optional: "phdproperties.realestate" shows only that domain's Google accounts
};
