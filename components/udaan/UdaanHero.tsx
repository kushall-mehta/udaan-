"use client";

import useScrollFlight from "./useScrollFlight";

const UdaanHero = () => {
  const planeArtRef = useScrollFlight();

  return (
    <section className="flight-hero">
      <div className="hero-orbit orbit-one" aria-hidden="true" />
      <div className="hero-orbit orbit-two" aria-hidden="true" />
      <div className="hero-copy">
        <p className="eyebrow"><span aria-hidden="true" />BIG LITTLE JOURNEYS, WITHIN INDIA</p>
        <h1>A little closer<br />to <em>everywhere.</em></h1>
        <p>
          New cities. Familiar faces. That much-needed break.<br />
          Find your next flight, and go where you feel.
        </p>
      </div>
      <div className="hero-art" aria-hidden="true" ref={planeArtRef}>
        <span className="sky-label">YOUR NEXT CHAPTER</span>
        <div className="sun-disc" />
        <div className="cloud cloud-one" />
        <div className="cloud cloud-two" />
        <div className="plane-art">✈</div>
        <div className="plane-trail" />
        <span className="art-coordinate">20.5937° N &nbsp; 78.9629° E</span>
      </div>
    </section>
  );
};

export default UdaanHero;
