import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  MapPin,
  Minus,
  X,
} from "lucide-react";
import { Destination, Safari } from "./data";

/**
 * Editorial right-side slide-over details panel for a Safari package.
 *
 * This is the "VIEW DETAILS" experience for the safari catalogue. It is NOT a
 * full page: it slides in from the right over a darkened safari listing, keeps
 * the listing mounted behind the overlay, and reads every value straight from
 * the selected Supabase package record (via the shared CMS store).
 *
 * The visual language reuses the project's existing design system (serif
 * titles, ivory paper, sand/burnt accents, .button / .text-link primitives).
 */

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function availabilityLabel(availability: string[]) {
  if (!availability || availability.length === 0) return "Year-round";
  if (availability.length === 1 && availability[0].toLowerCase() === "all year") return "Year-round";
  return availability.slice(0, 6).join(" / ");
}

type RoutePoint = {
  name: string;
  coordinates: [number, number];
};

/**
 * Reconstructs the route / itinerary visual from the package's actual parks and
 * the destination coordinate map. Coordinates live on the Supabase destination
 * records; the route line simply connects the package's selected parks in
 * order. Nothing is fabricated — if the package has no recognisable parks the
 * component falls back to the package's own coordinates, otherwise it renders
 * an elegant "map to follow" placeholder derived from package data.
 */
function SafariRouteMap({ safari, destinations }: { safari: Safari; destinations: Destination[] }) {
  const points = useMemo<RoutePoint[]>(() => {
    const parks = safari.parks ?? [];
    const fromParks = parks
      .map((park) => {
        const destination = destinations.find(
          (item) => item.name.toLowerCase() === park.toLowerCase(),
        );
        return destination ? { name: park, coordinates: destination.coordinates } : null;
      })
      .filter((item): item is RoutePoint => Boolean(item));

    if (fromParks.length > 0) return fromParks;

    if (safari.coordinates && safari.coordinates[0] !== 0 && safari.coordinates[1] !== 0) {
      return [{ name: safari.region, coordinates: safari.coordinates }];
    }
    return [];
  }, [safari.parks, safari.coordinates, safari.region, destinations]);

  if (points.length === 0) {
    return (
      <div className="route-map route-map--empty">
        <p>The route for this journey is tailored around the season and your pace.</p>
      </div>
    );
  }

  const routeLine = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.coordinates[0]} ${point.coordinates[1]}`)
    .join(" ");

  return (
    <div className="route-map">
      <svg viewBox="0 0 100 100" role="img" aria-label={`Map of the ${safari.title} route`} preserveAspectRatio="none">
        <defs>
          <filter id="route-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1" />
          </filter>
        </defs>
        <path d="M28 7L69 12 88 32 83 55 70 94 31 89 15 55 18 25Z" fill="#273024" stroke="#8d916f" strokeWidth=".4" />
        <path d="M24 42C44 30 60 44 82 32M30 64C46 54 62 66 78 58" fill="none" stroke="#6f765a" strokeWidth=".35" strokeDasharray="2 2" />
        <path d="M25 65C36 60 44 72 58 67S74 72 82 65" fill="none" stroke="#b9b497" opacity=".45" filter="url(#route-soft)" />
        <path d={routeLine} fill="none" stroke="#d9b77b" strokeWidth=".9" strokeLinecap="round" strokeDasharray="2.4 1.8" />
      </svg>
      {points.map((point, index) => (
        <span
          key={`${point.name}-${point.coordinates.join("-")}`}
          className="route-pin"
          style={{ left: `${point.coordinates[0]}%`, top: `${point.coordinates[1]}%` }}
        >
          <b>{index + 1}</b>
          <i>{point.name}</i>
        </span>
      ))}
    </div>
  );
}

function SafariDetailsPanel({
  safari,
  onClose,
  onBook,
  destinations,
}: {
  safari: Safari | null;
  onClose: () => void;
  onBook: (safari: Safari) => void;
  destinations: Destination[];
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [activeImage, setActiveImage] = useState(0);

  const images = useMemo(
    () => (safari && safari.gallery.length > 0 ? safari.gallery : safari ? [safari.image] : []),
    [safari],
  );

  // Reset the gallery whenever a new package is selected.
  useEffect(() => {
    setActiveImage(0);
  }, [safari?.id]);

  useEffect(() => {
    if (!safari) return;
    previousFocus.current = document.activeElement as HTMLElement;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (closeRef.current) closeRef.current.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      previousFocus.current?.focus?.();
    };
  }, [safari, onClose]);

  return (
    <AnimatePresence>
      {safari && (
        <motion.div
          className="experience-modal"
          key="safari-details"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
          onClick={onClose}
        >
          <motion.aside
            className="experience-sheet"
            data-lenis-prevent
            role="dialog"
            aria-modal="true"
            aria-label={`${safari.title} — journey details`}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-scroll">
              <div className="sheet-gallery">
                <img src={images[activeImage] || safari.image} alt={`${safari.title} hero`} />
                {images.length > 1 && (
                  <div className="sheet-gallery-tabs">
                    {images.map((image, index) => (
                      <button
                        key={`${image}-${index}`}
                        className={index === activeImage ? "active" : ""}
                        onClick={() => setActiveImage(index)}
                        aria-label={`Show ${safari.title} image ${index + 1}`}
                      >
                        <img src={image} alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="sheet-content">
                <p className="eyebrow">{safari.region}</p>
                <h2>{safari.title}</h2>
                <p className="sheet-summary">{safari.description || safari.summary}</p>

                <div className="sheet-facts">
                  <span><Clock3 size={15} />{safari.duration}</span>
                  <span><MapPin size={15} />{safari.region}</span>
                  <span><CalendarDays size={15} />{availabilityLabel(safari.availability)}</span>
                  <span><CircleDollarSign size={15} />From {formatCurrency(safari.price)} pp</span>
                </div>

                {safari.signature ? (
                  <div className="signature">
                    <span>Signature moments</span>
                    <p>{safari.signature}</p>
                  </div>
                ) : null}

                <SafariRouteMap safari={safari} destinations={destinations} />

                {(safari.highlights && safari.highlights.length > 0) ? (
                  <div className="sheet-highlights">
                    <h3>Journey highlights</h3>
                    <ul className="detail-list">
                      {safari.highlights.map((item) => (
                        <li key={item}><Check size={15} />{item}</li>
                      ))}
                    </ul>
                    {(safari.wildlife && safari.wildlife.length > 0) ? (
                      <div className="detail-tag-group">
                        {safari.wildlife.map((animal) => <span key={animal}>{animal}</span>)}
                        {(safari.parks ?? []).map((park) => <span key={park}>{park}</span>)}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="include-grid">
                  <div>
                    <h3>Included</h3>
                    {safari.included.length > 0 ? (
                      safari.included.map((item) => (
                        <p key={item}><Check size={14} />{item}</p>
                      ))
                    ) : (
                      <p>Details available on enquiry.</p>
                    )}
                  </div>
                  <div>
                    <h3>Not included</h3>
                    {safari.excluded.length > 0 ? (
                      safari.excluded.map((item) => (
                        <p key={item}><Minus size={14} />{item}</p>
                      ))
                    ) : (
                      <p>Details available on enquiry.</p>
                    )}
                  </div>
                </div>

                <div className="sheet-cta">
                  <button className="button button--sand" onClick={() => onBook(safari)}>
                    Book this journey <ArrowRight size={17} />
                  </button>
                </div>
              </div>
            </div>

            <button className="sheet-close" ref={closeRef} onClick={onClose} aria-label="Close journey details">
              <X size={18} />
            </button>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default SafariDetailsPanel;
