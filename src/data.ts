export type Safari = {
  id: string;
  slug?: string;
  title: string;
  region: string;
  duration: string;
  nights: number;
  price: number;
  image: string;
  gallery: string[];
  summary: string;
  description?: string;
  signature: string;
  highlights?: string[];
  included: string[];
  excluded: string[];
  availability: string[];
  coordinates: [number, number];
  country?: ("Kenya" | "Tanzania")[];
  parks?: string[];
  wildlife?: string[];
  tags?: string[];
  featured?: boolean;
  seo?: { title: string; description: string };
};

export type Destination = {
  slug?: string;
  name: string;
  country: "Kenya" | "Tanzania";
  coordinates: [number, number];
  best: string;
  animal: string;
  image: string;
  gallery?: string[];
  description: string;
  longDescription?: string;
  activities?: string[];
  featured?: boolean;
  published?: boolean;
  seo?: { title: string; description: string };
};

export type Booking = {
  reference: string;
  createdAt: string;
  status: "New" | "Confirmed" | "In planning" | "Cancelled";
  safari: string;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  accommodation: string;
  pickup: string;
  airport: string;
  budget: string;
  requests: string;
  payment: string;
  name: string;
  email: string;
  phone: string;
};

export const imagery = {
  hero: "https://images.pexels.com/photos/15815060/pexels-photo-15815060.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1400&w=2400",
  heroVideo: "https://videos.pexels.com/video-files/32416221/13827509_3840_2160_25fps.mp4",
  heroPoster: "https://images.pexels.com/videos/32416221/africa-wildlife-bluewildebeest-south-africa-south-african-landscape-32416221.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1400&w=2400",
  migration: "https://images.pexels.com/photos/5521703/pexels-photo-5521703.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  elephant: "https://images.pexels.com/photos/30817409/pexels-photo-30817409.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  lodge: "https://images.pexels.com/photos/37790193/pexels-photo-37790193.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  cheetah: "https://images.pexels.com/photos/32414164/pexels-photo-32414164.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  lion: "https://images.pexels.com/photos/19281386/pexels-photo-19281386.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  giraffe: "https://images.pexels.com/photos/7211289/pexels-photo-7211289.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  mara: "https://images.pexels.com/photos/15373901/pexels-photo-15373901.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  crater: "https://images.pexels.com/photos/32382771/pexels-photo-32382771.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
  portrait: "https://images.pexels.com/photos/38223514/pexels-photo-38223514.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=1600",
  rhino: "https://images.pexels.com/photos/26052069/pexels-photo-26052069.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=2000",
};

