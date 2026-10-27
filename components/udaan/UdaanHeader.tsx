import Link from "next/link";

const UdaanHeader = () => {
  return (
    <header className="flight-header">
      <Link href="/" className="brand" aria-label="Udaan home">
        <span className="brand-icon" aria-hidden="true">↗</span>
        udaan<span className="brand-dot">.</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link href="/#flight-search" className="active">Flights</Link>
        <Link href="/#sample-flights">Sample fares</Link>
      </nav>
      <span className="practice-link">Domestic journeys ↗</span>
    </header>
  );
};

export default UdaanHeader;
