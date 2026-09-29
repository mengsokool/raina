export type ShareAccessOption = "public" | "users_only" | "disabled";

export const SHARE_ACCESS_OPTIONS: {
  id: ShareAccessOption;
  title: string;
  description: string;
}[] = [
  {
    id: "public",
    title: "Public access",
    description: "Anyone with the link can view without signing in.",
  },
  {
    id: "users_only",
    title: "Restricted access",
    description: "Requires login with configured user credentials.",
  },
  {
    id: "disabled",
    title: "Paused",
    description: "Temporarily block all access via this link.",
  },
];
