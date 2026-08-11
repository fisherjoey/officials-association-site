'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useMemo, Suspense } from 'react'
import Link from 'next/link'
import Fuse, { IFuseOptions } from 'fuse.js'
import { ORG_NAME, ORG_SHORT_NAME, ORG_CITY, ORG_REGION, ORG_SPORT, ORG_LOCATION, ORG_FOUNDED_YEAR, ORG_MEMBER_COUNT } from '@/lib/siteConfig'

interface SearchItem {
  title: string
  description: string
  url: string
  category: string
  content: string
}

const searchableContent: SearchItem[] = [
  // === Accessible pages (linked via navigation buttons) ===
  {
    title: 'Home',
    description: `Welcome to ${ORG_NAME}`,
    url: '/',
    category: 'Main',
    content: `${ORG_NAME}. Join the ${ORG_SPORT} officiating community in ${ORG_CITY}. Become a Referee. View Training. Follow us on social media. Stay up to date with the latest from ${ORG_SHORT_NAME}.`
  },
  {
    title: `About ${ORG_SHORT_NAME}`,
    description: `Learn about ${ORG_NAME}, our mission, leadership, values, and history`,
    url: '/about',
    category: 'About',
    content: `${ORG_NAME}, serving ${ORG_CITY} since ${ORG_FOUNDED_YEAR}. Our Mission: To develop and maintain a strong community of ${ORG_SPORT} officials who demonstrate excellence, integrity, and professionalism in every game they officiate. We are committed to providing the highest quality officiating services to ${ORG_SPORT} programs throughout ${ORG_CITY} and surrounding areas. Our Values: Excellence - Striving for the highest standards in officiating through continuous improvement and professional development. Integrity - Maintaining fair and impartial judgment in every call, building trust with players, coaches, and fans. Development - Fostering continuous learning and growth for officials at all levels of experience. Community - Supporting ${ORG_SPORT} growth in ${ORG_CITY} and building strong relationships within the ${ORG_SPORT} community. Respect - Showing respect for the game, players, coaches, and fellow officials in all interactions. Leadership - Setting the standard for ${ORG_SPORT} officiating excellence in ${ORG_REGION} and beyond. What We Do: Comprehensive training programs for new officials. Ongoing professional development workshops. Mentorship programs pairing experienced officials with newcomers including the Blue Whistle Program. Annual rules clinics and certification courses. Game assignments for all levels of ${ORG_SPORT}. Support for ${ORG_SPORT} programs across ${ORG_CITY}. Maintain officiating standards and best practices. Liaison with our provincial and national governing bodies. ${ORG_NAME} was founded in ${ORG_FOUNDED_YEAR} by a group of people who saw that ${ORG_CITY} needed organised, professional officiating to keep pace with a growing ${ORG_SPORT} community. ${ORG_SHORT_NAME} now has around ${ORG_MEMBER_COUNT} active officials.`
  },
  {
    title: 'Become a Referee',
    description: `Join ${ORG_SHORT_NAME} as a ${ORG_SPORT} referee. Learn about requirements, training, benefits, and how to apply`,
    url: '/become-a-referee',
    category: 'Membership',
    content: `Join ${ORG_NAME}. Thank you for your interest in becoming a certified ${ORG_SPORT} official. Becoming an Active Official: Sign the Membership Agreement. Pay the annual dues. Attend a clinic for your level of experience. Purchase the correct referee jersey. Write the rules exam on an annual basis. The ${ORG_SHORT_NAME} season begins in September of each year with a New Officials course that runs in an online classroom in September and on-court sessions in October. These clinics are vital to anyone new to officiating as they cover the rules and mechanics of officiating and what expectations the association will have of you as a member. This course is geared towards those who have never officiated and is an excellent refresher for those getting back into officiating. Training Timeline: September New Officials Course online classroom sessions begin. October on-court training sessions and practical application. October to June active officiating season gain experience with game assignments. Benefits: Competitive Pay earn a per-game fee that scales with level division and location. Flexible Schedule choose your availability work as many or as few games as your schedule allows. Stay Active great way to stay physically fit while being involved in the sport you love. Career Advancement clear pathway from youth games to high school college and potentially professional levels. Community Impact make a positive difference in young athletes lives and help grow ${ORG_SPORT} in ${ORG_CITY}. Training and Support ongoing education mentorship programs and support from experienced officials.`
  },
  {
    title: 'Book Referees',
    description: `Request certified ${ORG_SPORT} officials for your games, leagues, and tournaments`,
    url: '/get-officials',
    category: 'Services',
    content: `${ORG_SHORT_NAME} Officiating Services. Request certified ${ORG_SPORT} officials for your games leagues and tournaments. ${ORG_SHORT_NAME} Officiating Services Agreement. ${ORG_NAME} is the officiating body serving ${ORG_CITY}. Our members are registered with the provincial and national bodies that sanction ${ORG_SPORT} in this region. Every member is trained assessed and certified against the national standard for ${ORG_SPORT} officials. Why Choose ${ORG_SHORT_NAME} Officials: Nationally certified and trained officials. Comprehensive insurance coverage. Professional game management. Consistent rule interpretation and application. Ongoing performance evaluation and development. Our Services: Exhibition Games single games or small sets of games for tournaments showcases or special events. League Coverage complete season coverage for your ${ORG_SPORT} league with consistent officiating. Tournament Services full officiating services for tournaments of any size with experienced crews.`
  },
  {
    title: 'Blue Whistle Program',
    description: `Programme encouraging respectful treatment of new ${ORG_SPORT} officials`,
    url: '/new-officials',
    category: 'Membership',
    content: `When the whistle is blue the official is new. The Blue Whistle Program is an initiative encouraging respectful treatment of new ${ORG_SPORT} officials. New officials receive a distinctive blue whistle. When worn during games the easily identifiable whistle serves as a visual reminder for fans parents players and coaches that the official is new. This simple visual cue helps create a more supportive environment for officials who are just starting their journey encouraging patience and understanding from everyone involved in the game. Program Objectives: Create a safe supportive and respectful environment for new ${ORG_SPORT} referees. Eliminate aggressive behavior from players coaches and spectators. Promote professionalism fair play and adherence to the rules of ${ORG_SPORT}. Why This Program Matters: Retention new officials often leave the profession due to negative experiences a supportive environment helps retain valuable new referees. Development when officials feel supported they can focus on learning and improving rather than dealing with hostile environments. Community building a culture of respect benefits everyone players coaches parents and officials alike.`
  },
  {
    title: 'Contact Us',
    description: `Get in touch with ${ORG_NAME}. Send us a message and we will route it to the right team`,
    url: '/contact',
    category: 'Contact',
    content: `Have a question or need assistance? We're here to help. Get In Touch use the form below and we'll route your message to the right team. Response Time we typically respond within 1-2 business days. Location ${ORG_LOCATION}. Send Us a Message select a category below and we'll make sure your message reaches the right team.`
  },
  {
    title: 'Training & Certification',
    description: `Officials Certification Program. Your pathway to becoming a certified ${ORG_SPORT} official`,
    url: '/training',
    category: 'Training',
    content: `Training and Certification Program. Your pathway to becoming a certified ${ORG_SPORT} official. The Officials Certification Program standardises official development nationally ensuring consistent quality and professionalism in ${ORG_SPORT} officiating. As a member of ${ORG_NAME} you'll progress through a structured certification pathway that develops your skills from entry-level to potentially international competitions. Program Highlights: 5 certification levels from entry to international. Comprehensive training combining online and practical components. Standardized evaluation and progression criteria. Mentorship and continuous development opportunities. National recognition and a pathway to international officiating. Certification Levels: Level 1 Entry Level Official foundation level for new officials youth recreational leagues elementary school. Level 2 Community Level Official certified for community and school ${ORG_SPORT} junior high community leagues youth competitive. Level 3 Provincial Level Official qualified for high school and club ${ORG_SPORT} high school varsity club junior college. Level 4 National Level Official elite level for university and national competitions. Level 5 International Official certification for global competitions. Exam rules test on-court evaluation mechanics course provincial camp national training camp. Registration Deadline August 31. Season Start September. Mid-Season Evaluations January. Provincial Championships March. Study Materials: official rules national modifications and ${ORG_SHORT_NAME} local interpretations. Mechanics demonstrations game situation analysis signal tutorials. Sample exams rules quizzes scenario-based questions.`
  },

  // === Routes not currently accessible via navigation buttons ===
  // {
  //   title: 'Training Schedule',
  //   description: 'View upcoming training sessions, clinics, and workshops schedule',
  //   url: '/training/schedule',
  //   category: 'Training',
  //   content: ''
  // },
  // {
  //   title: 'Resources',
  //   description: 'Official rules, forms, documents, and referee resources',
  //   url: '/resources',
  //   category: 'Resources',
  //   content: ''
  // },
  // {
  //   title: 'News & Updates',
  //   description: 'Latest news, announcements, and updates',
  //   url: '/news',
  //   category: 'News',
  //   content: ''
  // },
  // {
  //   title: 'International Rules',
  //   description: 'Official international rules and regulations',
  //   url: '/resources',
  //   category: 'Resources',
  //   content: ''
  // },
  // {
  //   title: 'National Rules',
  //   description: 'National governing body rules and guidelines',
  //   url: '/resources',
  //   category: 'Resources',
  //   content: ''
  // },
  // {
  //   title: 'Referee Evaluation Forms',
  //   description: 'Performance evaluation forms for basketball referees',
  //   url: '/resources',
  //   category: 'Resources',
  //   content: ''
  // },
  // {
  //   title: 'Game Assignments',
  //   description: 'How game assignments work',
  //   url: '/resources',
  //   category: 'Resources',
  //   content: ''
  // },
  // {
  //   title: 'Code of Conduct',
  //   description: 'Professional standards and code of conduct for referees',
  //   url: '/resources',
  //   category: 'Resources',
  //   content: ''
  // },
]

