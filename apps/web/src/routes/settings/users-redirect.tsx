import { redirect } from "react-router";

export function loader() {
  throw redirect("/settings/staff");
}

export default function SettingsUsersRedirectPage() {
  return null;
}
