import { redirect } from "react-router";

export function loader({ params }: { params: { proj: string } }) {
  const proj = params.proj;
  throw redirect(`/p/${proj}/dashboards`);
}

export default function PRedirectPage() {
  return null;
}
