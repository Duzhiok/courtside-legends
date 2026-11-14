// Storage keys shared by the account module and modules that only need to know WHO is signed in
// (save ownership), so they don't have to import the whole account/card layer.
export const ACTIVE_ACCOUNT_KEY = "cls_active_account";
export const ACCOUNTS_KEY = "cls_accounts_v1";
// Quarantine for a corrupt account store (D-P1-2): when cls_accounts_v1 cannot be parsed, its raw
// bytes are preserved here before anything else touches the store, so a later write can never
// silently erase every account. Never deleted by the discard path — it is the only surviving copy.
export const CORRUPT_ACCOUNTS_KEY = "cls_accounts_v1_corrupt";
// Guest Account Level record (no account object): same origin localStorage, its own key.
export const GUEST_AXP_KEY = "cls_guest_axp";
