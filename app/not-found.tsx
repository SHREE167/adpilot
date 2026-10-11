import Link from "next/link";

export default function NotFound() {
  return (
    <div className="story-chapter hero">
      <p className="kicker">404</p>
      <h1 className="display">This page is not a plan.</h1>
      <p className="sub">The story starts at the beginning.</p>
      <Link href="/" className="btn btn-primary mt-10 inline-flex">
        New plan
      </Link>
    </div>
  );
}
