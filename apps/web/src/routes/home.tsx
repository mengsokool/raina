import type { Route } from "./+types/home";
import { redirect } from "react-router";
import { getServerUser } from "@/lib/server-loaders";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getServerUser(request);
  if (user) {
    throw redirect("/projects");
  }
  throw redirect("/login");
}

export default function HomePage() {
  return null;
}
