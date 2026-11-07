// Storage keys shared by the account module and modules that only need to know WHO is signed in
// (save ownership), so they don't have to import the whole account/card layer.
export const ACTIVE_ACCOUNT_KEY = "cls_active_account";
export const ACCOUNTS_KEY = "cls_accounts_v1";
