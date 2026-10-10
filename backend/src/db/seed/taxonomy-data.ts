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
  subdomains: { slug: string; name: string; singularName: string }[];
}

export const CREATIVE_DOMAINS: SeedDomain[] = [
  {
    slug: 'audiovisual-media',
    name: 'Audiovisual Media',
    subdomains: [
      { slug: 'music-composers', name: 'Music Composers', singularName: 'Music Composer' },
      { slug: 'podcasts', name: 'Podcasts', singularName: 'Podcast' },
      { slug: 'voiceover-artists', name: 'Voiceover Artists', singularName: 'Voiceover Artist' },
      { slug: 'film-production-companies', name: 'Film Production Companies', singularName: 'Film Production Company' },
      { slug: 'broadcasting-stations', name: 'Broadcasting Stations', singularName: 'Broadcasting Station' },
      { slug: 'animation-studios', name: 'Animation Studios', singularName: 'Animation Studio' },
      { slug: 'digital-streaming-platforms', name: 'Digital Streaming Platforms', singularName: 'Digital Streaming Platform' },
      { slug: 'filmmakers', name: 'Filmmakers', singularName: 'Filmmaker' },
      { slug: 'radio-tv-producers', name: 'Radio and TV Producers', singularName: 'Radio and TV Producer' },
      { slug: 'radio-tv-hosts', name: 'Radio and TV Hosts', singularName: 'Radio and TV Host' },
      { slug: 'news-anchors-reporters', name: 'News Anchors and Reporters', singularName: 'News Anchor or Reporter' },
      { slug: 'animators', name: 'Animators', singularName: 'Animator' },
      { slug: 'vloggers', name: 'Vloggers', singularName: 'Vlogger' },
    ],
  },
  {
    slug: 'digital-interactive-media',
    name: 'Digital Interactive Media',
    subdomains: [
      { slug: 'game-developers', name: 'Game Developers', singularName: 'Game Developer' },
      { slug: 'mobile-app-developers', name: 'Mobile App Developers', singularName: 'Mobile App Developer' },
      { slug: 'video-game-designers', name: 'Video Game Designers', singularName: 'Video Game Designer' },
      { slug: 'virtual-reality-creators', name: 'Virtual Reality Creators', singularName: 'Virtual Reality Creator' },
      { slug: 'augmented-reality-specialists', name: 'Augmented Reality Specialists', singularName: 'Augmented Reality Specialist' },
      { slug: 'digital-content-producers', name: 'Digital Content Producers', singularName: 'Digital Content Producer' },
      { slug: 'gaming-studios', name: 'Gaming Studios', singularName: 'Gaming Studio' },
      { slug: 'mobile-app-development-firms', name: 'Mobile App Development Firms', singularName: 'Mobile App Development Firm' },
      { slug: 'digital-content-platforms', name: 'Digital Content Platforms', singularName: 'Digital Content Platform' },
    ],
  },
  {
    slug: 'creative-services',
    name: 'Creative Services',
    subdomains: [
      { slug: 'advertising-creatives', name: 'Advertising Creatives', singularName: 'Advertising Creative' },
      { slug: 'marketing-professionals', name: 'Marketing Professionals', singularName: 'Marketing Professional' },
      { slug: 'research-development-experts', name: 'Research and Development Experts', singularName: 'Research and Development Expert' },
      { slug: 'event-planners-coordinators', name: 'Event Planners and Coordinators', singularName: 'Event Planner or Coordinator' },
      { slug: 'live-performance-artists', name: 'Live Performance Artists', singularName: 'Live Performance Artist' },
      { slug: 'cultural-experience-providers', name: 'Cultural Experience Providers', singularName: 'Cultural Experience Provider' },
      { slug: 'communication-specialists', name: 'Communication Specialists', singularName: 'Communication Specialist' },
      { slug: 'graphic-designers', name: 'Graphic Designers', singularName: 'Graphic Designer' },
    ],
  },
  {
    slug: 'design',
    name: 'Design',
    subdomains: [
      { slug: 'architects', name: 'Architects', singularName: 'Architect' },
      { slug: 'urban-landscape-artists', name: 'Urban Landscape Artists', singularName: 'Urban Landscape Artist' },
      { slug: 'environmental-planners', name: 'Environmental Planners', singularName: 'Environmental Planner' },
      { slug: 'interior-spatial-planners', name: 'Interior and Spatial Planners', singularName: 'Interior and Spatial Planner' },
      { slug: 'product-designers', name: 'Product Designers', singularName: 'Product Designer' },
      { slug: 'fashion-designers', name: 'Fashion Designers', singularName: 'Fashion Designer' },
      { slug: 'accessory-makers', name: 'Accessory Makers', singularName: 'Accessory Maker' },
      { slug: 'textile-developers', name: 'Textile Developers', singularName: 'Textile Developer' },
      { slug: 'furniture-makers', name: 'Furniture Makers', singularName: 'Furniture Maker' },
      { slug: 'jewelry-artisans', name: 'Jewelry Artisans', singularName: 'Jewelry Artisan' },
      { slug: 'toy-makers', name: 'Toy Makers', singularName: 'Toy Maker' },
    ],
  },
  {
    slug: 'publishing-print-media',
    name: 'Publishing and Print Media',
    subdomains: [
      { slug: 'authors', name: 'Authors', singularName: 'Author' },
      { slug: 'print-journalists', name: 'Print Journalists', singularName: 'Print Journalist' },
      { slug: 'comic-artists-publishers', name: 'Comic Artists and Publishers', singularName: 'Comic Artist or Publisher' },
      { slug: 'novelists', name: 'Novelists', singularName: 'Novelist' },
      { slug: 'cartoonists', name: 'Cartoonists', singularName: 'Cartoonist' },
      { slug: 'editorial-writers-columnists', name: 'Editorial Writers and Columnists', singularName: 'Editorial Writer or Columnist' },
      { slug: 'magazine-editors', name: 'Magazine Editors', singularName: 'Magazine Editor' },
      { slug: 'newspaper-editors-companies', name: 'Newspaper Editors and Companies', singularName: 'Newspaper Editor or Company' },
    ],
  },
  {
    slug: 'performing-arts',
    name: 'Performing Arts',
    subdomains: [
      { slug: 'choir-directors-trainers', name: 'Choir Directors and Trainers', singularName: 'Choir Director or Trainer' },
      { slug: 'musicians', name: 'Musicians', singularName: 'Musician' },
      { slug: 'actors', name: 'Actors', singularName: 'Actor' },
      { slug: 'dance-choreographers', name: 'Dance Choreographers', singularName: 'Dance Choreographer' },
      { slug: 'dancers-dance-troupes', name: 'Dancers and Dance Troupes', singularName: 'Dancer or Dance Troupe' },
      { slug: 'theater-directors', name: 'Theater Directors', singularName: 'Theater Director' },
      { slug: 'circus-performers', name: 'Circus Performers', singularName: 'Circus Performer' },
      { slug: 'spoken-word-poets', name: 'Spoken Word Poets', singularName: 'Spoken Word Poet' },
      { slug: 'orchestras', name: 'Orchestras', singularName: 'Orchestra' },
      { slug: 'theater-companies', name: 'Theater Companies', singularName: 'Theater Company' },
    ],
  },
  {
    slug: 'visual-arts',
    name: 'Visual Arts',
    subdomains: [
      { slug: 'painters', name: 'Painters', singularName: 'Painter' },
      { slug: 'sculptors', name: 'Sculptors', singularName: 'Sculptor' },
      { slug: 'photographers', name: 'Photographers', singularName: 'Photographer' },
      { slug: 'multimedia-artists', name: 'Multimedia Artists', singularName: 'Multimedia Artist' },
      { slug: 'collage-artists', name: 'Collage Artists', singularName: 'Collage Artist' },
      { slug: 'tattoo-artists', name: 'Tattoo Artists', singularName: 'Tattoo Artist' },
      { slug: 'art-galleries-studios', name: 'Art Galleries and Studios', singularName: 'Art Gallery or Studio' },
      { slug: 'photography-studios', name: 'Photography Studios', singularName: 'Photography Studio' },
    ],
  },
  {
    slug: 'traditional-cultural-expressions',
    name: 'Traditional and Cultural Expressions',
    subdomains: [
      { slug: 'traditional-craftsmen', name: 'Traditional Craftsmen and Craftswomen', singularName: 'Traditional Craftsperson' },
      { slug: 'cultural-event-organizers', name: 'Cultural Event Organizers', singularName: 'Cultural Event Organizer' },
      { slug: 'folk-musicians', name: 'Folk Musicians', singularName: 'Folk Musician' },
      { slug: 'indigenous-craft-artisans', name: 'Artisans of Indigenous Crafts', singularName: 'Artisan of Indigenous Crafts' },
      { slug: 'crafts-cooperatives', name: 'Crafts Cooperatives', singularName: 'Crafts Cooperative' },
      { slug: 'cultural-festivals', name: 'Cultural Festivals', singularName: 'Cultural Festival' },
      { slug: 'traditional-cuisine-restaurants', name: 'Traditional Cuisine Restaurants', singularName: 'Traditional Cuisine Restaurant' },
      { slug: 'folk-music-ensembles', name: 'Folk Music Ensembles', singularName: 'Folk Music Ensemble' },
    ],
  },
  {
    slug: 'cultural-sites',
    name: 'Cultural Sites',
    subdomains: [
      { slug: 'museum-curators', name: 'Museum Curators', singularName: 'Museum Curator' },
      { slug: 'archeologists', name: 'Archeologists', singularName: 'Archeologist' },
      { slug: 'librarians', name: 'Librarians', singularName: 'Librarian' },
      { slug: 'provincial-municipal-city-planners', name: 'Provincial, Municipal and City Planners', singularName: 'Provincial, Municipal or City Planner' },
      { slug: 'monumental-sculptors', name: 'Monumental Sculptors', singularName: 'Monumental Sculptor' },
      { slug: 'event-curators', name: 'Event Curators', singularName: 'Event Curator' },
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
