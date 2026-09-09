import Link from "next/link";

export default function NotFound() {
  return (
    <div className="story-chapter mx-auto max-w-3xl">
      <p className="kicker">404</p>
      <h1 className="display mt-4 text-5xl sm:text-7xl">This page is not a plan.</h1>
      <p className="mt-6 text-xl text-fog">The story starts at the beginning.</p>
      <Link href="/" className="btn btn-primary mt-10 inline-flex">
        New plan
      </Link>
    </div>
  );
}
