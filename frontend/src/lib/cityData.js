// City lookup: keywords → coordinates, display name, IANA timezone
export const CITIES = [
  // US — Northeast
  { keys: ['new york', 'nyc', 'manhattan', 'brooklyn', 'wall street', 'midtown', 'lower manhattan', 'tribeca', 'soho'], coords: [40.71, -74.01], name: 'New York', tz: 'America/New_York' },
  { keys: ['boston', 'cambridge ma', 'somerville ma', 'back bay', 'financial district boston'], coords: [42.36, -71.06], name: 'Boston', tz: 'America/New_York' },
  { keys: ['philadelphia', 'philly'], coords: [39.95, -75.17], name: 'Philadelphia', tz: 'America/New_York' },
  { keys: ['washington dc', 'washington, dc', ', dc', 'arlington va', 'mclean', 'tysons', 'bethesda', 'chevy chase'], coords: [38.91, -77.04], name: 'Washington DC', tz: 'America/New_York' },
  { keys: ['greenwich ct', 'stamford ct', 'westport ct', 'fairfield county', 'connecticut'], coords: [41.07, -73.63], name: 'Greenwich CT', tz: 'America/New_York' },
  { keys: ['new haven'], coords: [41.31, -72.92], name: 'New Haven', tz: 'America/New_York' },
  { keys: ['hartford'], coords: [41.76, -72.68], name: 'Hartford', tz: 'America/New_York' },
  { keys: ['providence'], coords: [41.82, -71.42], name: 'Providence', tz: 'America/New_York' },
  { keys: ['buffalo ny'], coords: [42.89, -78.88], name: 'Buffalo', tz: 'America/New_York' },
  { keys: ['rochester ny'], coords: [43.16, -77.61], name: 'Rochester', tz: 'America/New_York' },
  { keys: ['albany ny'], coords: [42.65, -73.76], name: 'Albany', tz: 'America/New_York' },
  { keys: ['pittsburgh'], coords: [40.44, -79.99], name: 'Pittsburgh', tz: 'America/New_York' },
  { keys: ['baltimore'], coords: [39.29, -76.61], name: 'Baltimore', tz: 'America/New_York' },
  { keys: ['richmond va'], coords: [37.54, -77.43], name: 'Richmond', tz: 'America/New_York' },
  // US — Southeast
  { keys: ['atlanta'], coords: [33.75, -84.39], name: 'Atlanta', tz: 'America/New_York' },
  { keys: ['miami', 'brickell', 'coral gables', 'fort lauderdale'], coords: [25.77, -80.19], name: 'Miami', tz: 'America/New_York' },
  { keys: ['charlotte'], coords: [35.23, -80.84], name: 'Charlotte', tz: 'America/New_York' },
  { keys: ['raleigh', 'durham nc', 'chapel hill', 'research triangle'], coords: [35.78, -78.64], name: 'Raleigh', tz: 'America/New_York' },
  { keys: ['nashville'], coords: [36.17, -86.78], name: 'Nashville', tz: 'America/Chicago' },
  { keys: ['new orleans'], coords: [29.95, -90.07], name: 'New Orleans', tz: 'America/Chicago' },
  { keys: ['memphis'], coords: [35.15, -90.05], name: 'Memphis', tz: 'America/Chicago' },
  { keys: ['jacksonville fl'], coords: [30.33, -81.66], name: 'Jacksonville', tz: 'America/New_York' },
  { keys: ['tampa', 'st. petersburg fl', 'clearwater fl'], coords: [27.95, -82.46], name: 'Tampa', tz: 'America/New_York' },
  { keys: ['orlando'], coords: [28.54, -81.38], name: 'Orlando', tz: 'America/New_York' },
  // US — Midwest
  { keys: ['chicago', 'chi-town', 'loop chicago', 'oak brook'], coords: [41.88, -87.63], name: 'Chicago', tz: 'America/Chicago' },
  { keys: ['minneapolis', 'saint paul mn', 'st paul mn', 'twin cities'], coords: [44.98, -93.27], name: 'Minneapolis', tz: 'America/Chicago' },
  { keys: ['detroit', 'ann arbor'], coords: [42.33, -83.05], name: 'Detroit', tz: 'America/Detroit' },
  { keys: ['cleveland'], coords: [41.50, -81.69], name: 'Cleveland', tz: 'America/New_York' },
  { keys: ['columbus oh', 'columbus, oh'], coords: [39.96, -82.99], name: 'Columbus', tz: 'America/New_York' },
  { keys: ['cincinnati'], coords: [39.10, -84.51], name: 'Cincinnati', tz: 'America/New_York' },
  { keys: ['indianapolis'], coords: [39.77, -86.16], name: 'Indianapolis', tz: 'America/Indiana/Indianapolis' },
  { keys: ['kansas city'], coords: [39.10, -94.58], name: 'Kansas City', tz: 'America/Chicago' },
  { keys: ['st louis', 'saint louis'], coords: [38.63, -90.20], name: 'St. Louis', tz: 'America/Chicago' },
  { keys: ['milwaukee'], coords: [43.04, -87.91], name: 'Milwaukee', tz: 'America/Chicago' },
  { keys: ['omaha'], coords: [41.26, -95.94], name: 'Omaha', tz: 'America/Chicago' },
  { keys: ['louisville'], coords: [38.25, -85.76], name: 'Louisville', tz: 'America/Kentucky/Louisville' },
  // US — South
  { keys: ['houston'], coords: [29.76, -95.37], name: 'Houston', tz: 'America/Chicago' },
  { keys: ['dallas', 'fort worth', 'dfw', 'plano tx', 'irving tx'], coords: [32.78, -96.80], name: 'Dallas', tz: 'America/Chicago' },
  { keys: ['austin'], coords: [30.27, -97.74], name: 'Austin', tz: 'America/Chicago' },
  { keys: ['san antonio'], coords: [29.42, -98.49], name: 'San Antonio', tz: 'America/Chicago' },
  // US — Mountain
  { keys: ['denver', 'boulder co'], coords: [39.74, -104.98], name: 'Denver', tz: 'America/Denver' },
  { keys: ['salt lake city', 'slc', 'provo ut'], coords: [40.76, -111.89], name: 'Salt Lake City', tz: 'America/Denver' },
  { keys: ['phoenix', 'scottsdale', 'tempe az', 'chandler az'], coords: [33.45, -112.07], name: 'Phoenix', tz: 'America/Phoenix' },
  { keys: ['tucson'], coords: [32.22, -110.97], name: 'Tucson', tz: 'America/Phoenix' },
  { keys: ['albuquerque'], coords: [35.08, -106.65], name: 'Albuquerque', tz: 'America/Denver' },
  { keys: ['las vegas'], coords: [36.17, -115.14], name: 'Las Vegas', tz: 'America/Los_Angeles' },
  // US — West Coast
  { keys: ['san francisco', 'sf ', 'bay area', 'financial district sf', 'embarcadero'], coords: [37.77, -122.42], name: 'San Francisco', tz: 'America/Los_Angeles' },
  { keys: ['silicon valley', 'palo alto', 'menlo park', 'redwood city', 'mountain view', 'cupertino', 'sunnyvale'], coords: [37.45, -122.18], name: 'Silicon Valley', tz: 'America/Los_Angeles' },
  { keys: ['san jose ca'], coords: [37.34, -121.89], name: 'San Jose', tz: 'America/Los_Angeles' },
  { keys: ['los angeles', ' la,', 'santa monica', 'beverly hills', 'west hollywood', 'century city', 'westwood ca'], coords: [34.05, -118.24], name: 'Los Angeles', tz: 'America/Los_Angeles' },
  { keys: ['san diego'], coords: [32.72, -117.16], name: 'San Diego', tz: 'America/Los_Angeles' },
  { keys: ['seattle', 'bellevue wa', 'kirkland wa', 'redmond wa'], coords: [47.61, -122.33], name: 'Seattle', tz: 'America/Los_Angeles' },
  { keys: ['portland or', 'portland, or'], coords: [45.52, -122.68], name: 'Portland', tz: 'America/Los_Angeles' },
  { keys: ['sacramento'], coords: [38.58, -121.49], name: 'Sacramento', tz: 'America/Los_Angeles' },
  // Canada
  { keys: ['toronto', 'bay street'], coords: [43.65, -79.38], name: 'Toronto', tz: 'America/Toronto' },
  { keys: ['montreal'], coords: [45.50, -73.57], name: 'Montreal', tz: 'America/Montreal' },
  { keys: ['vancouver bc', 'vancouver, bc'], coords: [49.28, -123.12], name: 'Vancouver', tz: 'America/Vancouver' },
  { keys: ['calgary'], coords: [51.05, -114.07], name: 'Calgary', tz: 'America/Edmonton' },
  // Europe
  { keys: ['london', 'city of london', 'canary wharf', 'mayfair'], coords: [51.51, -0.13], name: 'London', tz: 'Europe/London' },
  { keys: ['frankfurt', 'dusseldorf', 'munich'], coords: [50.11, 8.68], name: 'Frankfurt', tz: 'Europe/Berlin' },
  { keys: ['zurich', 'geneva'], coords: [47.38, 8.54], name: 'Zurich', tz: 'Europe/Zurich' },
  { keys: ['paris'], coords: [48.86, 2.35], name: 'Paris', tz: 'Europe/Paris' },
  { keys: ['amsterdam'], coords: [52.37, 4.90], name: 'Amsterdam', tz: 'Europe/Amsterdam' },
  { keys: ['milan'], coords: [45.46, 9.19], name: 'Milan', tz: 'Europe/Rome' },
  { keys: ['madrid'], coords: [40.42, -3.70], name: 'Madrid', tz: 'Europe/Madrid' },
  { keys: ['stockholm'], coords: [59.33, 18.07], name: 'Stockholm', tz: 'Europe/Stockholm' },
  // Asia-Pacific
  { keys: ['hong kong'], coords: [22.32, 114.17], name: 'Hong Kong', tz: 'Asia/Hong_Kong' },
  { keys: ['singapore'], coords: [1.35, 103.82], name: 'Singapore', tz: 'Asia/Singapore' },
  { keys: ['tokyo'], coords: [35.68, 139.69], name: 'Tokyo', tz: 'Asia/Tokyo' },
  { keys: ['sydney'], coords: [-33.87, 151.21], name: 'Sydney', tz: 'Australia/Sydney' },
  { keys: ['melbourne'], coords: [-37.81, 144.96], name: 'Melbourne', tz: 'Australia/Melbourne' },
  { keys: ['beijing'], coords: [39.91, 116.39], name: 'Beijing', tz: 'Asia/Shanghai' },
  { keys: ['shanghai'], coords: [31.23, 121.47], name: 'Shanghai', tz: 'Asia/Shanghai' },
  { keys: ['seoul'], coords: [37.57, 126.98], name: 'Seoul', tz: 'Asia/Seoul' },
  { keys: ['mumbai', 'bombay'], coords: [19.08, 72.88], name: 'Mumbai', tz: 'Asia/Kolkata' },
  // Middle East / Other
  { keys: ['dubai', 'abu dhabi'], coords: [25.20, 55.27], name: 'Dubai', tz: 'Asia/Dubai' },
  { keys: ['mexico city', 'cdmx'], coords: [19.43, -99.13], name: 'Mexico City', tz: 'America/Mexico_City' },
  { keys: ['sao paulo'], coords: [-23.55, -46.63], name: 'São Paulo', tz: 'America/Sao_Paulo' },
]

export function resolveCity(location) {
  if (!location) return null
  const loc = location.toLowerCase()
  // longest key match first to avoid 'la' matching 'atlanta'
  const sorted = [...CITIES].sort((a, b) =>
    Math.max(...b.keys.map(k => k.length)) - Math.max(...a.keys.map(k => k.length))
  )
  for (const city of sorted) {
    if (city.keys.some(k => loc.includes(k))) return city
  }
  return null
}