export const safaris: Safari[] = [
  {
    id: "great-migration",
    title: "The Great Migration",
    region: "Serengeti + Maasai Mara",
    duration: "9 days / 8 nights",
    nights: 8,
    price: 8450,
    image: imagery.migration,
    gallery: [imagery.migration, imagery.hero, imagery.mara],
    summary: "Follow the herds from private mobile camps to the fabled Mara River crossings.",
    signature: "River crossings, predator country, private mobile camp",
    included: [],
    excluded: [],
    availability: ["Jun", "Jul", "Aug", "Sep", "Oct"],
    coordinates: [35, 42],
  },
  {
    id: "big-five",
    title: "Big Five, Unhurried",
    region: "Ngorongoro + Serengeti",
    duration: "7 days / 6 nights",
    nights: 6,
    price: 6200,
    image: imagery.lion,
    gallery: [imagery.lion, imagery.rhino, imagery.elephant],
    summary: "A patient, private search for East Africa's icons, led by the rhythms of the wild.",
    signature: "Crater floor, lion territories, elephant herds",
    included: [],
    excluded: [],
    availability: ["Jan", "Feb", "Jun", "Jul", "Aug", "Sep"],
    coordinates: [42, 57],
  },
  {
    id: "luxury-lodge",
    title: "Lodges Beyond the Wild",
    region: "Northern Tanzania",
    duration: "8 days / 7 nights",
    nights: 7,
    price: 9900,
    image: imagery.lodge,
    gallery: [imagery.lodge, imagery.crater, imagery.giraffe],
    summary: "Architectural lodges, intuitive service and vast landscapes with every detail considered.",
    signature: "Design lodges, bush dining, optional helicopter flight",
    included: [],
    excluded: [],
    availability: ["All year"],
    coordinates: [56, 52],
  },
  {
    id: "family",
    title: "The Family Bush",
    region: "Laikipia + Maasai Mara",
    duration: "8 days / 7 nights",
    nights: 7,
    price: 5750,
    image: imagery.elephant,
    gallery: [imagery.elephant, imagery.giraffe, imagery.mara],
    summary: "A flexible, deeply engaging journey designed for curious young explorers and their families.",
    signature: "Junior ranger program, private house, gentle pacing",
    included: [],
    excluded: [],
    availability: ["Feb", "Mar", "Jun", "Jul", "Aug", "Dec"],
    coordinates: [62, 32],
  },
  {
    id: "honeymoon",
    title: "Wildly, Together",
    region: "Serengeti + Zanzibar",
    duration: "11 days / 10 nights",
    nights: 10,
    price: 11200,
    image: imagery.giraffe,
    gallery: [imagery.giraffe, imagery.lodge, imagery.hero],
    summary: "Private plains, lantern dinners and an Indian Ocean epilogue created for two.",
    signature: "Private plunge pool, hot-air balloon, island retreat",
    included: [],
    excluded: [],
    availability: ["Jan", "Feb", "Jun", "Jul", "Aug", "Sep", "Oct"],
    coordinates: [46, 67],
  },
  {
    id: "photographic",
    title: "The Photographer's Light",
    region: "Ndutu + Serengeti",
    duration: "10 days / 9 nights",
    nights: 9,
    price: 9300,
    image: imagery.cheetah,
    gallery: [imagery.cheetah, imagery.lion, imagery.migration],
    summary: "A specialist-led expedition with low-angle vehicles and time to wait for the frame.",
    signature: "Pro guide, beanbags, editing suite, golden-hour drives",
    included: [],
    excluded: [],
    availability: ["Jan", "Feb", "Mar", "Jun", "Sep", "Oct"],
    coordinates: [39, 59],
  },
  {
    id: "walking",
    title: "On Foot in the Rift",
    region: "Tarangire + Lake Eyasi",
    duration: "6 days / 5 nights",
    nights: 5,
    price: 4800,
    image: imagery.crater,
    gallery: [imagery.crater, imagery.elephant, imagery.portrait],
    summary: "Read tracks, notice the small worlds and move through the landscape at nature's pace.",
    signature: "Private walking guide, fly camp, Hadzabe encounter",
    included: [],
    excluded: [],
    availability: ["Jun", "Jul", "Aug", "Sep", "Oct"],
    coordinates: [52, 62],
  },
  {
    id: "under-canvas",
    title: "Under Canvas",
    region: "Maasai Mara Conservancies",
    duration: "5 days / 4 nights",
    nights: 4,
    price: 3950,
    image: imagery.mara,
    gallery: [imagery.mara, imagery.migration, imagery.lion],
    summary: "Canvas walls, hot bucket showers and the rare luxury of falling asleep to the wild.",
    signature: "Private conservancy, night drives, fireside suppers",
    included: [],
    excluded: [],
    availability: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"],
    coordinates: [30, 34],
  },
];

