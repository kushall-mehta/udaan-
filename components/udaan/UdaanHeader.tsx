"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";

const UdaanHeader = () => {
  const pathname = usePathname();
  const isTrackingPage = pathname.startsWith("/tracking");

  return (
    <header className="flight-header">
      <Link href="/" className="brand" aria-label="Udaan home">
        <span className="brand-icon" aria-hidden="true">↗</span>
        udaan<span className="brand-dot">.</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#flight-search" className={!isTrackingPage ? "active" : undefined}
          aria-current={!isTrackingPage ? "page" : undefined}>Flights</Link>
        <Link href="/tracking" className={isTrackingPage ? "active" : undefined}
          aria-current={isTrackingPage ? "page" : undefined}>Airport tracking</Link>
      </nav>
      <span className="practice-link">Domestic journeys ↗</span>
    </header>
  );
};

export default UdaanHeader;