const fuseOptions: IFuseOptions<SearchItem> = {
  keys: [
    { name: 'title', weight: 3 },
    { name: 'description', weight: 2 },
    { name: 'category', weight: 1 },
    { name: 'content', weight: 1 },
  ],
  threshold: 0.4,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
}

function SearchContent() {
  const searchParams = useSearchParams()
  const query = searchParams.get('q') || ''
  const [isLoading, setIsLoading] = useState(true)

  const fuse = useMemo(() => new Fuse(searchableContent, fuseOptions), [])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const fuseResults = fuse.search(query.trim())
    // Deduplicate by URL — keep the highest-ranked result per page
    const seen = new Set<string>()
    return fuseResults
      .filter(r => {
        if (seen.has(r.item.url)) return false
        seen.add(r.item.url)
        return true
      })
      .map(r => r.item)
  }, [query, fuse])

  useEffect(() => {
    setIsLoading(true)
    const timer = setTimeout(() => setIsLoading(false), 200)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-brand-dark mb-6">
            Search Results
          </h1>

          {query && (
            <div className="mb-8">
              <p className="text-gray-600">
                Showing results for: <span className="font-semibold text-brand-dark">&ldquo;{query}&rdquo;</span>
              </p>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-secondary"></div>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-6">
              {results.map((result, index) => (
                <Link
                  key={index}
                  href={result.url}
                  className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h2 className="text-xl font-semibold text-brand-dark hover:text-brand-secondary transition-colors">
                      {result.title}
                    </h2>
                    <span className="text-xs bg-brand-primary text-white px-2 py-1 rounded-full whitespace-nowrap ml-3">
                      {result.category}
                    </span>
                  </div>
                  <p className="text-gray-600 line-clamp-2">
                    {result.description}
                  </p>
                  <p className="text-sm text-brand-secondary mt-2">
                    {result.url}
                  </p>
                </Link>
              ))}
            </div>
          ) : query ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">No results found</h2>
              <p className="text-gray-500">
                We couldn&apos;t find any results for &ldquo;{query}&rdquo;. Try searching with different keywords.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Start searching</h2>
              <p className="text-gray-500">
                Use the search bar above to find information about {ORG_SHORT_NAME}, training, resources, and more.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-brand-dark mb-6">
              Search Results
            </h1>
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-secondary"></div>
            </div>
          </div>
        </div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  )
}