export const destinations: Destination[] = [
  { name: "Serengeti", country: "Tanzania", coordinates: [45, 56], best: "June to October", animal: "Wildebeest", image: imagery.migration, description: "An immense grassland theatre where weather, predator and prey write each day anew." },
  { name: "Ngorongoro", country: "Tanzania", coordinates: [51, 67], best: "Year-round", animal: "Black rhino", image: imagery.rhino, description: "A volcanic caldera sheltering one of the greatest concentrations of wildlife on Earth." },
  { name: "Tarangire", country: "Tanzania", coordinates: [58, 73], best: "June to October", animal: "Elephant", image: imagery.elephant, description: "Baobab country, seasonal rivers and magnificent elephant families moving through dust." },
  { name: "Lake Manyara", country: "Tanzania", coordinates: [54, 70], best: "June to September", animal: "Flamingo", image: imagery.giraffe, description: "A forest-fringed lake beneath the Rift escarpment, alive with primates and birdlife." },
  { name: "Maasai Mara", country: "Kenya", coordinates: [39, 43], best: "July to October", animal: "Lion", image: imagery.lion, description: "Golden plains, private conservancies and intimate access to the migration's northern reach." },
  { name: "Amboseli", country: "Kenya", coordinates: [65, 45], best: "June to October", animal: "Elephant", image: imagery.elephant, description: "Ancient elephant paths under the snow-capped presence of Kilimanjaro." },
  { name: "Tsavo", country: "Kenya", coordinates: [73, 54], best: "June to October", animal: "Red elephant", image: imagery.crater, description: "Vast, untamed and rust-red: Kenya at its most elemental and gloriously uncrowded." },
  { name: "Mount Kilimanjaro", country: "Tanzania", coordinates: [68, 60], best: "January to March", animal: "Colobus", image: imagery.giraffe, description: "Glaciers above cloud forest, with private routes selected for time and acclimatisation." },
];

export const galleryItems = [
  { src: imagery.hero, alt: "Migration herd seen from the air", type: "Aerial", size: "tall" },
  { src: imagery.lion, alt: "Lion resting under dappled shade", type: "Wildlife", size: "wide" },
  { src: imagery.lodge, alt: "Open-air luxury safari lodge", type: "Lodges", size: "wide" },
  { src: imagery.cheetah, alt: "Cheetah watching across the grassland", type: "Wildlife", size: "tall" },
  { src: imagery.portrait, alt: "Maasai guide in traditional attire", type: "People", size: "tall" },
  { src: imagery.elephant, alt: "Elephant family moving through green savanna", type: "Wildlife", size: "wide" },
  { src: imagery.migration, alt: "Wildebeest gathering across the plain", type: "Migration", size: "wide" },
  { src: imagery.giraffe, alt: "Giraffe in the last light of day", type: "Wildlife", size: "tall" },
  { src: imagery.rhino, alt: "Two rhino moving beside a lake", type: "Wildlife", size: "wide" },
  { src: imagery.mara, alt: "Open Maasai Mara grassland", type: "Landscape", size: "wide" },
];

export const testimonials = [
  { quote: "They knew when to move, when to wait, and when to say nothing at all. Africa felt entirely ours.", name: "Amelia and James", place: "London" },
  { quote: "The rarest kind of luxury: complete confidence, deep knowledge and time that did not feel scheduled.", name: "Maya R.", place: "New York" },
  { quote: "Our children still talk about the tracks they read with Daniel. It changed how they see the natural world.", name: "The Mikkelsen family", place: "Copenhagen" },
];

export const timeline = [
  { year: "2008", text: "Olkinyei begins with one vehicle, two naturalists and a belief in slower journeys." },
  { year: "2013", text: "Our first conservancy partnership funds classrooms and predator-safe livestock enclosures." },
  { year: "2018", text: "We become carbon-measured and shift every field operation toward a lighter footprint." },
  { year: "2022", text: "The guide fellowship opens, supporting a new generation of East African storytellers." },
  { year: "Today", text: "A small, independent team still creates every expedition by hand." },
];

export const blogPosts = [
  { title: "Reading the River: A Guide to the Great Migration", category: "Wildlife", date: "12 May 2026", image: imagery.migration },
  { title: "What to Pack When the Dust Is Part of the Story", category: "Packing", date: "28 April 2026", image: imagery.lodge },
  { title: "The Ethics of the Wildlife Photograph", category: "Photography", date: "09 March 2026", image: imagery.cheetah },
  { title: "Kenya and Tanzania Entry Notes for 2026", category: "Visa", date: "18 February 2026", image: imagery.mara },
];