/**
 * The nine creative domains and their sub-domains, following the RA 11904
 * (Philippine Creative Industries Development Act) domain set.
 *
 * Slugs are permanent public identifiers. Labels may be edited freely; a slug
 * must never change once creative profiles reference it.
 */
export interface SeedDomain {
  slug: string;
  name: string;
  subdomains: { slug: string; name: string }[];
}

export const CREATIVE_DOMAINS: SeedDomain[] = [
  {
    slug: 'audiovisual-media',
    name: 'Audiovisual Media',
    subdomains: [
      { slug: 'music-composers', name: 'Music Composers' },
      { slug: 'podcasts', name: 'Podcasts' },
      { slug: 'voiceover-artists', name: 'Voiceover Artists' },
      { slug: 'film-production-companies', name: 'Film Production Companies' },
      { slug: 'broadcasting-stations', name: 'Broadcasting Stations' },
      { slug: 'animation-studios', name: 'Animation Studios' },
      { slug: 'digital-streaming-platforms', name: 'Digital Streaming Platforms' },
      { slug: 'filmmakers', name: 'Filmmakers' },
      { slug: 'radio-tv-producers', name: 'Radio and TV Producers' },
      { slug: 'radio-tv-hosts', name: 'Radio and TV Hosts' },
      { slug: 'news-anchors-reporters', name: 'News Anchors and Reporters' },
      { slug: 'animators', name: 'Animators' },
      { slug: 'vloggers', name: 'Vloggers' },
    ],
  },
  {
    slug: 'digital-interactive-media',
    name: 'Digital Interactive Media',
    subdomains: [
      { slug: 'game-developers', name: 'Game Developers' },
      { slug: 'mobile-app-developers', name: 'Mobile App Developers' },
      { slug: 'video-game-designers', name: 'Video Game Designers' },
      { slug: 'virtual-reality-creators', name: 'Virtual Reality Creators' },
      { slug: 'augmented-reality-specialists', name: 'Augmented Reality Specialists' },
      { slug: 'digital-content-producers', name: 'Digital Content Producers' },
      { slug: 'gaming-studios', name: 'Gaming Studios' },
      { slug: 'mobile-app-development-firms', name: 'Mobile App Development Firms' },
      { slug: 'digital-content-platforms', name: 'Digital Content Platforms' },
    ],
  },
  {
    slug: 'creative-services',
    name: 'Creative Services',
    subdomains: [
      { slug: 'advertising-creatives', name: 'Advertising Creatives' },
      { slug: 'marketing-professionals', name: 'Marketing Professionals' },
      { slug: 'research-development-experts', name: 'Research and Development Experts' },
      { slug: 'event-planners-coordinators', name: 'Event Planners and Coordinators' },
      { slug: 'live-performance-artists', name: 'Live Performance Artists' },
      { slug: 'cultural-experience-providers', name: 'Cultural Experience Providers' },
      { slug: 'communication-specialists', name: 'Communication Specialists' },
      { slug: 'graphic-designers', name: 'Graphic Designers' },
    ],
  },
  {
    slug: 'design',
    name: 'Design',
    subdomains: [
      { slug: 'architects', name: 'Architects' },
      { slug: 'urban-landscape-artists', name: 'Urban Landscape Artists' },
      { slug: 'environmental-planners', name: 'Environmental Planners' },
      { slug: 'interior-spatial-planners', name: 'Interior and Spatial Planners' },
      { slug: 'product-designers', name: 'Product Designers' },
      { slug: 'fashion-designers', name: 'Fashion Designers' },
      { slug: 'accessory-makers', name: 'Accessory Makers' },
      { slug: 'textile-developers', name: 'Textile Developers' },
      { slug: 'furniture-makers', name: 'Furniture Makers' },
      { slug: 'jewelry-artisans', name: 'Jewelry Artisans' },
      { slug: 'toy-makers', name: 'Toy Makers' },
    ],
  },
  {
    slug: 'publishing-print-media',
    name: 'Publishing and Print Media',
    subdomains: [
      { slug: 'authors', name: 'Authors' },
      { slug: 'print-journalists', name: 'Print Journalists' },
      { slug: 'comic-artists-publishers', name: 'Comic Artists and Publishers' },
      { slug: 'novelists', name: 'Novelists' },
      { slug: 'cartoonists', name: 'Cartoonists' },
      { slug: 'editorial-writers-columnists', name: 'Editorial Writers and Columnists' },
      { slug: 'magazine-editors', name: 'Magazine Editors' },
      { slug: 'newspaper-editors-companies', name: 'Newspaper Editors and Companies' },
    ],
  },
  {
    slug: 'performing-arts',
    name: 'Performing Arts',
    subdomains: [
      { slug: 'choir-directors-trainers', name: 'Choir Directors and Trainers' },
      { slug: 'musicians', name: 'Musicians' },
      { slug: 'actors', name: 'Actors' },
      { slug: 'dance-choreographers', name: 'Dance Choreographers' },
      { slug: 'dancers-dance-troupes', name: 'Dancers and Dance Troupes' },
      { slug: 'theater-directors', name: 'Theater Directors' },
      { slug: 'circus-performers', name: 'Circus Performers' },
      { slug: 'spoken-word-poets', name: 'Spoken Word Poets' },
      { slug: 'orchestras', name: 'Orchestras' },
      { slug: 'theater-companies', name: 'Theater Companies' },
    ],
  },
  {
    slug: 'visual-arts',
    name: 'Visual Arts',
    subdomains: [
      { slug: 'painters', name: 'Painters' },
      { slug: 'sculptors', name: 'Sculptors' },
      { slug: 'photographers', name: 'Photographers' },
      { slug: 'multimedia-artists', name: 'Multimedia Artists' },
      { slug: 'collage-artists', name: 'Collage Artists' },
      { slug: 'tattoo-artists', name: 'Tattoo Artists' },
      { slug: 'art-galleries-studios', name: 'Art Galleries and Studios' },
      { slug: 'photography-studios', name: 'Photography Studios' },
    ],
  },
  {
    slug: 'traditional-cultural-expressions',
    name: 'Traditional and Cultural Expressions',
    subdomains: [
      { slug: 'traditional-craftsmen', name: 'Traditional Craftsmen and Craftswomen' },
      { slug: 'cultural-event-organizers', name: 'Cultural Event Organizers' },
      { slug: 'folk-musicians', name: 'Folk Musicians' },
      { slug: 'indigenous-craft-artisans', name: 'Artisans of Indigenous Crafts' },
      { slug: 'crafts-cooperatives', name: 'Crafts Cooperatives' },
      { slug: 'cultural-festivals', name: 'Cultural Festivals' },
      { slug: 'traditional-cuisine-restaurants', name: 'Traditional Cuisine Restaurants' },
      { slug: 'folk-music-ensembles', name: 'Folk Music Ensembles' },
    ],
  },
  {
    slug: 'cultural-sites',
    name: 'Cultural Sites',
    subdomains: [
      { slug: 'museum-curators', name: 'Museum Curators' },
      { slug: 'archeologists', name: 'Archeologists' },
      { slug: 'librarians', name: 'Librarians' },
      { slug: 'provincial-municipal-city-planners', name: 'Provincial, Municipal and City Planners' },
      { slug: 'monumental-sculptors', name: 'Monumental Sculptors' },
      { slug: 'event-curators', name: 'Event Curators' },
    ],
  },
];

/**
 * The eight municipalities of Biliran. Naval is the provincial capital.
 * PSGC codes are intentionally omitted rather than guessed; populate them from
 * the official PSA listing before any external data exchange.
 */
export const MUNICIPALITIES = [
  { slug: 'almeria', name: 'Almeria' },
  { slug: 'biliran', name: 'Biliran' },
  { slug: 'cabucgayan', name: 'Cabucgayan' },
  { slug: 'caibiran', name: 'Caibiran' },
  { slug: 'culaba', name: 'Culaba' },
  { slug: 'kawayan', name: 'Kawayan' },
  { slug: 'maripipi', name: 'Maripipi' },
  { slug: 'naval', name: 'Naval' },
];
